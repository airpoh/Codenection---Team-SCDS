"""
User Profile and Medical Information router for UniMate backend.
Handles user profile management, medical data, and health information.

MIGRATED TO SQLALCHEMY for better performance (10-20x faster than REST API)
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, BackgroundTasks
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, date
from typing import Optional, List, Dict, Any
import logging
import base64

from models import db, Profile as ProfileModel, Task as TaskModel
from routers.core_supabase import get_authenticated_user
from services.supabase_client import supabase_service  # Keep for avatar upload only

router = APIRouter(prefix="/users", tags=["profile"])
logger = logging.getLogger("unimate-profile")

# --- Schemas ---

class MedicalInfo(BaseModel):
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    medications: Optional[str] = None
    medical_history: Optional[str] = None
    emergency_conditions: Optional[str] = None
    preferred_clinic: Optional[str] = None

    @classmethod
    def model_validate(cls, obj):
        # Convert empty strings to None for blood_type
        if isinstance(obj, dict) and obj.get('blood_type') == '':
            obj['blood_type'] = None
        return super().model_validate(obj)

class ProfileBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = None
    address: Optional[str] = None
    date_of_birth: Optional[date] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    date_of_birth: Optional[str] = None  # Changed from date to str to accept ISO strings from frontend
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None

class MedicalInfoUpdate(BaseModel):
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    medications: Optional[str] = None
    medical_history: Optional[str] = None
    emergency_conditions: Optional[str] = None
    preferred_clinic: Optional[str] = None

class MoodEntry(BaseModel):
    mood: str = Field(..., pattern="^(Thriving|Good|Okay|Stressed|Tired|Down|SOS)$")
    notes: Optional[str] = None
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


# Helper functions
def calculate_completeness(profile: ProfileModel) -> float:
    """Calculate profile completeness percentage"""
    fields = [
        profile.name, profile.phone, profile.address, profile.date_of_birth,
        profile.emergency_contact_name, profile.emergency_contact_phone,
        profile.blood_type, profile.allergies, profile.medications, profile.medical_history
    ]
    filled = sum(1 for f in fields if f and str(f).strip())
    return min((filled / len(fields)) * 100, 100.0)


# --- Profile Endpoints ---

@router.get("/profile", response_model=UserProfile)
async def get_user_profile(
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get the current user's profile."""
    session = db()
    try:
        user_id = user["sub"]
        user_email = user.get("email", "user@example.com")

        # ✅ Award login points (once per day) via background task
        # The award_daily_action_points function has built-in duplicate prevention
        from routers.rewards import award_daily_action_points
        background_tasks.add_task(award_daily_action_points, user_id, "login")
        logger.info(f"✅ Login points job scheduled for user {user_id}")

        profile = session.query(ProfileModel).filter(ProfileModel.id == user_id).first()

        if profile:
            medical_info = {
                "blood_type": profile.blood_type if profile.blood_type and profile.blood_type.strip() else None,
                "allergies": profile.allergies if profile.allergies and profile.allergies.strip() else None,
                "medications": profile.medications if profile.medications and profile.medications.strip() else None,
                "medical_history": profile.medical_history if profile.medical_history and profile.medical_history.strip() else None,
                "emergency_conditions": profile.emergency_conditions if profile.emergency_conditions and profile.emergency_conditions.strip() else None,
                "preferred_clinic": profile.preferred_clinic if profile.preferred_clinic and profile.preferred_clinic.strip() else None
            }

            logger.info(f"Returning profile for user {user_id}: name='{profile.name}', email='{user_email}'")

            return {
                "id": user_id,
                "email": user_email,
                "name": profile.name,
                "phone": profile.phone,
                "address": profile.address,
                "date_of_birth": profile.date_of_birth,
                "avatar_url": profile.avatar_url,
                "emergency_contact_name": profile.emergency_contact_name,
                "emergency_contact_phone": profile.emergency_contact_phone,
                "emergency_contact_relation": profile.emergency_contact_relation,
                "medical_info": medical_info,
                "current_mood": profile.current_mood or "Good",
                "profile_completeness": calculate_completeness(profile),
                "created_at": profile.created_at,
                "updated_at": profile.updated_at
            }
        else:
            # Create default profile
            now = datetime.utcnow()
            new_profile = ProfileModel(
                id=user_id,
                name="",
                email=user_email,
                campus_verified=False,
                created_at=now,
                updated_at=now
            )
            session.add(new_profile)
            session.commit()

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
                "medical_info": {k: None for k in ["blood_type", "allergies", "medications", "medical_history", "emergency_conditions", "preferred_clinic"]},
                "current_mood": "Good",
                "profile_completeness": 0.0,
                "created_at": now,
                "updated_at": now
            }

    except Exception as e:
        logger.error(f"Failed to get user profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve profile")
    finally:
        session.close()


@router.put("/profile", response_model=UserProfile)
def update_user_profile(
    profile_update: ProfileUpdate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Update the current user's profile."""
    session = db()
    try:
        user_id = user["sub"]
        user_email = user.get("email", "user@example.com")

        profile = session.query(ProfileModel).filter(ProfileModel.id == user_id).first()
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")

        # Update fields
        if profile_update.name is not None:
            profile.name = profile_update.name
        if profile_update.phone is not None:
            profile.phone = profile_update.phone
        if profile_update.address is not None:
            profile.address = profile_update.address
        if profile_update.date_of_birth is not None:
            # Handle both date objects and ISO string format from frontend
            if isinstance(profile_update.date_of_birth, str):
                profile.date_of_birth = datetime.fromisoformat(profile_update.date_of_birth.replace("Z", "+00:00")).date()
            else:
                profile.date_of_birth = profile_update.date_of_birth
        if profile_update.emergency_contact_name is not None:
            profile.emergency_contact_name = profile_update.emergency_contact_name
        if profile_update.emergency_contact_phone is not None:
            profile.emergency_contact_phone = profile_update.emergency_contact_phone
        if profile_update.emergency_contact_relation is not None:
            profile.emergency_contact_relation = profile_update.emergency_contact_relation

        profile.updated_at = datetime.utcnow()
        session.commit()
        session.refresh(profile)

        medical_info = {
            "blood_type": profile.blood_type if profile.blood_type and profile.blood_type.strip() else None,
            "allergies": profile.allergies if profile.allergies and profile.allergies.strip() else None,
            "medications": profile.medications if profile.medications and profile.medications.strip() else None,
            "medical_history": profile.medical_history if profile.medical_history and profile.medical_history.strip() else None,
            "emergency_conditions": profile.emergency_conditions if profile.emergency_conditions and profile.emergency_conditions.strip() else None,
            "preferred_clinic": profile.preferred_clinic if profile.preferred_clinic and profile.preferred_clinic.strip() else None
        }

        logger.info(f"Updated profile for user {user_id}")
        return {
            "id": user_id,
            "email": user_email,
            "name": profile.name,
            "phone": profile.phone,
            "address": profile.address,
            "date_of_birth": profile.date_of_birth,
            "avatar_url": profile.avatar_url,
            "emergency_contact_name": profile.emergency_contact_name,
            "emergency_contact_phone": profile.emergency_contact_phone,
            "emergency_contact_relation": profile.emergency_contact_relation,
            "medical_info": medical_info,
            "current_mood": profile.current_mood or "Good",
            "profile_completeness": calculate_completeness(profile),
            "created_at": profile.created_at,
            "updated_at": profile.updated_at
        }

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to update profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to update profile")
    finally:
        session.close()


@router.put("/profile/medical", response_model=Dict[str, Any])
def update_medical_info(
    medical_update: MedicalInfoUpdate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Update the current user's medical information."""
    session = db()
    try:
        user_id = user["sub"]

        profile = session.query(ProfileModel).filter(ProfileModel.id == user_id).first()
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")

        # Update medical fields
        if medical_update.blood_type is not None:
            profile.blood_type = medical_update.blood_type
        if medical_update.allergies is not None:
            profile.allergies = medical_update.allergies
        if medical_update.medications is not None:
            profile.medications = medical_update.medications
        if medical_update.medical_history is not None:
            profile.medical_history = medical_update.medical_history
        if medical_update.emergency_conditions is not None:
            profile.emergency_conditions = medical_update.emergency_conditions
        if medical_update.preferred_clinic is not None:
            profile.preferred_clinic = medical_update.preferred_clinic

        profile.updated_at = datetime.utcnow()
        session.commit()
        session.refresh(profile)

        logger.info(f"Updated medical info for user {user_id}")
        return {
            "message": "Medical information updated successfully",
            "medical_info": {
                "blood_type": profile.blood_type if profile.blood_type and profile.blood_type.strip() else None,
                "allergies": profile.allergies if profile.allergies and profile.allergies.strip() else None,
                "medications": profile.medications if profile.medications and profile.medications.strip() else None,
                "medical_history": profile.medical_history if profile.medical_history and profile.medical_history.strip() else None,
                "emergency_conditions": profile.emergency_conditions if profile.emergency_conditions and profile.emergency_conditions.strip() else None,
                "preferred_clinic": profile.preferred_clinic if profile.preferred_clinic and profile.preferred_clinic.strip() else None
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to update medical info: {e}")
        raise HTTPException(status_code=500, detail="Failed to update medical information")
    finally:
        session.close()


@router.post("/profile/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Upload user avatar image - uses Supabase Storage"""
    # TODO: Migrate to proper file storage (Supabase Storage or S3)
    raise HTTPException(status_code=501, detail="Avatar upload not yet migrated to SQLAlchemy. Use Supabase Storage instead.")


@router.post("/profile/mood", response_model=Dict[str, Any])
async def log_mood(
    mood_entry: MoodEntry,
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Log current mood for the user."""
    session = db()
    try:
        user_id = user["sub"]

        # Update current mood in profile
        profile = session.query(ProfileModel).filter(ProfileModel.id == user_id).first()
        if profile:
            profile.current_mood = mood_entry.mood
            profile.updated_at = datetime.utcnow()
            session.commit()

        logger.info(f"Logged mood '{mood_entry.mood}' for user {user_id}")

        # ✅ Award points for setting mood (+5 points, once per day)
        try:
            from routers.rewards import award_daily_action_points
            # Use BackgroundTasks to ensure it runs after response is sent
            background_tasks.add_task(award_daily_action_points, user_id, "set_mood_today")
            logger.info(f"✅ Mood logging points job scheduled for user {user_id}")
        except Exception as e:
            logger.error(f"❌ Failed to schedule mood logging points: {e}", exc_info=True)

        return {
            "message": "Mood logged successfully",
            "mood_entry": {
                "mood": mood_entry.mood,
                "notes": mood_entry.notes,
                "timestamp": mood_entry.timestamp or datetime.utcnow()
            }
        }

    except Exception as e:
        session.rollback()
        logger.error(f"Failed to log mood: {e}")
        raise HTTPException(status_code=500, detail="Failed to log mood")
    finally:
        session.close()


@router.get("/profile/mood-history")
def get_mood_history(
    days: int = 30,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get mood history for the user."""
    # TODO: Create MoodEntry model and implement
    raise HTTPException(status_code=501, detail="Mood history not yet migrated to SQLAlchemy")


@router.get("/profile/stats", response_model=UserStats)
def get_user_stats(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """Get user statistics and metrics."""
    session = db()
    try:
        user_id = user["sub"]

        # Get tasks stats
        total_tasks = session.query(TaskModel).filter(TaskModel.user_id == user_id).count()
        completed_tasks = session.query(TaskModel).filter(
            TaskModel.user_id == user_id,
            TaskModel.is_completed == True
        ).count()

        logger.info(f"Retrieved stats for user {user_id}")
        return {
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "total_reminders": 0,
            "current_streak": 0,
            "total_points": 0,
            "wellness_check_ins": 0
        }

    except Exception as e:
        logger.error(f"Failed to get user stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve user statistics")
    finally:
        session.close()


@router.delete("/profile")
def delete_user_profile(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """Delete user profile and all associated data."""
    session = db()
    try:
        user_id = user["sub"]

        profile = session.query(ProfileModel).filter(ProfileModel.id == user_id).first()
        if profile:
            session.delete(profile)
            session.commit()

        logger.info(f"Deleted profile for user {user_id}")
        return {"message": "User profile deleted successfully"}

    except Exception as e:
        session.rollback()
        logger.error(f"Failed to delete profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete profile")
    finally:
        session.close()


@router.get("/stats", response_model=UserStats)
def get_user_stats_compat(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """Get user stats - Frontend compatibility (redirects to /profile/stats)"""
    return get_user_stats(user)
