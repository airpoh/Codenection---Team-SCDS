from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, EmailStr, Field
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from config import settings
from config import (
    SUPABASE_URL, ANON_KEY, SERVICE_KEY, JWT_SECRET,
    ALLOWED_EMAIL_DOMAIN, FRONTEND_RESET_URL
)
import logging

router = APIRouter(prefix="", tags=["core"])
logger = logging.getLogger(__name__)


# --- Schemas matching your UI ---
class SignUpIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: EmailStr
    password: str = Field(min_length=8)
    confirm_password: str = Field(min_length=8)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr  # Only email needed for forgot password

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    token: str = Field(min_length=6, max_length=6)  # 6-digit OTP

class ResetPasswordWithOTPRequest(BaseModel):
    email: EmailStr
    token: str = Field(min_length=6, max_length=6)  # 6-digit OTP
    password: str = Field(min_length=6)
    confirm_password: str = Field(min_length=6)

# --- Helpers ---
def _require_bearer(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    return authorization.split(" ", 1)[1]
    
def verify_supabase_jwt(token: str):
    from jose import jwt, JWTError
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},   # <-- add this
            # OR: audience="authenticated",
        )
        uid = payload.get("sub")
        email = payload.get("email")
        if not uid:
            raise HTTPException(401, "Invalid token: missing sub")
        return {"id": uid, "email": email, "claims": payload}
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

# REMOVED: All HTTP helper functions migrated to SupabaseService for standardization

# --- Routes ---
@router.get("/health")
async def health():
    return {"ok": True}

@router.post("/auth/sign-up")
async def sign_up(body: SignUpIn):
    # 1) basic checks that match your Sign Up screen
    if body.password != body.confirm_password:
        raise HTTPException(400, "Passwords do not match")
    email = body.email.lower().strip()

    # Only allow Malaysian educational institutions (.edu.my)
    if not email.endswith(".edu.my"):
        raise HTTPException(400, "Only Malaysian educational institution emails (.edu.my) are allowed")

    # 2) create user in Supabase Auth (server-side) - Keep using Supabase Auth API
    from services.supabase_client import get_supabase_service
    supabase_service = get_supabase_service()

    user = await supabase_service.admin_create_user(body.name.strip(), email, body.password)
    uid = user.get("id")

    # 3) create the profile row - MIGRATED: using SQLAlchemy
    from models import db, Profile, SmartAccountInfo
    session = db()
    try:
        # Create profile using SQLAlchemy
        new_profile = Profile(
            id=uid,
            name=body.name.strip(),
            email=email,
            campus_verified=False,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        session.add(new_profile)
        session.commit()
        session.refresh(new_profile)
        logger.info(f"Created profile for user {uid} using SQLAlchemy")

    except Exception as profile_error:
        session.rollback()
        logger.error(f"Failed to create profile for user {uid}: {profile_error}")
        raise HTTPException(status_code=500, detail="Failed to create user profile")
    finally:
        session.close()

    # 4) auto-create smart account for new user (Direct Python integration)
    try:
        from services.biconomy_direct import get_biconomy_direct_client
        from utils.crypto import encrypt_private_key
        import secrets

        # Generate a private key for the user's smart account
        private_key = "0x" + secrets.token_hex(32)

        # Create smart account via Biconomy (Direct Python)
        biconomy_client = get_biconomy_direct_client()
        logger.info(f"Attempting to create smart account for user {uid}")  # SECURITY: Never log private keys
        smart_account_result = await biconomy_client.create_smart_account(private_key)

        if smart_account_result.get("success"):
            # SECURITY: Encrypt private key before storing
            encrypted_private_key = encrypt_private_key(private_key)

            # Store smart account info in database - MIGRATED: using SQLAlchemy
            session = db()
            try:
                smart_account_info = SmartAccountInfo(
                    user_id=uid,
                    smart_account_address=smart_account_result.get("smartAccountAddress"),
                    signer_address=smart_account_result.get("ownerAddress"),  # Updated field name
                    encrypted_private_key=encrypted_private_key,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                session.add(smart_account_info)
                session.commit()
                logger.info(f"Auto-created smart account for new user {uid}: {smart_account_result.get('smartAccountAddress')}")
            except Exception as db_error:
                session.rollback()
                logger.warning(f"Failed to store smart account in DB: {db_error}")
            finally:
                session.close()
        else:
            logger.warning(f"Failed to auto-create smart account for user {uid}: {smart_account_result}")

    except Exception as e:
        logger.warning(f"Failed to auto-create smart account for user {uid}: {e}")
        # Don't fail registration if smart account creation fails

    # 5) optional: auto-login so app goes straight to Home/Island - Keep using Supabase Auth API
    session = await supabase_service.sign_in_user(email, body.password)
    return {
        "user_id": uid,
        "access_token": session.get("access_token"),
        "refresh_token": session.get("refresh_token"),
        "token_type": session.get("token_type", "bearer"),
        "expires_in": session.get("expires_in"),
        "user": session.get("user"),  # Add user object for frontend compatibility
    }

@router.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.lower().strip()
    # STANDARDIZED: using SupabaseService
    from services.supabase_client import get_supabase_service
    supabase_service = get_supabase_service()
    session = await supabase_service.sign_in_user(email, body.password)

    # Award login points (+5 coins) - runs in background, doesn't block login
    try:
        user_id = session.get("user", {}).get("id")
        if user_id:
            from routers.rewards import award_daily_action_points
            import asyncio

            # Award login points asynchronously (don't await - let it run in background)
            asyncio.create_task(award_daily_action_points(user_id, "login", None))
            logger.info(f"Login points task created for user {user_id}")
    except Exception as e:
        # Don't fail login if points awarding fails
        logger.warning(f"Failed to award login points: {e}")

    return {
        "access_token": session.get("access_token"),
        "refresh_token": session.get("refresh_token"),
        "token_type": session.get("token_type", "bearer"),
        "expires_in": session.get("expires_in"),
        "user": session.get("user"),
    }

@router.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    # STANDARDIZED: using SupabaseService
    # Fixed: Now only requires email, not password
    from services.supabase_client import get_supabase_service

    email = body.email.lower().strip()
    logger.info(f"Password reset requested for email: {email}")

    try:
        supabase_service = get_supabase_service()
        result = await supabase_service.send_password_reset(email, FRONTEND_RESET_URL)
        logger.info(f"Password reset email sent successfully to {email}")
        return {
            "success": True,
            "message": "If an account exists with this email, you will receive a password reset link shortly.",
            "email": email
        }
    except HTTPException as he:
        logger.error(f"HTTP error sending password reset to {email}: {he.detail}")
        # Don't reveal if email exists or not for security
        return {
            "success": True,
            "message": "If an account exists with this email, you will receive a password reset link shortly.",
            "email": email
        }
    except Exception as e:
        logger.error(f"Unexpected error sending password reset to {email}: {e}")
        # Don't reveal internal errors to user for security
        return {
            "success": True,
            "message": "If an account exists with this email, you will receive a password reset link shortly.",
            "email": email
        }

@router.post("/auth/verify-otp")
async def verify_otp(body: VerifyOTPRequest):
    """
    Verify OTP code sent to user's email.
    Returns access token if valid.
    """
    from services.supabase_client import get_supabase_service

    email = body.email.lower().strip()
    token = body.token.strip()

    logger.info(f"OTP verification requested for email: {email}")

    try:
        supabase_service = get_supabase_service()
        result = await supabase_service.verify_otp(email, token, type="recovery")

        logger.info(f"OTP verified successfully for {email}")
        return {
            "success": True,
            "message": "Code verified successfully",
            "access_token": result.get("access_token"),
            "refresh_token": result.get("refresh_token")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying OTP for {email}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to verify code. Please try again."
        )

@router.post("/auth/reset-password-otp")
async def reset_password_otp(body: ResetPasswordWithOTPRequest):
    """
    Reset password using OTP verification.
    Verifies the OTP and immediately resets the password.
    """
    from services.supabase_client import get_supabase_service

    email = body.email.lower().strip()
    token = body.token.strip()

    # Validate passwords match
    if body.password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    # Validate password length
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    logger.info(f"Password reset with OTP requested for email: {email}")

    try:
        supabase_service = get_supabase_service()

        # Step 1: Verify OTP and get access token
        verify_result = await supabase_service.verify_otp(email, token, type="recovery")
        access_token = verify_result.get("access_token")

        if not access_token:
            raise HTTPException(
                status_code=400,
                detail="Failed to verify code. Please request a new one."
            )

        # Step 2: Reset password using the access token
        reset_result = await supabase_service.reset_password_with_token(access_token, body.password)

        logger.info(f"Password reset successfully for {email}")
        return {
            "success": True,
            "message": "Password reset successfully. You can now log in with your new password."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting password for {email}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to reset password. Please try again."
        )


@router.get("/health/vault")
async def vault_health_check() -> Dict[str, Any]:
    """
    Check HashiCorp Vault connectivity and authentication status.

    Returns:
        Health status including vault availability, authentication, and token expiry
    """
    if not settings.USE_VAULT:
        return {
            "status": "disabled",
            "message": "Vault integration is disabled (USE_VAULT=false)",
            "vault_enabled": False
        }

    try:
        from services.vault_service import get_vault_client

        vault = get_vault_client()

        # Check authentication
        is_authenticated = vault.is_authenticated()
        token_expiry = vault.get_token_expiry()

        if is_authenticated:
            time_until_expiry = None
            if token_expiry:
                time_until_expiry = (token_expiry - datetime.now()).total_seconds()

            return {
                "status": "healthy",
                "vault_enabled": True,
                "authenticated": True,
                "vault_address": settings.VAULT_ADDR,
                "token_expiry": token_expiry.isoformat() if token_expiry else None,
                "seconds_until_expiry": int(time_until_expiry) if time_until_expiry else None
            }
        else:
            return {
                "status": "unhealthy",
                "vault_enabled": True,
                "authenticated": False,
                "error": "Vault client not authenticated"
            }

    except Exception as e:
        logger.error(f"Vault health check failed: {e}")
        return {
            "status": "error",
            "vault_enabled": True,
            "authenticated": False,
            "error": str(e)
        }


