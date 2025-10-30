"""
Supabase client service for UniMate backend.
Handles authentication, database operations, and user management.
"""

import httpx
import asyncio
from typing import Dict, Any, Optional, List
import logging
from jose import jwt, JWTError
from datetime import datetime, timezone, timedelta
import json
from fastapi import HTTPException

from config import settings

logger = logging.getLogger(__name__)

# Import database models
try:
    # Core models from models.py
    from models import get_db, Profile, Task, TrustedContact, EmergencyAlert, WellnessCheckin
    # Blockchain models from blockchain.py (single source of truth)
    from routers.blockchain import UserSmartAccount, TokenRedemption
    DATABASE_MODELS_AVAILABLE = True
except ImportError:
    DATABASE_MODELS_AVAILABLE = False
    logger.warning("Database models not available, using direct SQL queries")

class SupabaseService:
    """Service for interacting with Supabase"""

    def __init__(self):
        self.supabase_url = settings.SUPABASE_URL
        self.anon_key = settings.SUPABASE_ANON_KEY
        self.service_role_key = settings.SUPABASE_SERVICE_ROLE_KEY
        self.jwt_secret = settings.SUPABASE_JWT_SECRET
        self.client = httpx.AsyncClient(timeout=30.0)

    async def verify_jwt_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode JWT token from Supabase"""
        try:
            # Decode the JWT token
            payload = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False}  # Skip audience verification for flexibility
            )
            
            # Extract user information
            user_id = payload.get("sub")
            email = payload.get("email")
            
            if not user_id:
                logger.error("Token missing 'sub' claim")
                return None
                
            return {
                "sub": user_id,
                "email": email,
                "claims": payload
            }
            
        except JWTError as e:
            logger.error(f"JWT verification failed: {e}")
            return None
        except Exception as e:
            logger.error(f"Token verification error: {e}")
            return None

    async def get_user_profile(self, user_id: str, access_token: str) -> Optional[Dict[str, Any]]:
        """Get user profile from Supabase"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            url = f"{self.supabase_url}/rest/v1/profiles?id=eq.{user_id}&select=*"
            response = await self.client.get(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                return data[0] if data else None
            else:
                logger.error(f"Failed to get user profile: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting user profile: {e}")
            return None

    async def update_user_profile(self, user_id: str, profile_data: Dict[str, Any], access_token: str) -> Optional[Dict[str, Any]]:
        """Update user profile in Supabase"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            
            # Add updated timestamp
            profile_data["updated_at"] = datetime.now(timezone.utc).isoformat()
            
            url = f"{self.supabase_url}/rest/v1/profiles?id=eq.{user_id}"
            response = await self.client.patch(url, headers=headers, json=profile_data)
            
            if response.status_code == 200:
                data = response.json()
                return data[0] if data else None
            else:
                logger.error(f"Failed to update user profile: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error updating user profile: {e}")
            return None

    async def create_user_profile(self, user_id: str, name: str, email: str) -> Optional[Dict[str, Any]]:
        """Create a new user profile"""
        try:
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            
            now = datetime.now(timezone.utc).isoformat()
            profile_data = {
                "id": user_id,
                "name": name,
                "email": email,
                "campus_verified": email.endswith(".edu.my"),
                "created_at": now,
                "updated_at": now
            }
            
            url = f"{self.supabase_url}/rest/v1/profiles"
            response = await self.client.post(url, headers=headers, json=profile_data)
            
            if response.status_code in [200, 201]:
                data = response.json()
                return data[0] if isinstance(data, list) and data else data
            else:
                logger.error(f"Failed to create user profile: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating user profile: {e}")
            return None

    async def store_user_smart_account(self, user_id: str, smart_account_address: str, signer_address: str, private_key: str = None) -> bool:
        """Store smart account information for a user"""
        try:
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            
            # Encrypt private key if provided
            encrypted_private_key = None
            if private_key:
                try:
                    from utils.crypto import encrypt_private_key
                    encrypted_private_key = encrypt_private_key(private_key)
                    logger.info("Private key encrypted successfully")
                except ImportError as e:
                    logger.warning(f"Crypto utils not available: {e}, private key not stored")
                except Exception as e:
                    logger.error(f"Failed to encrypt private key: {e}")
                    logger.info("Proceeding without encrypted private key")
            
            account_data = {
                "user_id": user_id,
                "smart_account_address": smart_account_address,
                "signer_address": signer_address,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "is_active": True
            }

            # Only add encrypted_private_key if we successfully encrypted it
            # Skip for now since the column doesn't exist in the database
            if encrypted_private_key:
                logger.info("Encrypted private key available but column doesn't exist in database schema")
                # account_data["encrypted_private_key"] = encrypted_private_key
            
            # First try to update existing record
            url = f"{self.supabase_url}/rest/v1/user_smart_accounts?user_id=eq.{user_id}"
            response = await self.client.patch(url, headers=headers, json=account_data)

            if response.status_code == 200:
                data = response.json()
                if data:  # Record updated
                    logger.info(f"Smart account updated for user {user_id}")
                    return True
            else:
                logger.warning(f"PATCH failed: {response.status_code} - {response.text}")

            # If no record exists, create new one
            url = f"{self.supabase_url}/rest/v1/user_smart_accounts"
            response = await self.client.post(url, headers=headers, json=account_data)

            if response.status_code in [200, 201]:
                logger.info(f"Smart account created for user {user_id}")
                return True
            else:
                logger.error(f"POST failed: {response.status_code} - {response.text}")
                return False
            
        except Exception as e:
            logger.error(f"Error storing smart account info: {e}")
            return False

    async def get_user_smart_account_info(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get smart account information for a user"""
        try:
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json"
            }
            
            url = f"{self.supabase_url}/rest/v1/user_smart_accounts?user_id=eq.{user_id}&select=*"
            response = await self.client.get(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                return data[0] if data else None
            else:
                logger.error(f"Failed to get smart account info: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting smart account info: {e}")
            return None

    async def get_user_private_key(self, user_id: str, access_token: str) -> Optional[str]:
        """Get decrypted private key for user's smart account"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }

            url = f"{self.supabase_url}/rest/v1/user_smart_accounts?user_id=eq.{user_id}&select=encrypted_private_key&limit=1"
            response = await self.client.get(url, headers=headers)

            if response.status_code == 200:
                data = response.json()
                if data and data[0].get("encrypted_private_key"):
                    try:
                        from utils.crypto import decrypt_private_key
                        return decrypt_private_key(data[0]["encrypted_private_key"])
                    except ImportError:
                        logger.error("Crypto utils not available for decryption")
                        return None
                    except Exception as e:
                        logger.error(f"Failed to decrypt private key: {e}")
                        return None
            return None

        except Exception as e:
            logger.error(f"Error getting user private key: {e}")
            return None

    async def log_token_redemption(self, user_id: str, amount: int, transaction_hash: Optional[str], success: bool) -> bool:
        """Log token redemption attempt"""
        try:
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json"
            }
            
            redemption_data = {
                "user_id": user_id,
                "amount": amount,
                "transaction_hash": transaction_hash,
                "success": success,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            url = f"{self.supabase_url}/rest/v1/token_redemptions"
            response = await self.client.post(url, headers=headers, json=redemption_data)
            
            return response.status_code in [200, 201]
            
        except Exception as e:
            logger.error(f"Error logging token redemption: {e}")
            return False

    async def get_user_tasks(
        self, 
        user_id: str, 
        access_token: str, 
        filters: Optional[Dict[str, Any]] = None,
        date_filter: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        kind_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get tasks for a user with enhanced filtering for Calendar"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            # Build query parameters
            query_params = [f"user_id=eq.{user_id}", "select=*", "order=starts_at.asc"]
            
            # Legacy filters support
            if filters:
                if "completed" in filters:
                    query_params.append(f"is_completed=eq.{filters['completed']}")
                if "priority" in filters:
                    query_params.append(f"priority=eq.{filters['priority']}")
                if "start_date" in filters:
                    query_params.append(f"starts_at=gte.{filters['start_date']}")
                if "end_date" in filters:
                    query_params.append(f"starts_at=lt.{filters['end_date']}")
            
            # New Calendar-specific filters
            if date_filter:
                # Query tasks for a specific date
                query_params.append(f"starts_at=gte.{date_filter}T00:00:00")
                query_params.append(f"starts_at=lt.{date_filter}T23:59:59")
            elif start_date and end_date:
                # Query tasks within a date range
                query_params.append(f"starts_at=gte.{start_date}T00:00:00")
                query_params.append(f"starts_at=lt.{end_date}T23:59:59")
            
            # Filter by task kind (event, reminder, etc.)
            if kind_filter:
                query_params.append(f"kind=eq.{kind_filter}")
            
            query_string = "&".join(query_params)
            url = f"{self.supabase_url}/rest/v1/tasks?{query_string}"
            
            response = await self.client.get(url, headers=headers)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to get user tasks: {response.status_code} - {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting user tasks: {e}")
            return []

    async def create_task(self, user_id: str, access_token: str, task_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create a new task"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            
            # Add user ID and timestamps
            task_data["user_id"] = user_id
            now = datetime.now(timezone.utc).isoformat()
            task_data["created_at"] = now
            task_data["updated_at"] = now
            
            url = f"{self.supabase_url}/rest/v1/tasks"
            response = await self.client.post(url, headers=headers, json=task_data)
            
            if response.status_code in [200, 201]:
                data = response.json()
                return data[0] if isinstance(data, list) and data else data
            else:
                logger.error(f"Failed to create task: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating task: {e}")
            return None

    # --- Lighthouse / Emergency Services ---
    
    async def get_trusted_contacts(self, user_id: str, access_token: str) -> List[Dict[str, Any]]:
        """Get trusted contacts for a user"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            url = f"{self.supabase_url}/rest/v1/trusted_contacts?user_id=eq.{user_id}&select=*&order=is_primary.desc,created_at.asc"
            response = await self.client.get(url, headers=headers)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to get trusted contacts: {response.status_code} - {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting trusted contacts: {e}")
            return []

    async def create_trusted_contact(self, contact_data: Dict[str, Any], access_token: str) -> Optional[Dict[str, Any]]:
        """Create a new trusted contact"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            
            # Add timestamps
            now = datetime.now(timezone.utc).isoformat()
            contact_data["created_at"] = now
            contact_data["updated_at"] = now
            
            url = f"{self.supabase_url}/rest/v1/trusted_contacts"
            response = await self.client.post(url, headers=headers, json=contact_data)
            
            if response.status_code in [200, 201]:
                data = response.json()
                return data[0] if isinstance(data, list) and data else data
            else:
                logger.error(f"Failed to create trusted contact: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating trusted contact: {e}")
            return None

    async def update_trusted_contact(self, contact_id: str, contact_data: Dict[str, Any], access_token: str) -> Optional[Dict[str, Any]]:
        """Update a trusted contact"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            
            # Add updated timestamp
            contact_data["updated_at"] = datetime.now(timezone.utc).isoformat()
            
            url = f"{self.supabase_url}/rest/v1/trusted_contacts?id=eq.{contact_id}"
            response = await self.client.patch(url, headers=headers, json=contact_data)
            
            if response.status_code == 200:
                data = response.json()
                return data[0] if data else None
            else:
                logger.error(f"Failed to update trusted contact: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error updating trusted contact: {e}")
            return None

    async def delete_trusted_contact(self, contact_id: str, access_token: str) -> bool:
        """Delete a trusted contact"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            url = f"{self.supabase_url}/rest/v1/trusted_contacts?id=eq.{contact_id}"
            response = await self.client.delete(url, headers=headers)
            
            return response.status_code in [200, 204]
                
        except Exception as e:
            logger.error(f"Error deleting trusted contact: {e}")
            return False

    async def create_emergency_alert(self, alert_data: Dict[str, Any], access_token: str) -> Optional[Dict[str, Any]]:
        """Create an emergency alert"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            
            # Add timestamps
            now = datetime.now(timezone.utc).isoformat()
            alert_data["created_at"] = now
            
            url = f"{self.supabase_url}/rest/v1/emergency_alerts"
            response = await self.client.post(url, headers=headers, json=alert_data)
            
            if response.status_code in [200, 201]:
                data = response.json()
                return data[0] if isinstance(data, list) and data else data
            else:
                logger.error(f"Failed to create emergency alert: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating emergency alert: {e}")
            return None

    async def get_emergency_alerts(self, user_id: str, access_token: str, status: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Get emergency alerts for a user"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            query_params = [f"user_id=eq.{user_id}", "select=*", f"limit={limit}", "order=created_at.desc"]
            
            if status:
                query_params.append(f"status=eq.{status}")
            
            query_string = "&".join(query_params)
            url = f"{self.supabase_url}/rest/v1/emergency_alerts?{query_string}"
            
            response = await self.client.get(url, headers=headers)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to get emergency alerts: {response.status_code} - {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting emergency alerts: {e}")
            return []

    async def update_emergency_alert(self, alert_id: str, update_data: Dict[str, Any], access_token: str) -> bool:
        """Update an emergency alert"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            url = f"{self.supabase_url}/rest/v1/emergency_alerts?id=eq.{alert_id}"
            response = await self.client.patch(url, headers=headers, json=update_data)
            
            return response.status_code == 200
                
        except Exception as e:
            logger.error(f"Error updating emergency alert: {e}")
            return False

    async def create_wellness_checkin(self, checkin_data: Dict[str, Any], access_token: str) -> Optional[Dict[str, Any]]:
        """Create a wellness check-in"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            
            # Add timestamps
            now = datetime.now(timezone.utc).isoformat()
            checkin_data["created_at"] = now
            if "timestamp" not in checkin_data:
                checkin_data["timestamp"] = now
            
            url = f"{self.supabase_url}/rest/v1/wellness_checkins"
            response = await self.client.post(url, headers=headers, json=checkin_data)
            
            if response.status_code in [200, 201]:
                data = response.json()
                return data[0] if isinstance(data, list) and data else data
            else:
                logger.error(f"Failed to create wellness check-in: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating wellness check-in: {e}")
            return None

    async def get_wellness_history(self, user_id: str, access_token: str, days: int = 30) -> List[Dict[str, Any]]:
        """Get wellness check-in history for a user"""
        try:
            headers = {
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            # Calculate date range
            from_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
            
            query_params = [
                f"user_id=eq.{user_id}",
                "select=*",
                f"timestamp=gte.{from_date}",
                "order=timestamp.desc"
            ]
            
            query_string = "&".join(query_params)
            url = f"{self.supabase_url}/rest/v1/wellness_checkins?{query_string}"
            
            response = await self.client.get(url, headers=headers)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to get wellness history: {response.status_code} - {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting wellness history: {e}")
            return []

    # AUTHENTICATION METHODS - Migrated from core.py for standardization
    async def admin_create_user(self, name: str, email: str, password: str) -> Dict[str, Any]:
        """Create user via Supabase Admin API"""
        url = f"{self.supabase_url}/auth/v1/admin/users"
        headers = {
            "Authorization": f"Bearer {self.service_role_key}",
            "apikey": self.service_role_key,
            "Content-Type": "application/json",
        }
        payload = {
            "email": email,
            "password": password,
            "email_confirm": True,  # for development speed
            "user_metadata": {"name": name},
        }

        try:
            response = await self.client.post(url, headers=headers, json=payload)
            if response.status_code >= 400:
                raise HTTPException(status_code=400, detail=response.text)
            return response.json()
        except Exception as e:
            logger.error(f"Failed to create user via admin API: {e}")
            raise HTTPException(status_code=500, detail="Failed to create user account")

    async def sign_in_user(self, email: str, password: str) -> Dict[str, Any]:
        """Authenticate user and get session tokens"""
        url = f"{self.supabase_url}/auth/v1/token?grant_type=password"
        headers = {"apikey": self.anon_key, "Content-Type": "application/json"}
        payload = {"email": email, "password": password}

        try:
            response = await self.client.post(url, headers=headers, json=payload)
            if response.status_code >= 400:
                raise HTTPException(status_code=401, detail="Invalid email or password")
            return response.json()
        except Exception as e:
            logger.error(f"Failed to sign in user: {e}")
            raise HTTPException(status_code=500, detail="Authentication failed")

    async def send_password_reset(self, email: str, redirect_url: str) -> Dict[str, Any]:
        """Send password reset email"""
        url = f"{self.supabase_url}/auth/v1/recover"
        headers = {"apikey": self.anon_key, "Content-Type": "application/json"}
        payload = {"email": email.lower().strip(), "redirect_to": redirect_url}

        try:
            logger.info(f"Sending password reset to Supabase for email: {email}")
            logger.debug(f"Reset URL: {redirect_url}")

            # Use longer timeout for email sending (60 seconds)
            async with httpx.AsyncClient(timeout=60.0) as email_client:
                response = await email_client.post(url, headers=headers, json=payload)

            logger.info(f"Supabase password reset response: status={response.status_code}")

            if response.status_code >= 400:
                error_detail = response.text
                logger.error(f"Supabase password reset failed: {response.status_code} - {error_detail}")
                # For security, don't reveal if email exists - always return success
                logger.info(f"Returning generic success message despite error for security")
                return {"success": True, "message": "Password reset email sent if account exists"}

            # Supabase returns 200 even if email doesn't exist (security best practice)
            logger.info(f"Password reset request accepted by Supabase for {email}")
            return {"success": True, "message": "Password reset email sent"}

        except httpx.ReadTimeout:
            logger.error(f"Timeout sending password reset email to {email}")
            # For security, still return success even on timeout
            return {"success": True, "message": "Password reset request received. If an account exists, email will be sent shortly."}
        except httpx.RequestError as e:
            logger.error(f"Network error sending password reset: {e}")
            # Return success for security, but log the error
            return {"success": True, "message": "Password reset request received"}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unexpected error in send_password_reset: {type(e).__name__}: {e}")
            # For security, return success even on unexpected errors
            return {"success": True, "message": "Password reset request received"}

    async def verify_otp(self, email: str, token: str, type: str = "recovery") -> Dict[str, Any]:
        """Verify OTP/recovery token"""
        url = f"{self.supabase_url}/auth/v1/verify"
        headers = {
            "apikey": self.anon_key,
            "Content-Type": "application/json"
        }
        payload = {
            "type": type,
            "token": token,
            "email": email
        }

        try:
            logger.info(f"Verifying OTP for email: {email}")
            response = await self.client.post(url, headers=headers, json=payload)

            if response.status_code == 200:
                result = response.json()
                logger.info(f"OTP verified successfully for {email}")
                return {
                    "success": True,
                    "access_token": result.get("access_token"),
                    "refresh_token": result.get("refresh_token"),
                    "user": result.get("user")
                }
            else:
                error_detail = response.text
                logger.error(f"OTP verification failed: {response.status_code} - {error_detail}")
                raise HTTPException(
                    status_code=400,
                    detail="Invalid or expired code. Please request a new one."
                )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error verifying OTP: {e}")
            raise HTTPException(
                status_code=500,
                detail="Failed to verify code. Please try again."
            )

    async def reset_password_with_token(self, access_token: str, new_password: str) -> Dict[str, Any]:
        """Reset password using access token from OTP verification"""
        url = f"{self.supabase_url}/auth/v1/user"
        headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        payload = {"password": new_password}

        try:
            logger.info("Resetting password with verified token")
            response = await self.client.put(url, headers=headers, json=payload)

            if response.status_code == 200:
                logger.info("Password reset successfully")
                return {"success": True, "message": "Password reset successfully"}
            else:
                error_detail = response.text
                logger.error(f"Password reset failed: {response.status_code} - {error_detail}")

                # Parse Supabase error response
                try:
                    error_json = response.json()
                    error_code = error_json.get("error_code", "")
                    error_msg = error_json.get("msg", "")

                    # Handle specific error codes
                    if error_code == "same_password":
                        raise HTTPException(
                            status_code=400,
                            detail="New password must be different from your current password."
                        )
                    elif error_code == "weak_password":
                        raise HTTPException(
                            status_code=400,
                            detail="Password is too weak. Please choose a stronger password."
                        )
                    else:
                        raise HTTPException(
                            status_code=400,
                            detail=error_msg or "Failed to reset password. Please try again."
                        )
                except ValueError:
                    # If response is not JSON, use generic message
                    raise HTTPException(
                        status_code=400,
                        detail="Failed to reset password. Please try again."
                    )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error resetting password: {e}")
            raise HTTPException(
                status_code=500,
                detail="Failed to reset password. Please try again."
            )

    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    # ===== Blockchain & Smart Account Methods =====

    async def get_user_account(self, user_id: str, aa_address: str) -> Optional[Dict]:
        """Get user account by user_id and smart account address"""
        try:
            url = f"{self.supabase_url}/rest/v1/accounts?user_id=eq.{user_id}&aa_address=eq.{aa_address.lower()}&limit=1"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Accept": "application/vnd.pgrst.object+json"
            }
            response = await self.client.get(url, headers=headers)
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            logger.error(f"Error getting user account: {e}")
            return None

    async def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        """Get user by ID"""
        try:
            url = f"{self.supabase_url}/rest/v1/users?id=eq.{user_id}&limit=1"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Accept": "application/vnd.pgrst.object+json"
            }
            response = await self.client.get(url, headers=headers)
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            logger.error(f"Error getting user: {e}")
            return None

    async def create_user(self, user_data: Dict) -> Optional[Dict]:
        """Create a new user"""
        try:
            url = f"{self.supabase_url}/rest/v1/users"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            response = await self.client.post(url, headers=headers, json=user_data)
            if response.status_code in [200, 201]:
                return response.json()[0] if isinstance(response.json(), list) else response.json()
            return None
        except Exception as e:
            logger.error(f"Error creating user: {e}")
            return None

    async def create_account(self, account_data: Dict) -> Optional[Dict]:
        """Create a new account"""
        try:
            url = f"{self.supabase_url}/rest/v1/accounts"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            response = await self.client.post(url, headers=headers, json=account_data)
            if response.status_code in [200, 201]:
                return response.json()[0] if isinstance(response.json(), list) else response.json()
            return None
        except Exception as e:
            logger.error(f"Error creating account: {e}")
            return None

    async def get_user_accounts(self, user_id: str) -> List[Dict]:
        """Get all accounts for a user"""
        try:
            url = f"{self.supabase_url}/rest/v1/accounts?user_id=eq.{user_id}"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}"
            }
            response = await self.client.get(url, headers=headers)
            if response.status_code == 200:
                return response.json()
            return []
        except Exception as e:
            logger.error(f"Error getting user accounts: {e}")
            return []

    async def delete_account(self, user_id: str, aa_address: str) -> bool:
        """Delete an account"""
        try:
            url = f"{self.supabase_url}/rest/v1/accounts?user_id=eq.{user_id}&aa_address=eq.{aa_address}"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}"
            }
            response = await self.client.delete(url, headers=headers)
            return response.status_code == 204
        except Exception as e:
            logger.error(f"Error deleting account: {e}")
            return False

    async def get_user_operation(self, user_op_hash: str) -> Optional[Dict]:
        """Get user operation by hash"""
        try:
            url = f"{self.supabase_url}/rest/v1/user_operations?user_op_hash=eq.{user_op_hash}&limit=1"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Accept": "application/vnd.pgrst.object+json"
            }
            response = await self.client.get(url, headers=headers)
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            logger.error(f"Error getting user operation: {e}")
            return None

    async def create_user_operation(self, operation_data: Dict) -> Optional[Dict]:
        """Create a new user operation"""
        try:
            url = f"{self.supabase_url}/rest/v1/user_operations"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            response = await self.client.post(url, headers=headers, json=operation_data)
            if response.status_code in [200, 201]:
                return response.json()[0] if isinstance(response.json(), list) else response.json()
            return None
        except Exception as e:
            logger.error(f"Error creating user operation: {e}")
            return None

    # Voucher methods
    async def get_vouchers_by_address(self, address: str) -> List[Dict]:
        """Get all vouchers for a specific address"""
        try:
            url = f"{self.supabase_url}/rest/v1/vouchers?address=eq.{address.lower()}"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}"
            }
            response = await self.client.get(url, headers=headers)
            return response.json() if response.status_code == 200 else []
        except Exception as e:
            logger.error(f"Error fetching vouchers: {e}")
            return []

    async def get_voucher_by_code(self, code: str) -> Optional[Dict]:
        """Get voucher by code"""
        try:
            url = f"{self.supabase_url}/rest/v1/vouchers?code=eq.{code}&limit=1"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Accept": "application/vnd.pgrst.object+json"
            }
            response = await self.client.get(url, headers=headers)
            return response.json() if response.status_code == 200 else None
        except Exception as e:
            logger.error(f"Error fetching voucher: {e}")
            return None

    async def create_voucher(self, voucher_data: Dict) -> Optional[Dict]:
        """Create a new voucher"""
        try:
            url = f"{self.supabase_url}/rest/v1/vouchers"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            response = await self.client.post(url, headers=headers, json=voucher_data)
            if response.status_code in [200, 201]:
                return response.json()[0] if isinstance(response.json(), list) else response.json()
            return None
        except Exception as e:
            logger.error(f"Error creating voucher: {e}")
            return None

    # Challenge methods
    async def get_all_challenges(self) -> List[Dict]:
        """Get all challenges"""
        try:
            url = f"{self.supabase_url}/rest/v1/challenges?order=created_at.desc"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}"
            }
            response = await self.client.get(url, headers=headers)
            return response.json() if response.status_code == 200 else []
        except Exception as e:
            logger.error(f"Error fetching challenges: {e}")
            return []

    async def get_challenge_by_id(self, challenge_id: int) -> Optional[Dict]:
        """Get challenge by ID"""
        try:
            url = f"{self.supabase_url}/rest/v1/challenges?id=eq.{challenge_id}&limit=1"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Accept": "application/vnd.pgrst.object+json"
            }
            response = await self.client.get(url, headers=headers)
            return response.json() if response.status_code == 200 else None
        except Exception as e:
            logger.error(f"Error fetching challenge: {e}")
            return None

    async def create_challenge(self, challenge_data: Dict) -> Optional[Dict]:
        """Create a new challenge"""
        try:
            url = f"{self.supabase_url}/rest/v1/challenges"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            response = await self.client.post(url, headers=headers, json=challenge_data)
            if response.status_code in [200, 201]:
                return response.json()[0] if isinstance(response.json(), list) else response.json()
            return None
        except Exception as e:
            logger.error(f"Error creating challenge: {e}")
            return None

    async def update_challenge(self, challenge_id: int, update_data: Dict) -> Optional[Dict]:
        """Update a challenge"""
        try:
            url = f"{self.supabase_url}/rest/v1/challenges?id=eq.{challenge_id}"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            response = await self.client.patch(url, headers=headers, json=update_data)
            if response.status_code == 200:
                result = response.json()
                return result[0] if isinstance(result, list) and result else result
            return None
        except Exception as e:
            logger.error(f"Error updating challenge: {e}")
            return None

    # UserChallenge methods
    async def get_user_challenges(self, user_id: str) -> List[Dict]:
        """Get all challenges for a user"""
        try:
            url = f"{self.supabase_url}/rest/v1/user_challenges?user_id=eq.{user_id}"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}"
            }
            response = await self.client.get(url, headers=headers)
            return response.json() if response.status_code == 200 else []
        except Exception as e:
            logger.error(f"Error fetching user challenges: {e}")
            return []

    async def get_user_challenge(self, user_id: str, challenge_id: int) -> Optional[Dict]:
        """Get specific user challenge"""
        try:
            url = f"{self.supabase_url}/rest/v1/user_challenges?user_id=eq.{user_id}&challenge_id=eq.{challenge_id}&limit=1"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Accept": "application/vnd.pgrst.object+json"
            }
            response = await self.client.get(url, headers=headers)
            return response.json() if response.status_code == 200 else None
        except Exception as e:
            logger.error(f"Error fetching user challenge: {e}")
            return None

    async def create_user_challenge(self, user_challenge_data: Dict) -> Optional[Dict]:
        """Create a new user challenge"""
        try:
            url = f"{self.supabase_url}/rest/v1/user_challenges"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            response = await self.client.post(url, headers=headers, json=user_challenge_data)
            if response.status_code in [200, 201]:
                return response.json()[0] if isinstance(response.json(), list) else response.json()
            return None
        except Exception as e:
            logger.error(f"Error creating user challenge: {e}")
            return None

    async def update_user_challenge(self, user_id: str, challenge_id: int, update_data: Dict) -> Optional[Dict]:
        """Update a user challenge"""
        try:
            url = f"{self.supabase_url}/rest/v1/user_challenges?user_id=eq.{user_id}&challenge_id=eq.{challenge_id}"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            response = await self.client.patch(url, headers=headers, json=update_data)
            if response.status_code == 200:
                result = response.json()
                return result[0] if isinstance(result, list) and result else result
            return None
        except Exception as e:
            logger.error(f"Error updating user challenge: {e}")
            return None

    # UserPoints methods
    async def get_user_points(self, user_id: str) -> List[Dict]:
        """Get all points transactions for a user"""
        try:
            url = f"{self.supabase_url}/rest/v1/user_points?user_id=eq.{user_id}&order=created_at.desc"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}"
            }
            response = await self.client.get(url, headers=headers)
            return response.json() if response.status_code == 200 else []
        except Exception as e:
            logger.error(f"Error fetching user points: {e}")
            return []

    async def create_user_points(self, points_data: Dict) -> Optional[Dict]:
        """Create a new points transaction"""
        try:
            url = f"{self.supabase_url}/rest/v1/user_points"
            headers = {
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            response = await self.client.post(url, headers=headers, json=points_data)
            if response.status_code in [200, 201]:
                return response.json()[0] if isinstance(response.json(), list) else response.json()
            return None
        except Exception as e:
            logger.error(f"Error creating user points: {e}")
            return None

    async def get_user_total_points(self, user_id: str) -> int:
        """Calculate total points for a user"""
        try:
            points_records = await self.get_user_points(user_id)
            total = sum(record.get('points', 0) for record in points_records)
            return total
        except Exception as e:
            logger.error(f"Error calculating total points: {e}")
            return 0

# Singleton instance
_supabase_service: Optional[SupabaseService] = None

def get_supabase_service() -> SupabaseService:
    """Get singleton Supabase service instance"""
    global _supabase_service
    if _supabase_service is None:
        _supabase_service = SupabaseService()
    return _supabase_service

# Create service instance for imports
supabase_service = get_supabase_service()

async def close_supabase_service():
    """Close the singleton service"""
    global _supabase_service
    if _supabase_service is not None:
        await _supabase_service.close()
        _supabase_service = None
