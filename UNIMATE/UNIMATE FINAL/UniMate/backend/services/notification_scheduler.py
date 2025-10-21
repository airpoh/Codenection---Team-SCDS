"""
Notification Scheduler
======================
Background jobs that check for upcoming tasks/reminders and send push notifications.

Jobs:
- check_and_send_task_reminders(): Runs every 1 minute
- check_and_send_reminder_notifications(): Runs every 1 minute

These functions are called by APScheduler in app.py
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


async def check_and_send_task_reminders():
    """
    Check for upcoming tasks and send reminder notifications.

    This function runs every 1 minute and checks if any tasks are due for
    reminder notifications based on their remind_minutes_before setting.

    Example:
    - Task starts at 14:00, remind_minutes_before=30
    - Reminder should be sent at 13:30
    - If current time is between 13:30:00 and 13:30:59, send notification
    """
    session = db()
    try:
        # Get current time in Malaysia timezone
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

                # Ensure starts_at has timezone info
                if task_starts_at.tzinfo is None:
                    task_starts_at = task_starts_at.replace(tzinfo=ZoneInfo("UTC"))

                # Convert to Malaysia timezone
                task_starts_at_myt = task_starts_at.astimezone(MALAYSIA_TZ)

                # Calculate reminder time
                reminder_time = task_starts_at_myt - timedelta(minutes=remind_minutes)

                # Check if we should send notification now (within 1 minute window)
                # This accounts for the 1-minute interval of our scheduler
                time_diff_seconds = (reminder_time - now).total_seconds()

                # Send only if reminder time has passed (within last 60 seconds)
                # This prevents sending the same notification multiple times
                if -60 <= time_diff_seconds <= 0:  # Only send if time has arrived (within last minute)
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
    within the current minute.

    Handles:
    - One-time reminders (repeat_type='once')
    - Recurring reminders (daily, weekly, monthly)
    """
    session = db()
    try:
        # Get current time in Malaysia timezone
        now = datetime.now(MALAYSIA_TZ)
        logger.debug(f"Checking reminders at {now}")

        # Find reminders due in the next 1 minute window
        one_minute_later = now + timedelta(minutes=1)

        # Query active reminders due soon
        reminders = session.query(Reminder).filter(
            Reminder.is_active == True,
            Reminder.reminder_time >= now,
            Reminder.reminder_time < one_minute_later
        ).all()

        notifications_sent = 0
        errors = 0

        for reminder in reminders:
            try:
                # Get user's active push tokens
                push_tokens = session.query(PushToken).filter(
                    PushToken.profile_id == reminder.user_id,
                    PushToken.is_active == True
                ).all()

                if not push_tokens:
                    logger.debug(f"No push tokens for user {reminder.user_id}, skipping reminder {reminder.id}")
                    continue

                # Send notification to all user's devices
                for token in push_tokens:
                    result = await send_reminder_notification(
                        push_token=token.push_token,
                        reminder_title=reminder.title,
                        reminder_id=str(reminder.id),
                        reminder_description=reminder.description
                    )

                    if result["success"]:
                        notifications_sent += 1
                        logger.info(f"✅ Sent reminder notification for '{reminder.title}' to {token.device_type} device")
                    else:
                        errors += 1
                        logger.warning(f"❌ Failed to send reminder notification: {result.get('error')}")

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
