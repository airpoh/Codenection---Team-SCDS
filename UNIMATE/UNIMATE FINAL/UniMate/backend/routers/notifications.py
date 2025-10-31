"""
Push Notifications Router
==========================
API endpoints for managing push notification tokens and sending notifications.

Endpoints:
- POST /notifications/register-token: Register device push token
- DELETE /notifications/unregister-token: Unregister device tokens
- GET /notifications/test: Send test notification (development only)
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
from models import db, PushToken, Profile
from routers.core_supabase import get_authenticated_user
from services.push_notifications import send_push_notification
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["Push Notifications"])


# ===================================================================
# REQUEST/RESPONSE MODELS
# ===================================================================

class RegisterPushTokenRequest(BaseModel):
    """Request to register a push notification token"""
    push_token: str
    device_type: str  # 'ios' or 'android'
    device_name: Optional[str] = None  # Optional device name/model


class TestNotificationRequest(BaseModel):
    """Request to send a test notification"""
    title: str = "Test Notification"
    body: str = "This is a test notification from UniMate"


# ===================================================================
# ENDPOINTS
# ===================================================================

@router.post("/register-token")
async def register_push_token(
    request: RegisterPushTokenRequest,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """
    Register or update user's push notification token.

    This endpoint should be called when:
    - User opens the app for the first time
    - App is reinstalled
    - Push token changes (rare but possible)
    """
    user_id = user["sub"]
    session = db()

    try:
        # Validate token format
        if not request.push_token.startswith("ExponentPushToken["):
            raise HTTPException(400, "Invalid Expo push token format")

        # Validate device type
        if request.device_type not in ["ios", "android"]:
            raise HTTPException(400, "device_type must be 'ios' or 'android'")

        # Check if this exact token already exists
        existing_token = session.query(PushToken).filter(
            PushToken.push_token == request.push_token
        ).first()

        if existing_token:
            # Update existing token (user might have logged in on same device)
            existing_token.profile_id = user_id
            existing_token.device_type = request.device_type
            existing_token.device_name = request.device_name
            existing_token.is_active = True
            logger.info(f"✅ Updated existing push token for user {user_id}")
        else:
            # Create new token
            new_token = PushToken(
                profile_id=user_id,
                push_token=request.push_token,
                device_type=request.device_type,
                device_name=request.device_name,
                is_active=True
            )
            session.add(new_token)
            logger.info(f"✅ Registered new push token for user {user_id} ({request.device_type})")

        session.commit()

        return {
            "success": True,
            "message": "Push token registered successfully",
            "device_type": request.device_type
        }

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"❌ Failed to register push token: {e}")
        raise HTTPException(500, "Failed to register push token")
    finally:
        session.close()


@router.delete("/unregister-token")
async def unregister_push_token(
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """
    Unregister/deactivate all push notification tokens for the current user.

    This should be called when:
    - User logs out
    - User disables notifications in settings
    """
    user_id = user["sub"]
    session = db()

    try:
        # Deactivate all tokens for this user
        updated_count = session.query(PushToken).filter(
            PushToken.profile_id == user_id,
            PushToken.is_active == True
        ).update({"is_active": False})

        session.commit()

        logger.info(f"✅ Unregistered {updated_count} push tokens for user {user_id}")

        return {
            "success": True,
            "message": f"Unregistered {updated_count} device(s)",
            "count": updated_count
        }

    except Exception as e:
        session.rollback()
        logger.error(f"❌ Failed to unregister push tokens: {e}")
        raise HTTPException(500, "Failed to unregister push tokens")
    finally:
        session.close()


@router.get("/registered-devices")
async def get_registered_devices(
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """
    Get list of registered devices for the current user.
    """
    user_id = user["sub"]
    session = db()

    try:
        tokens = session.query(PushToken).filter(
            PushToken.profile_id == user_id,
            PushToken.is_active == True
        ).all()

        devices = []
        for token in tokens:
            devices.append({
                "id": str(token.id),
                "device_type": token.device_type,
                "device_name": token.device_name,
                "registered_at": token.created_at.isoformat() if token.created_at else None
            })

        return {
            "success": True,
            "devices": devices,
            "count": len(devices)
        }

    except Exception as e:
        logger.error(f"❌ Failed to get registered devices: {e}")
        raise HTTPException(500, "Failed to retrieve registered devices")
    finally:
        session.close()


@router.post("/test")
async def send_test_notification(
    request: TestNotificationRequest,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """
    Send a test notification to the current user's registered devices.

    **Development/Testing only** - helps verify notification setup.
    """
    user_id = user["sub"]
    session = db()

    try:
        # Get user's active push tokens
        push_tokens = session.query(PushToken).filter(
            PushToken.profile_id == user_id,
            PushToken.is_active == True
        ).all()

        if not push_tokens:
            raise HTTPException(404, "No registered devices found. Please register a push token first.")

        # Send test notification to all devices
        results = []
        for token in push_tokens:
            result = await send_push_notification(
                push_token=token.push_token,
                title=request.title,
                body=request.body,
                data={
                    "type": "test",
                    "timestamp": str(token.created_at)
                }
            )
            results.append({
                "device_type": token.device_type,
                "success": result["success"],
                "error": result.get("error")
            })

        success_count = sum(1 for r in results if r["success"])

        logger.info(f"✅ Sent test notification to {success_count}/{len(results)} devices for user {user_id}")

        return {
            "success": True,
            "message": f"Test notification sent to {success_count} device(s)",
            "results": results
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to send test notification: {e}")
        raise HTTPException(500, "Failed to send test notification")
    finally:
        session.close()
