"""
Helper functions to add activity logging to rewards endpoints
This script provides reusable functions for logging user activities
"""

import sys
sys.path.insert(0, '/Users/quanpin/Desktop/UniMate-hackathon/UniMate/backend')

from datetime import datetime
import logging
import uuid

logger = logging.getLogger(__name__)

# Use SQLAlchemy ORM instead of Supabase client
try:
    from models import ActivityLog, SessionLocal
    ORM_AVAILABLE = True
except ImportError:
    logger.warning("ActivityLog model not available, activity logging disabled")
    ORM_AVAILABLE = False


def log_activity(
    profile_id: str,
    activity_type: str,
    amount: int = None,
    smart_account_address: str = None,
    transaction_hash: str = None,
    status: str = "success",
    details: dict = None
):
    """
    Log user activity to activity_logs table using SQLAlchemy ORM

    Args:
        profile_id: User's profile UUID
        activity_type: Type of activity (voucher_redemption, points_earned, etc.)
        amount: Points or token amount
        smart_account_address: Blockchain wallet address
        transaction_hash: Blockchain transaction hash
        status: success, failed, pending
        details: Additional JSON data specific to the activity

    Returns:
        bool: True if logged successfully, False otherwise
    """
    if not ORM_AVAILABLE:
        logger.warning(f"⚠️  ORM not available, skipping activity log: {activity_type}")
        return False

    session = SessionLocal()
    try:
        # Create ActivityLog ORM object
        activity = ActivityLog(
            id=str(uuid.uuid4()),
            profile_id=profile_id,
            activity_type=activity_type,
            amount=amount,
            smart_account_address=smart_account_address,
            transaction_hash=transaction_hash,
            status=status,
            details=details,
            created_at=datetime.now()
        )

        session.add(activity)
        session.commit()

        logger.info(f"✅ Logged activity: {activity_type} for user {profile_id}")
        return True

    except Exception as e:
        session.rollback()
        logger.error(f"❌ Failed to log activity {activity_type}: {e}")
        return False
    finally:
        session.close()


def log_voucher_redemption(
    profile_id: str,
    voucher_id: str,
    voucher_title: str,
    points_spent: int,
    redemption_code: str,
    transaction_hash: str = None,
    smart_account_address: str = None,
    status: str = "success"
):
    """Log voucher redemption activity"""
    return log_activity(
        profile_id=profile_id,
        activity_type="voucher_redemption",
        amount=points_spent,
        smart_account_address=smart_account_address,
        transaction_hash=transaction_hash,
        status=status,
        details={
            "voucher_id": voucher_id,
            "voucher_title": voucher_title,
            "redemption_code": redemption_code,
            "points_spent": points_spent
        }
    )


def log_points_earned(
    profile_id: str,
    points_earned: int,
    source: str,
    description: str,
    transaction_hash: str = None,
    smart_account_address: str = None,
    task_id: str = None,
    challenge_id: str = None
):
    """Log points earned activity"""
    details = {
        "source": source,
        "description": description,
        "points_earned": points_earned
    }

    if task_id:
        details["task_id"] = task_id
    if challenge_id:
        details["challenge_id"] = challenge_id

    return log_activity(
        profile_id=profile_id,
        activity_type="points_earned",
        amount=points_earned,
        smart_account_address=smart_account_address,
        transaction_hash=transaction_hash,
        status="success",
        details=details
    )


def log_challenge_completed(
    profile_id: str,
    challenge_id: str,
    challenge_name: str,
    points_earned: int = 0,
    duration_sec: int = None
):
    """Log challenge completion activity"""
    details = {
        "challenge_id": challenge_id,
        "challenge_name": challenge_name,
        "points_earned": points_earned
    }

    if duration_sec:
        details["duration_sec"] = duration_sec

    return log_activity(
        profile_id=profile_id,
        activity_type="challenge_completed",
        amount=points_earned,
        status="success",
        details=details
    )


def log_points_exchanged(
    profile_id: str,
    points_exchanged: int,
    well_tokens: float,
    transaction_hash: str = None,
    smart_account_address: str = None
):
    """Log points → WELL tokens exchange"""
    return log_activity(
        profile_id=profile_id,
        activity_type="points_exchanged",
        amount=points_exchanged,
        smart_account_address=smart_account_address,
        transaction_hash=transaction_hash,
        status="success",
        details={
            "points_exchanged": points_exchanged,
            "well_tokens_received": well_tokens,
            "exchange_rate": "100 points = 1 WELL token"
        }
    )


def log_task_created(profile_id: str, task_id: str, task_title: str, category: str = None):
    """Log task creation activity"""
    return log_activity(
        profile_id=profile_id,
        activity_type="task_created",
        status="success",
        details={
            "task_id": task_id,
            "task_title": task_title,
            "category": category
        }
    )


def log_mood_updated(profile_id: str, mood: str, notes: str = None):
    """Log mood update activity"""
    details = {"mood": mood}
    if notes:
        details["notes"] = notes

    return log_activity(
        profile_id=profile_id,
        activity_type="mood_updated",
        status="success",
        details=details
    )


def get_user_activity_logs(profile_id: str, limit: int = 20, activity_type: str = None):
    """
    Get user's activity logs using SQLAlchemy ORM

    Args:
        profile_id: User's profile UUID
        limit: Number of logs to retrieve
        activity_type: Filter by specific activity type

    Returns:
        list: List of activity log records as dicts
    """
    if not ORM_AVAILABLE:
        logger.warning("⚠️  ORM not available, cannot retrieve activity logs")
        return []

    session = SessionLocal()
    try:
        query = session.query(ActivityLog).filter(ActivityLog.profile_id == profile_id)

        if activity_type:
            query = query.filter(ActivityLog.activity_type == activity_type)

        query = query.order_by(ActivityLog.created_at.desc()).limit(limit)

        results = query.all()

        # Convert ORM objects to dicts
        logs = []
        for log in results:
            logs.append({
                "id": log.id,
                "profile_id": log.profile_id,
                "activity_type": log.activity_type,
                "amount": log.amount,
                "smart_account_address": log.smart_account_address,
                "transaction_hash": log.transaction_hash,
                "status": log.status,
                "details": log.details,
                "created_at": log.created_at.isoformat() if log.created_at else None
            })

        logger.info(f"✅ Retrieved {len(logs)} activity logs for user {profile_id}")
        return logs

    except Exception as e:
        logger.error(f"❌ Failed to get activity logs: {e}")
        return []
    finally:
        session.close()


if __name__ == "__main__":
    # Test the logging functions
    print("Testing activity logging functions...")

    test_user_id = "test-user-123"

    # Test voucher redemption logging
    log_voucher_redemption(
        profile_id=test_user_id,
        voucher_id="food_starbucks_10",
        voucher_title="Starbucks RM10 Voucher",
        points_spent=500,
        redemption_code="UNI-TEST-ABC123"
    )

    # Test points earned logging
    log_points_earned(
        profile_id=test_user_id,
        points_earned=100,
        source="task_completion",
        description="Completed 3 tasks today"
    )

    # Retrieve logs
    logs = get_user_activity_logs(test_user_id, limit=10)
    print(f"\nRetrieved {len(logs)} activity logs for test user")
    for log in logs:
        print(f"  - {log['activity_type']}: {log.get('amount', 0)} points")
