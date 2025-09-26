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

from config import settings

logger = logging.getLogger(__name__)

# Import database models
try:
    from models import get_db, Profile, Task, TrustedContact, EmergencyAlert, WellnessCheckin, UserSmartAccount, TokenRedemption
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
                except ImportError:
                    logger.warning("Crypto utils not available, private key not stored")
                except Exception as e:
                    logger.error(f"Failed to encrypt private key: {e}")
            
            account_data = {
                "user_id": user_id,
                "smart_account_address": smart_account_address,
                "signer_address": signer_address,
                "encrypted_private_key": encrypted_private_key,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "is_active": True
            }
            
            # First try to update existing record
            url = f"{self.supabase_url}/rest/v1/user_smart_accounts?user_id=eq.{user_id}"
            response = await self.client.patch(url, headers=headers, json=account_data)
            
            if response.status_code == 200:
                data = response.json()
                if data:  # Record updated
                    return True
            
            # If no record exists, create new one
            url = f"{self.supabase_url}/rest/v1/user_smart_accounts"
            response = await self.client.post(url, headers=headers, json=account_data)
            
            return response.status_code in [200, 201]
            
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

    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

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
