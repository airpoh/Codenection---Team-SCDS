"""
Notification Scheduler
======================
Background jobs that check for upcoming tasks/reminders and send push notifications.

Jobs:
- check_and_send_task_reminders(): Runs every 1 minute
- check_and_send_reminder_notifications(): Runs every 1 minute

These functions are called by APScheduler in app.py

NOTE: For production, consider adding `last_notification_sent_at` columns to Task and Reminder models
for persistent deduplication tracking across server restarts.
"""

from models import db, Task, Reminder, PushToken
from services.push_notifications import (
    send_task_reminder,
    send_reminder_notification
)
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import logging

logger = logging.getLogger(__name__)

# Use Malaysia timezone for accurate time comparisons
MALAYSIA_TZ = ZoneInfo("Asia/Kuala_Lumpur")

# ✅ In-memory tracking to prevent duplicate notifications within session
# Maps task/reminder ID to last notification timestamp
_task_notification_cache = {}
_reminder_notification_cache = {}

def _should_send_notification(cache_dict: dict, item_id: str, current_time: datetime) -> bool:
    """
    Check if enough time has passed since last notification for this item.
    Returns True if notification should be sent, False if too recent.
    """
    if item_id not in cache_dict:
        return True

    last_sent = cache_dict[item_id]
    time_since_last = (current_time - last_sent).total_seconds()

    # Only send if it's been at least 10 minutes since last notification
    return time_since_last >= 600

def _mark_notification_sent(cache_dict: dict, item_id: str, current_time: datetime):
    """Mark that a notification was sent for this item."""
    cache_dict[item_id] = current_time


async def check_and_send_task_reminders():
    """
    Check for upcoming tasks and send reminder notifications.

    This function runs every 1 minute and checks if any tasks are due for
    reminder notifications based on their remind_minutes_before setting.

    Uses a 5-minute lookback window to catch missed reminders due to scheduler delays.

    Example:
    - Task starts at 14:00, remind_minutes_before=30
    - Reminder should be sent at 13:30
    - If current time is between 13:25 and 13:31, send notification (if not already sent)
    """
    session = db()
    try:
        # Get current time in Malaysia timezone (timezone-aware)
        now = datetime.now(MALAYSIA_TZ)
        logger.debug(f"Checking task reminders at {now}")

        # Query all incomplete tasks with future start times
        tasks = session.query(Task).filter(
            Task.is_completed == False,
            Task.starts_at.isnot(None)
        ).all()

        notifications_sent = 0
        errors = 0

        for task in tasks:
            try:
                # Calculate when the reminder should be sent
                remind_minutes = task.remind_minutes_before or 30
                task_starts_at = task.starts_at

                # ✅ FIX: Database columns are DateTime(timezone=True), so task_starts_at is timezone-aware
                # If somehow it's naive (shouldn't happen), assume UTC
                if task_starts_at.tzinfo is None:
                    logger.warning(f"Task {task.id} has naive datetime, assuming UTC")
                    task_starts_at = task_starts_at.replace(tzinfo=ZoneInfo("UTC"))

                # Convert to Malaysia timezone for comparison
                task_starts_at_myt = task_starts_at.astimezone(MALAYSIA_TZ)

                # Calculate when the reminder should be sent
                reminder_time = task_starts_at_myt - timedelta(minutes=remind_minutes)

                # ✅ FIX: Use a 5-minute lookback window to handle scheduler delays
                # Check if reminder is due within the last 5 minutes or next 1 minute
                time_diff_seconds = (reminder_time - now).total_seconds()

                # Send if reminder time is within [-300, 60] seconds window (5 min past to 1 min future)
                if -300 <= time_diff_seconds <= 60:
                    # ✅ Check if we've already sent a notification for this task recently
                    task_id_str = str(task.id)
                    if not _should_send_notification(_task_notification_cache, task_id_str, now):
                        logger.debug(f"Skipping task {task.id} - notification sent recently")
                        continue

                    # Get user's active push tokens
                    push_tokens = session.query(PushToken).filter(
                        PushToken.profile_id == task.user_id,
                        PushToken.is_active == True
                    ).all()

                    if not push_tokens:
                        logger.debug(f"No push tokens for user {task.user_id}, skipping task {task.id}")
                        continue

                    # Send notification to all user's devices
                    for token in push_tokens:
                        result = await send_task_reminder(
                            push_token=token.push_token,
                            task_title=task.title,
                            task_id=str(task.id),
                            minutes_before=remind_minutes,
                            starts_at=task_starts_at.isoformat()
                        )

                        if result["success"]:
                            notifications_sent += 1
                            logger.info(f"✅ Sent task reminder for '{task.title}' to {token.device_type} device")
                        else:
                            errors += 1
                            logger.warning(f"❌ Failed to send task reminder: {result.get('error')}")

                    # ✅ Mark notification as sent (after attempting all devices)
                    if notifications_sent > 0:
                        _mark_notification_sent(_task_notification_cache, task_id_str, now)

            except Exception as task_error:
                errors += 1
                logger.error(f"❌ Error processing task {task.id}: {task_error}", exc_info=True)
                continue

        if notifications_sent > 0 or errors > 0:
            logger.info(f"📋 Task reminders: {notifications_sent} sent, {errors} errors")

    except Exception as e:
        logger.error(f"❌ Error in task reminder checker: {e}", exc_info=True)
    finally:
        session.close()


async def check_and_send_reminder_notifications():
    """
    Check for due reminders and send notifications.

    This function runs every 1 minute and checks if any reminders are due
    or overdue (within a 5-minute lookback window to handle scheduler delays).

    Handles:
    - One-time reminders (repeat_type='once')
    - Recurring reminders (daily, weekly, monthly)
    """
    session = db()
    try:
        # Get current time in Malaysia timezone (timezone-aware)
        now = datetime.now(MALAYSIA_TZ)
        logger.debug(f"Checking reminders at {now}")

        # ✅ FIX: Use a lookback window to catch missed reminders (resilient to scheduler delays)
        # Check for reminders due in the last 5 minutes OR next 1 minute
        five_minutes_ago = now - timedelta(minutes=5)
        one_minute_later = now + timedelta(minutes=1)

        # ✅ FIX: Query active reminders that are due (past or near future)
        # Database columns are DateTime(timezone=True), so comparison is timezone-aware
        reminders = session.query(Reminder).filter(
            Reminder.is_active == True,
            Reminder.reminder_time >= five_minutes_ago,
            Reminder.reminder_time < one_minute_later
        ).all()

        notifications_sent = 0
        errors = 0

        for reminder in reminders:
            try:
                # ✅ Check if we've already sent a notification for this reminder recently
                reminder_id_str = str(reminder.id)
                if not _should_send_notification(_reminder_notification_cache, reminder_id_str, now):
                    logger.debug(f"Skipping reminder {reminder.id} - notification sent recently")
                    continue

                # Get user's active push tokens
                push_tokens = session.query(PushToken).filter(
                    PushToken.profile_id == reminder.user_id,
                    PushToken.is_active == True
                ).all()

                if not push_tokens:
                    logger.debug(f"No push tokens for user {reminder.user_id}, skipping reminder {reminder.id}")
                    continue

                # Send notification to all user's devices
                sent_count = 0
                for token in push_tokens:
                    result = await send_reminder_notification(
                        push_token=token.push_token,
                        reminder_title=reminder.title,
                        reminder_id=str(reminder.id),
                        reminder_description=reminder.description
                    )

                    if result["success"]:
                        sent_count += 1
                        notifications_sent += 1
                        logger.info(f"✅ Sent reminder notification for '{reminder.title}' to {token.device_type} device")
                    else:
                        errors += 1
                        logger.warning(f"❌ Failed to send reminder notification: {result.get('error')}")

                # ✅ Mark notification as sent (after attempting all devices)
                if sent_count > 0:
                    _mark_notification_sent(_reminder_notification_cache, reminder_id_str, now)

                # Handle recurring reminders - reschedule for next occurrence
                if reminder.repeat_type != 'once':
                    await reschedule_recurring_reminder(reminder, session)
                else:
                    # Deactivate one-time reminders after sending
                    reminder.is_active = False
                    logger.info(f"Deactivated one-time reminder {reminder.id}")

            except Exception as reminder_error:
                errors += 1
                logger.error(f"❌ Error processing reminder {reminder.id}: {reminder_error}", exc_info=True)
                continue

        # Commit changes (deactivated one-time reminders, rescheduled recurring)
        session.commit()

        if notifications_sent > 0 or errors > 0:
            logger.info(f"🔔 Reminders: {notifications_sent} sent, {errors} errors")

    except Exception as e:
        logger.error(f"❌ Error in reminder notification checker: {e}", exc_info=True)
        session.rollback()
    finally:
        session.close()


async def reschedule_recurring_reminder(reminder: Reminder, session):
    """
    Reschedule a recurring reminder for its next occurrence.

    Args:
        reminder: Reminder object to reschedule
        session: Database session
    """
    try:
        current_time = reminder.reminder_time

        if reminder.repeat_type == 'daily':
            next_time = current_time + timedelta(days=1)
        elif reminder.repeat_type == 'weekly':
            next_time = current_time + timedelta(weeks=1)
        elif reminder.repeat_type == 'monthly':
            # Add 30 days for simplicity (can be improved with dateutil)
            next_time = current_time + timedelta(days=30)
        else:
            logger.warning(f"Unknown repeat_type '{reminder.repeat_type}' for reminder {reminder.id}")
            return

        reminder.reminder_time = next_time
        logger.info(f"Rescheduled {reminder.repeat_type} reminder {reminder.id} to {next_time}")

    except Exception as e:
        logger.error(f"Failed to reschedule reminder {reminder.id}: {e}")
