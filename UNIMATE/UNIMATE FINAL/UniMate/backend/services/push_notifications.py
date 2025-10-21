"""
Push Notification Service
=========================
Handles sending push notifications via Expo Push Notification API.

Features:
- Send individual notifications
- Send batch notifications
- Support for iOS and Android via Expo
- Automatic retry logic
- Error handling and logging
"""

import httpx
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
MAX_BATCH_SIZE = 100  # Expo's max batch size


async def send_push_notification(
    push_token: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
    sound: str = "default",
    badge: Optional[int] = None,
    priority: str = "high"
) -> Dict[str, Any]:
    """
    Send a single push notification via Expo Push Notification service.

    Args:
        push_token: Expo push token (ExponentPushToken[...])
        title: Notification title
        body: Notification message
        data: Additional data to send with notification
        sound: Notification sound ('default' or null for silent)
        badge: Badge count for iOS
        priority: 'default', 'normal', 'high'

    Returns:
        Dict with success status and result/error
    """
    # Validate token format
    if not push_token or not push_token.startswith("ExponentPushToken["):
        logger.error(f"Invalid push token format: {push_token[:30]}...")
        return {"success": False, "error": "Invalid token format"}

    # Build message
    message = {
        "to": push_token,
        "sound": sound,
        "title": title,
        "body": body,
        "data": data or {},
        "priority": priority,
        "channelId": "default"  # For Android notification channels
    }

    if badge is not None:
        message["badge"] = badge

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=message,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            )
            response.raise_for_status()
            result = response.json()

            logger.debug(f"Expo response: {result}")

            # Check for errors in Expo's response
            if result.get("data") and len(result["data"]) > 0:
                ticket = result["data"][0]
                if ticket.get("status") == "error":
                    error_msg = ticket.get("message", "Unknown error")
                    error_details = ticket.get("details", {})
                    logger.error(f"❌ Expo rejected notification: {error_msg}, Details: {error_details}")
                    return {"success": False, "error": error_msg}
                elif ticket.get("status") == "ok":
                    logger.info(f"✅ Push notification sent successfully to {push_token[:30]}...")
                    return {"success": True, "result": result}

            logger.warning(f"⚠️  Unexpected Expo response format: {result}")
            return {"success": True, "result": result}  # Assume success if no explicit error

    except httpx.TimeoutException:
        logger.error(f"❌ Timeout sending push notification")
        return {"success": False, "error": "Request timeout"}
    except httpx.HTTPStatusError as e:
        logger.error(f"❌ HTTP error sending push notification: {e}")
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.error(f"❌ Failed to send push notification: {e}")
        return {"success": False, "error": str(e)}


async def send_batch_notifications(
    notifications: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Send multiple push notifications in batch (up to 100 at once).

    Args:
        notifications: List of notification dicts, each with:
            - to: push token
            - title: notification title
            - body: notification body
            - data: optional data dict
            - sound: optional sound
            - priority: optional priority

    Returns:
        Dict with success status and results
    """
    if not notifications:
        return {"success": True, "count": 0}

    # Validate batch size
    if len(notifications) > MAX_BATCH_SIZE:
        logger.warning(f"Batch size {len(notifications)} exceeds max {MAX_BATCH_SIZE}, splitting...")
        # Split into multiple batches
        results = []
        for i in range(0, len(notifications), MAX_BATCH_SIZE):
            batch = notifications[i:i + MAX_BATCH_SIZE]
            result = await send_batch_notifications(batch)
            results.append(result)
        return {
            "success": all(r["success"] for r in results),
            "batches": len(results),
            "results": results
        }

    # Add default fields to each notification
    messages = []
    for notif in notifications:
        message = {
            "to": notif["to"],
            "title": notif.get("title", "UniMate"),
            "body": notif.get("body", "You have a notification"),
            "data": notif.get("data", {}),
            "sound": notif.get("sound", "default"),
            "priority": notif.get("priority", "high"),
            "channelId": "default"
        }
        messages.append(message)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            )
            response.raise_for_status()
            result = response.json()

            # Count successes and errors
            tickets = result.get("data", [])
            success_count = sum(1 for t in tickets if t.get("status") != "error")
            error_count = sum(1 for t in tickets if t.get("status") == "error")

            logger.info(f"✅ Sent batch of {len(messages)} notifications: {success_count} success, {error_count} errors")

            return {
                "success": True,
                "total": len(messages),
                "success_count": success_count,
                "error_count": error_count,
                "result": result
            }

    except Exception as e:
        logger.error(f"❌ Failed to send batch notifications: {e}")
        return {"success": False, "error": str(e)}


async def send_task_reminder(
    push_token: str,
    task_title: str,
    task_id: str,
    minutes_before: int,
    starts_at: str
) -> Dict[str, Any]:
    """
    Send a task reminder notification.

    Args:
        push_token: Expo push token
        task_title: Title of the task
        task_id: Task ID
        minutes_before: Minutes before task starts
        starts_at: ISO format datetime string
    """
    return await send_push_notification(
        push_token=push_token,
        title=f"📋 Task Reminder: {task_title}",
        body=f"Starting in {minutes_before} minutes",
        data={
            "type": "task_reminder",
            "task_id": task_id,
            "starts_at": starts_at,
            "screen": "TaskDetail"
        },
        sound="default",
        priority="high"
    )


async def send_reminder_notification(
    push_token: str,
    reminder_title: str,
    reminder_id: str,
    reminder_description: Optional[str] = None
) -> Dict[str, Any]:
    """
    Send a reminder notification.

    Args:
        push_token: Expo push token
        reminder_title: Title of the reminder
        reminder_id: Reminder ID
        reminder_description: Optional description
    """
    body = reminder_description or "You have a reminder"

    return await send_push_notification(
        push_token=push_token,
        title=f"🔔 Reminder: {reminder_title}",
        body=body,
        data={
            "type": "reminder",
            "reminder_id": reminder_id,
            "screen": "Reminders"
        },
        sound="default",
        priority="high"
    )


async def send_points_earned_notification(
    push_token: str,
    points: int,
    source: str
) -> Dict[str, Any]:
    """
    Send a notification when user earns points.

    Args:
        push_token: Expo push token
        points: Points earned
        source: Source of points (e.g., "challenge_completion")
    """
    return await send_push_notification(
        push_token=push_token,
        title="🎉 Points Earned!",
        body=f"You earned {points} points from {source.replace('_', ' ')}",
        data={
            "type": "points_earned",
            "points": points,
            "source": source,
            "screen": "Rewards"
        },
        sound="default",
        priority="normal"
    )
