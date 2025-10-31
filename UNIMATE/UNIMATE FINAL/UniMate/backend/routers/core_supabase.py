"""
Core Supabase authentication and user management.
Provides shared authentication dependencies and utilities.
"""

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer
from typing import Dict, Any
import logging

from services.supabase_client import supabase_service

logger = logging.getLogger(__name__)
security = HTTPBearer()

async def get_authenticated_user(token: str = Depends(security)) -> Dict[str, Any]:
    """Get current authenticated user from Supabase JWT token."""
    try:
        user_info = await supabase_service.verify_jwt_token(token.credentials)
        if not user_info or "sub" not in user_info:
            raise HTTPException(status_code=401, detail="Invalid token")
        # Add the raw token to the user info for service calls
        user_info["token"] = token.credentials
        return user_info
    except Exception as e:
        logger.error(f"Authentication failed: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

async def get_current_user_id(user: Dict[str, Any] = Depends(get_authenticated_user)) -> str:
    """Extract user ID from authenticated user."""
    return user["sub"]

async def get_current_user_email(user: Dict[str, Any] = Depends(get_authenticated_user)) -> str:
    """Extract user email from authenticated user."""
    return user.get("email", "")
