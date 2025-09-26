"""
User Profile and Medical Information router for UniMate backend.
Handles user profile management, medical data, and health information.
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, EmailStr, Field, validator
from datetime import datetime, date
from typing import Optional, List, Dict, Any
import logging
from uuid import uuid4

from services.supabase_client import supabase_service
from routers.core_supabase import get_authenticated_user

router = APIRouter(prefix="/users", tags=["profile"])
logger = logging.getLogger("unimate-profile")

# --- Schemas ---

class MedicalInfo(BaseModel):
    blood_type: Optional[str] = Field(None, pattern="^(A|B|AB|O)[+-]?$")
    allergies: Optional[str] = Field(None, max_length=1000)
    medications: Optional[str] = Field(None, max_length=1000)
    medical_history: Optional[str] = Field(None, max_length=2000)
    emergency_conditions: Optional[str] = Field(None, max_length=1000)
    preferred_clinic: Optional[str] = Field(None, max_length=200)

class ProfileBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = Field(None, pattern="^[+]?[0-9\\s()-]+$", max_length=20)
    address: Optional[str] = Field(None, max_length=500)
    date_of_birth: Optional[date] = None
    emergency_contact_name: Optional[str] = Field(None, max_length=100)
    emergency_contact_phone: Optional[str] = Field(None, pattern="^[+]?[0-9\\s()-]+$", max_length=20)
    emergency_contact_relation: Optional[str] = Field(None, max_length=50)

class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = Field(None, pattern="^[+]?[0-9\\s()-]+$", max_length=20)
    address: Optional[str] = Field(None, max_length=500)
    date_of_birth: Optional[date] = None
    emergency_contact_name: Optional[str] = Field(None, max_length=100)
    emergency_contact_phone: Optional[str] = Field(None, pattern="^[+]?[0-9\\s()-]+$", max_length=20)
    emergency_contact_relation: Optional[str] = Field(None, max_length=50)

class MedicalInfoUpdate(BaseModel):
    blood_type: Optional[str] = Field(None, pattern="^(A|B|AB|O)[+-]?$")
    allergies: Optional[str] = Field(None, max_length=1000)
    medications: Optional[str] = Field(None, max_length=1000)
    medical_history: Optional[str] = Field(None, max_length=2000)
    emergency_conditions: Optional[str] = Field(None, max_length=1000)
    preferred_clinic: Optional[str] = Field(None, max_length=200)

class MoodEntry(BaseModel):
    mood: str = Field(..., pattern="^(Thriving|Good|Okay|Stressed|Tired|Down|SOS)$")
    notes: Optional[str] = Field(None, max_length=500)
    timestamp: Optional[datetime] = None

class UserProfile(BaseModel):
    id: str
    email: EmailStr
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    date_of_birth: Optional[date] = None
    avatar_url: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    medical_info: Optional[MedicalInfo] = None
    current_mood: Optional[str] = None
    profile_completeness: float = Field(0.0, ge=0.0, le=100.0)
    created_at: datetime
    updated_at: datetime

class UserStats(BaseModel):
    total_tasks: int = 0
    completed_tasks: int = 0
    total_reminders: int = 0
    current_streak: int = 0
    total_points: int = 0
    wellness_check_ins: int = 0

# --- Profile Endpoints ---

@router.get("/profile", response_model=UserProfile)
async def get_user_profile(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """Get the current user's profile."""
    try:
        user_id = user["sub"]
        user_email = user.get("email", "user@example.com")

        # Try to get profile from Supabase
        profile_data = await supabase_service.get_user_profile(user_id, user.get("token", ""))
        
        if profile_data:
            # Calculate profile completeness
            fields_to_check = [
                profile_data.get("name"),
                profile_data.get("phone"),
                profile_data.get("address"),
                profile_data.get("date_of_birth"),
                profile_data.get("emergency_contact_name"),
                profile_data.get("emergency_contact_phone"),
                profile_data.get("blood_type"),
                profile_data.get("allergies"),
                profile_data.get("medications"),
                profile_data.get("medical_history")
            ]
            
            filled_fields = sum(1 for field in fields_to_check if field and str(field).strip())
            completeness = min((filled_fields / len(fields_to_check)) * 100, 100.0)
            
            # Build medical info
            medical_info = {
                "blood_type": profile_data.get("blood_type"),
                "allergies": profile_data.get("allergies"),
                "medications": profile_data.get("medications"),
                "medical_history": profile_data.get("medical_history"),
                "emergency_conditions": profile_data.get("emergency_conditions"),
                "preferred_clinic": profile_data.get("preferred_clinic")
            }
            
            return {
                "id": user_id,
                "email": user_email,
                "name": profile_data.get("name", ""),
                "phone": profile_data.get("phone"),
                "address": profile_data.get("address"),
                "date_of_birth": profile_data.get("date_of_birth"),
                "avatar_url": profile_data.get("avatar_url"),
                "emergency_contact_name": profile_data.get("emergency_contact_name"),
                "emergency_contact_phone": profile_data.get("emergency_contact_phone"),
                "emergency_contact_relation": profile_data.get("emergency_contact_relation"),
                "medical_info": medical_info,
                "current_mood": profile_data.get("current_mood", "Good"),
                "profile_completeness": completeness,
                "created_at": profile_data.get("created_at", datetime.utcnow().isoformat()),
                "updated_at": profile_data.get("updated_at", datetime.utcnow().isoformat())
            }
        else:
            # Return default profile if not found
            return {
                "id": user_id,
                "email": user_email,
                "name": "",
                "phone": None,
                "address": None,
                "date_of_birth": None,
                "avatar_url": None,
                "emergency_contact_name": None,
                "emergency_contact_phone": None,
                "emergency_contact_relation": None,
                "medical_info": {
                    "blood_type": None,
                    "allergies": None,
                    "medications": None,
                    "medical_history": None,
                    "emergency_conditions": None,
                    "preferred_clinic": None
                },
                "current_mood": "Good",
                "profile_completeness": 0.0,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get user profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve profile")

@router.put("/profile", response_model=UserProfile)
async def update_user_profile(
    profile_update: ProfileUpdate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Update the current user's profile."""
    try:
        user_id = user["sub"]
        user_email = user.get("email", "user@example.com")

        # Prepare update data
        update_data = {}
        if profile_update.name is not None:
            update_data["name"] = profile_update.name
        if profile_update.phone is not None:
            update_data["phone"] = profile_update.phone
        if profile_update.address is not None:
            update_data["address"] = profile_update.address
        if profile_update.date_of_birth is not None:
            update_data["date_of_birth"] = profile_update.date_of_birth.isoformat()
        if profile_update.emergency_contact_name is not None:
            update_data["emergency_contact_name"] = profile_update.emergency_contact_name
        if profile_update.emergency_contact_phone is not None:
            update_data["emergency_contact_phone"] = profile_update.emergency_contact_phone
        if profile_update.emergency_contact_relation is not None:
            update_data["emergency_contact_relation"] = profile_update.emergency_contact_relation

        # Update profile in database
        updated_profile = await supabase_service.update_user_profile(
            user_id, 
            update_data, 
            user.get("token", "")
        )

        if updated_profile:
            # Calculate profile completeness
            fields_to_check = [
                updated_profile.get("name"),
                updated_profile.get("phone"),
                updated_profile.get("address"),
                updated_profile.get("date_of_birth"),
                updated_profile.get("emergency_contact_name"),
                updated_profile.get("emergency_contact_phone"),
                updated_profile.get("blood_type"),
                updated_profile.get("allergies"),
                updated_profile.get("medications"),
                updated_profile.get("medical_history")
            ]
            
            filled_fields = sum(1 for field in fields_to_check if field and str(field).strip())
            completeness = min((filled_fields / len(fields_to_check)) * 100, 100.0)
            
            # Build medical info
            medical_info = {
                "blood_type": updated_profile.get("blood_type"),
                "allergies": updated_profile.get("allergies"),
                "medications": updated_profile.get("medications"),
                "medical_history": updated_profile.get("medical_history"),
                "emergency_conditions": updated_profile.get("emergency_conditions"),
                "preferred_clinic": updated_profile.get("preferred_clinic")
            }
            
            result = {
                "id": user_id,
                "email": user_email,
                "name": updated_profile.get("name", ""),
                "phone": updated_profile.get("phone"),
                "address": updated_profile.get("address"),
                "date_of_birth": updated_profile.get("date_of_birth"),
                "avatar_url": updated_profile.get("avatar_url"),
                "emergency_contact_name": updated_profile.get("emergency_contact_name"),
                "emergency_contact_phone": updated_profile.get("emergency_contact_phone"),
                "emergency_contact_relation": updated_profile.get("emergency_contact_relation"),
                "medical_info": medical_info,
                "current_mood": updated_profile.get("current_mood", "Good"),
                "profile_completeness": completeness,
                "created_at": updated_profile.get("created_at", datetime.utcnow().isoformat()),
                "updated_at": updated_profile.get("updated_at", datetime.utcnow().isoformat())
            }

            logger.info(f"Updated profile for user {user_id}")
            return result
        else:
            raise HTTPException(status_code=500, detail="Failed to update profile in database")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to update profile")

@router.put("/profile/medical", response_model=Dict[str, Any])
async def update_medical_info(
    medical_update: MedicalInfoUpdate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Update the current user's medical information."""
    try:
        user_id = user["sub"]

        # Prepare medical update data
        update_data = {}
        if medical_update.blood_type is not None:
            update_data["blood_type"] = medical_update.blood_type
        if medical_update.allergies is not None:
            update_data["allergies"] = medical_update.allergies
        if medical_update.medications is not None:
            update_data["medications"] = medical_update.medications
        if medical_update.medical_history is not None:
            update_data["medical_history"] = medical_update.medical_history
        if medical_update.emergency_conditions is not None:
            update_data["emergency_conditions"] = medical_update.emergency_conditions
        if medical_update.preferred_clinic is not None:
            update_data["preferred_clinic"] = medical_update.preferred_clinic

        # Update medical info in database
        updated_profile = await supabase_service.update_user_profile(
            user_id, 
            update_data, 
            user.get("token", "")
        )

        if updated_profile:
            updated_medical = {
                "blood_type": updated_profile.get("blood_type"),
                "allergies": updated_profile.get("allergies"),
                "medications": updated_profile.get("medications"),
                "medical_history": updated_profile.get("medical_history"),
                "emergency_conditions": updated_profile.get("emergency_conditions"),
                "preferred_clinic": updated_profile.get("preferred_clinic")
            }

            logger.info(f"Updated medical info for user {user_id}")
            return {
                "message": "Medical information updated successfully",
                "medical_info": updated_medical
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to update medical information in database")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update medical info: {e}")
        raise HTTPException(status_code=500, detail="Failed to update medical information")

@router.post("/profile/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Upload user avatar image."""
    try:
        user_id = user["sub"]

        # Validate file type
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")

        # Validate file size (max 5MB)
        if hasattr(file, 'size') and file.size > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File size must be less than 5MB")

        # For now, store avatar as base64 in the database profile
        # In production, this would upload to cloud storage like Supabase Storage
        import base64
        file_content = await file.read()
        avatar_data = base64.b64encode(file_content).decode('utf-8')
        avatar_url = f"data:{file.content_type};base64,{avatar_data[:50]}..."  # Truncated for display

        # Update user profile with avatar URL
        response = supabase_service.client.table("profiles").update({
            "avatar_url": avatar_url,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("user_id", user_id).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update avatar")

        logger.info(f"Uploaded avatar for user {user_id}")
        return {
            "message": "Avatar uploaded successfully",
            "avatar_url": avatar_url
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upload avatar: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload avatar")

@router.post("/profile/mood", response_model=Dict[str, Any])
async def log_mood(
    mood_entry: MoodEntry,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Log current mood for the user."""
    try:
        user_id = user["sub"]
        timestamp = mood_entry.timestamp or datetime.utcnow()

        # Save mood entry to database
        mood_data = {
            "user_id": user_id,
            "mood": mood_entry.mood,
            "notes": mood_entry.notes,
            "timestamp": timestamp.isoformat(),
            "date": timestamp.date().isoformat(),
            "created_at": datetime.utcnow().isoformat()
        }

        response = supabase_service.client.table("mood_entries").insert(mood_data).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to log mood")

        mood_log = response.data[0]

        logger.info(f"Logged mood '{mood_entry.mood}' for user {user_id}")
        return {
            "message": "Mood logged successfully",
            "mood_entry": {
                "id": str(mood_log.get("id", "")),
                "user_id": mood_log.get("user_id"),
                "mood": mood_log.get("mood"),
                "notes": mood_log.get("notes"),
                "timestamp": mood_log.get("timestamp"),
                "date": mood_log.get("date")
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to log mood: {e}")
        raise HTTPException(status_code=500, detail="Failed to log mood")

@router.get("/profile/mood-history")
async def get_mood_history(
    days: int = 30,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get mood history for the user."""
    try:
        user_id = user["sub"]

        # Get mood history from Supabase
        response = supabase_service.client.table("mood_entries").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(days).execute()

        mood_history = []
        if response.data:
            for entry in response.data:
                mood_history.append({
                    "id": entry.get("id"),
                    "mood": entry.get("mood", "Okay"),
                    "notes": entry.get("notes", ""),
                    "timestamp": entry.get("created_at", ""),
                    "date": entry.get("created_at", "")[:10] if entry.get("created_at") else ""
                })

        return {
            "mood_history": mood_history,
            "total_entries": len(mood_history)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get mood history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve mood history")

@router.get("/profile/stats", response_model=UserStats)
async def get_user_stats(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """Get user statistics and metrics."""
    try:
        user_id = user["sub"]

        # Get real user stats from Supabase
        try:
            # Get tasks stats
            tasks_response = supabase_service.client.table("tasks").select("*").eq("user_id", user_id).execute()
            total_tasks = len(tasks_response.data) if tasks_response.data else 0
            completed_tasks = len([t for t in (tasks_response.data or []) if t.get("completed", False)])

            # Get reminders stats
            reminders_response = supabase_service.client.table("reminders").select("*").eq("user_id", user_id).execute()
            total_reminders = len(reminders_response.data) if reminders_response.data else 0

            # Get mood check-ins
            mood_response = supabase_service.client.table("mood_entries").select("*").eq("user_id", user_id).execute()
            wellness_check_ins = len(mood_response.data) if mood_response.data else 0

            # Calculate current streak (simplified)
            current_streak = 0  # TODO: Implement proper streak calculation

            # Get total points from blockchain/rewards system
            total_points = 0  # TODO: Connect to blockchain router for actual points

            stats = {
                "total_tasks": total_tasks,
                "completed_tasks": completed_tasks,
                "total_reminders": total_reminders,
                "current_streak": current_streak,
                "total_points": total_points,
                "wellness_check_ins": wellness_check_ins
            }

            logger.info(f"Retrieved stats for user {user_id}")
            return stats
        except Exception as e:
            logger.warning(f"Error retrieving some stats for user {user_id}: {e}")
            # Return basic stats if detailed retrieval fails
            return {
                "total_tasks": 0,
                "completed_tasks": 0,
                "total_reminders": 0,
                "current_streak": 0,
                "total_points": 0,
                "wellness_check_ins": 0
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get user stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve user statistics")

@router.delete("/profile")
async def delete_user_profile(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """Delete user profile and all associated data."""
    try:
        user_id = user["sub"]

        # Delete user profile and related data from database
        # Note: Supabase handles cascade deletes based on foreign key constraints

        # Delete user profile
        profile_response = supabase_service.client.table("profiles").delete().eq("user_id", user_id).execute()

        # Delete related user data (tasks, mood entries, etc.)
        supabase_service.client.table("tasks").delete().eq("user_id", user_id).execute()
        supabase_service.client.table("mood_entries").delete().eq("user_id", user_id).execute()
        supabase_service.client.table("user_challenges").delete().eq("user_id", user_id).execute()

        logger.info(f"Deleted profile and related data for user {user_id}")
        return {
            "message": "User profile deleted successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete profile")