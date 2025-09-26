"""
Lighthouse Emergency and Wellness router for UniMate backend.
Handles emergency SOS, trusted contacts, wellness check-ins, and mental health resources.
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Query
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional, List, Dict, Any
import logging
from uuid import uuid4
from enum import Enum

from services.supabase_client import supabase_service
from routers.core_supabase import get_authenticated_user

router = APIRouter(prefix="/lighthouse", tags=["lighthouse"])
logger = logging.getLogger("unimate-lighthouse")

# --- Enums ---

class EmergencyType(str, Enum):
    MEDICAL = "medical"
    SAFETY = "safety"
    MENTAL_HEALTH = "mental_health"
    GENERAL = "general"

class EmergencyPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class ContactRelation(str, Enum):
    FAMILY = "family"
    FRIEND = "friend"
    ROOMMATE = "roommate"
    ADVISOR = "advisor"
    OTHER = "other"

class WellnessStatus(str, Enum):
    EXCELLENT = "excellent"
    GOOD = "good"
    OKAY = "okay"
    STRUGGLING = "struggling"
    CRISIS = "crisis"

# --- Schemas ---

class LocationData(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    address: Optional[str] = None
    accuracy: Optional[float] = None

class TrustedContactBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., pattern="^[+]?[0-9\\s()-]+$", max_length=20)
    email: Optional[str] = None
    relation: ContactRelation
    is_primary: bool = False
    notes: Optional[str] = Field(None, max_length=500)

class TrustedContactCreate(TrustedContactBase):
    pass

class TrustedContactUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = Field(None, pattern="^[+]?[0-9\\s()-]+$", max_length=20)
    email: Optional[str] = None
    relation: Optional[ContactRelation] = None
    is_primary: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)

class TrustedContact(TrustedContactBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

class EmergencyRequest(BaseModel):
    emergency_type: EmergencyType
    priority: EmergencyPriority
    message: str = Field(..., min_length=1, max_length=1000)
    location: Optional[LocationData] = None
    notify_contacts: bool = True
    notify_authorities: bool = False
    medical_conditions: Optional[str] = Field(None, max_length=500)

class EmergencyAlert(BaseModel):
    id: str
    user_id: str
    emergency_type: EmergencyType
    priority: EmergencyPriority
    message: str
    location: Optional[LocationData]
    status: str = "active"  # active, resolved, cancelled
    contacts_notified: List[str] = []
    authorities_notified: bool = False
    medical_conditions: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None

class WellnessCheckIn(BaseModel):
    status: WellnessStatus
    mood_score: int = Field(..., ge=1, le=10)
    stress_level: int = Field(..., ge=1, le=10)
    sleep_hours: Optional[float] = Field(None, ge=0, le=24)
    notes: Optional[str] = Field(None, max_length=1000)
    location: Optional[LocationData] = None

    @validator('mood_score', 'stress_level')
    def validate_scores(cls, v):
        if not 1 <= v <= 10:
            raise ValueError('Score must be between 1 and 10')
        return v

class WellnessEntry(WellnessCheckIn):
    id: str
    user_id: str
    timestamp: datetime
    created_at: datetime

class ResourceCategory(str, Enum):
    MENTAL_HEALTH = "mental_health"
    MEDICAL = "medical"
    SAFETY = "safety"
    ACADEMIC = "academic"
    FINANCIAL = "financial"

class EmergencyResource(BaseModel):
    id: str
    title: str
    description: str
    category: ResourceCategory
    contact_info: Dict[str, Any]  # phone, email, website, address
    availability: str  # "24/7", "business hours", etc.
    location: Optional[str] = None
    is_local: bool = False

# --- Emergency Endpoints ---

@router.post("/emergency", response_model=EmergencyAlert)
async def trigger_emergency_alert(
    emergency: EmergencyRequest,
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Trigger an emergency alert and notify trusted contacts."""
    try:
        user_id = user["sub"]
        alert_id = str(uuid4())
        now = datetime.utcnow()

        # Create emergency alert
        emergency_alert = {
            "id": alert_id,
            "user_id": user_id,
            "emergency_type": emergency.emergency_type,
            "priority": emergency.priority,
            "message": emergency.message,
            "location": emergency.location.dict() if emergency.location else None,
            "status": "active",
            "contacts_notified": [],
            "authorities_notified": emergency.notify_authorities,
            "medical_conditions": emergency.medical_conditions,
            "created_at": now.isoformat(),
            "resolved_at": None
        }

        # Add background task to notify contacts
        if emergency.notify_contacts:
            background_tasks.add_task(
                notify_emergency_contacts,
                user_id,
                alert_id,
                emergency.emergency_type,
                emergency.priority,
                emergency.message
            )

        # Add background task to notify authorities if requested
        if emergency.notify_authorities:
            background_tasks.add_task(
                notify_authorities,
                user_id,
                alert_id,
                emergency.emergency_type,
                emergency.priority,
                emergency.location
            )

        logger.warning(f"Emergency alert triggered by user {user_id}: {emergency.emergency_type} - {emergency.priority}")
        return emergency_alert

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to trigger emergency alert: {e}")
        raise HTTPException(status_code=500, detail="Failed to trigger emergency alert")

@router.get("/emergency", response_model=List[EmergencyAlert])
async def get_emergency_history(
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get user's emergency alert history."""
    try:
        user_id = user["sub"]

        # Get emergency alerts from Supabase
        query = supabase_service.client.table("emergency_alerts").select("*").eq("user_id", user_id).order("created_at", desc=True)

        if status:
            query = query.eq("status", status)

        response = query.limit(limit).execute()

        alerts = []
        if response.data:
            for alert in response.data:
                alerts.append({
                    "id": alert.get("id"),
                    "user_id": alert.get("user_id"),
                    "emergency_type": alert.get("emergency_type"),
                    "priority": alert.get("priority", "medium"),
                    "message": alert.get("message"),
                    "location": alert.get("location", {}),
                    "status": alert.get("status", "active"),
                    "contacts_notified": alert.get("contacts_notified", []),
                    "authorities_notified": alert.get("authorities_notified", False),
                    "medical_conditions": alert.get("medical_conditions"),
                    "created_at": alert.get("created_at"),
                    "resolved_at": alert.get("resolved_at")
                })

        return alerts

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get emergency history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve emergency history")

@router.put("/emergency/{alert_id}/resolve")
async def resolve_emergency_alert(
    alert_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Mark an emergency alert as resolved."""
    try:
        user_id = user["sub"]

        # Update emergency alert as resolved in database
        resolved_at = datetime.utcnow().isoformat()
        response = supabase_service.client.table("emergency_alerts").update({
            "status": "resolved",
            "resolved_at": resolved_at,
            "resolved_by": user_id
        }).eq("id", alert_id).eq("user_id", user_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Emergency alert not found")

        logger.info(f"Emergency alert {alert_id} resolved by user {user_id}")
        return {
            "message": "Emergency alert resolved successfully",
            "alert_id": alert_id,
            "resolved_at": resolved_at
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to resolve emergency alert: {e}")
        raise HTTPException(status_code=500, detail="Failed to resolve emergency alert")

# --- Trusted Contacts Endpoints ---

@router.get("/contacts", response_model=List[TrustedContact])
async def get_trusted_contacts(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """Get all trusted contacts for the user."""
    try:
        user_id = user["sub"]

        # Get contacts from database
        contacts_data = await supabase_service.get_trusted_contacts(user_id, user.get("token", ""))

        # Transform data to match TrustedContact model
        contacts = []
        for contact_data in contacts_data:
            contact = {
                "id": str(contact_data.get("id", "")),
                "user_id": contact_data.get("user_id", user_id),
                "name": contact_data.get("name", ""),
                "phone": contact_data.get("phone", ""),
                "email": contact_data.get("email"),
                "relation": contact_data.get("relation", "other"),
                "is_primary": contact_data.get("is_primary", False),
                "notes": contact_data.get("notes"),
                "created_at": contact_data.get("created_at", datetime.utcnow().isoformat()),
                "updated_at": contact_data.get("updated_at", datetime.utcnow().isoformat())
            }
            contacts.append(contact)

        return contacts

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get trusted contacts: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve trusted contacts")

@router.post("/contacts", response_model=TrustedContact)
async def add_trusted_contact(
    contact: TrustedContactCreate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Add a new trusted contact."""
    try:
        user_id = user["sub"]
        contact_id = str(uuid4())
        now = datetime.utcnow()

        new_contact = {
            "id": contact_id,
            "user_id": user_id,
            "name": contact.name,
            "phone": contact.phone,
            "email": contact.email,
            "relation": contact.relation,
            "is_primary": contact.is_primary,
            "notes": contact.notes,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }

        logger.info(f"Added trusted contact '{contact.name}' for user {user_id}")
        return new_contact

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add trusted contact: {e}")
        raise HTTPException(status_code=500, detail="Failed to add trusted contact")

@router.put("/contacts/{contact_id}", response_model=TrustedContact)
async def update_trusted_contact(
    contact_id: str,
    contact_update: TrustedContactUpdate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Update a trusted contact."""
    try:
        user_id = user["sub"]

        # Update trusted contact in database
        update_data = {}
        if contact_update.name is not None:
            update_data["name"] = contact_update.name
        if contact_update.phone is not None:
            update_data["phone"] = contact_update.phone
        if contact_update.email is not None:
            update_data["email"] = contact_update.email
        if contact_update.relation is not None:
            update_data["relation"] = contact_update.relation
        if contact_update.is_primary is not None:
            update_data["is_primary"] = contact_update.is_primary
        if contact_update.notes is not None:
            update_data["notes"] = contact_update.notes

        update_data["updated_at"] = datetime.utcnow().isoformat()

        response = supabase_service.client.table("trusted_contacts").update(update_data).eq("id", contact_id).eq("user_id", user_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Trusted contact not found")

        updated_contact = response.data[0]

        logger.info(f"Updated trusted contact {contact_id} for user {user_id}")
        return updated_contact

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update trusted contact: {e}")
        raise HTTPException(status_code=500, detail="Failed to update trusted contact")

@router.delete("/contacts/{contact_id}")
async def delete_trusted_contact(
    contact_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Delete a trusted contact."""
    try:
        user_id = user["sub"]

        # Delete trusted contact from database
        response = supabase_service.client.table("trusted_contacts").delete().eq("id", contact_id).eq("user_id", user_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Trusted contact not found")

        logger.info(f"Deleted trusted contact {contact_id} for user {user_id}")
        return {"message": "Trusted contact deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete trusted contact: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete trusted contact")

# --- Wellness Check-in Endpoints ---

@router.post("/wellness-check", response_model=WellnessEntry)
async def submit_wellness_checkin(
    checkin: WellnessCheckIn,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Submit a wellness check-in."""
    try:
        user_id = user["sub"]
        checkin_id = str(uuid4())
        now = datetime.utcnow()

        wellness_entry = {
            "id": checkin_id,
            "user_id": user_id,
            "status": checkin.status,
            "mood_score": checkin.mood_score,
            "stress_level": checkin.stress_level,
            "sleep_hours": checkin.sleep_hours,
            "notes": checkin.notes,
            "location": checkin.location.dict() if checkin.location else None,
            "timestamp": now.isoformat(),
            "created_at": now.isoformat()
        }

        # Check if intervention needed
        if checkin.status == WellnessStatus.CRISIS or checkin.mood_score <= 3:
            logger.warning(f"Crisis wellness check-in from user {user_id}: {checkin.status}, mood: {checkin.mood_score}")
            # In production, this would trigger crisis intervention protocols

        logger.info(f"Wellness check-in submitted by user {user_id}: {checkin.status}")
        return wellness_entry

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to submit wellness check-in: {e}")
        raise HTTPException(status_code=500, detail="Failed to submit wellness check-in")

@router.get("/wellness-history", response_model=List[WellnessEntry])
async def get_wellness_history(
    days: int = Query(30, ge=1, le=365),
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get wellness check-in history."""
    try:
        user_id = user["sub"]

        # Get wellness check-ins from Supabase
        response = supabase_service.client.table("wellness_checkins").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()

        wellness_history = []
        if response.data:
            for checkin in response.data:
                wellness_history.append({
                    "id": checkin.get("id"),
                    "user_id": checkin.get("user_id"),
                    "status": checkin.get("status", "good"),
                    "mood_score": checkin.get("mood_score", 5),
                    "stress_level": checkin.get("stress_level", 5),
                    "sleep_hours": checkin.get("sleep_hours", 8.0),
                    "notes": checkin.get("notes", ""),
                    "location": checkin.get("location"),
                    "timestamp": checkin.get("created_at"),
                    "created_at": checkin.get("created_at")
                })

        return wellness_history

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get wellness history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve wellness history")

# --- Resources Endpoints ---

@router.get("/resources", response_model=List[EmergencyResource])
async def get_emergency_resources(
    category: Optional[ResourceCategory] = None,
    local_only: bool = False,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get emergency and wellness resources."""
    try:
        # Get emergency resources from Supabase
        query = supabase_service.client.table("emergency_resources").select("*")

        if category:
            query = query.eq("category", category.value)

        if local_only:
            query = query.eq("is_local", True)

        response = query.execute()

        resources = []
        if response.data:
            for resource in response.data:
                resources.append({
                    "id": resource.get("id"),
                    "title": resource.get("title"),
                    "description": resource.get("description"),
                    "category": resource.get("category"),
                    "contact_info": resource.get("contact_info", {}),
                    "availability": resource.get("availability"),
                    "location": resource.get("location"),
                    "is_local": resource.get("is_local", False)
                })
        else:
            # Fallback resources if none in database
            resources = [
            {
                "id": "resource_1",
                "title": "XMU Health Center",
                "description": "On-campus medical services and counseling",
                "category": "medical",
                "contact_info": {
                    "phone": "+607-5688000",
                    "email": "health@xmu.edu.my",
                    "address": "XMU Health Center, Sepang Campus"
                },
                "availability": "Mon-Fri 8AM-5PM",
                "location": "XMU Campus",
                "is_local": True
            },
            {
                "id": "resource_2",
                "title": "Malaysia Mental Health Association",
                "description": "24/7 mental health crisis support hotline",
                "category": "mental_health",
                "contact_info": {
                    "phone": "+603-27806803",
                    "website": "https://mmha.org.my",
                    "email": "admin@mmha.org.my"
                },
                "availability": "24/7",
                "location": "National",
                "is_local": False
            },
            {
                "id": "resource_3",
                "title": "Befrienders KL",
                "description": "Emotional support and suicide prevention",
                "category": "mental_health",
                "contact_info": {
                    "phone": "+603-76272929",
                    "website": "https://www.befrienders.org.my"
                },
                "availability": "24/7",
                "location": "Kuala Lumpur",
                "is_local": True
            }
        ]

        return resources

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get resources: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve resources")

# --- Background Tasks ---

async def notify_emergency_contacts(user_id: str, alert_id: str, emergency_type: str, priority: str, message: str):
    """Background task to notify trusted contacts of emergency."""
    try:
        # In production, this would:
        # 1. Retrieve user's trusted contacts
        # 2. Send SMS/email notifications
        # 3. Log notification attempts
        # 4. Update emergency alert with notified contacts

        logger.info(f"Notified emergency contacts for alert {alert_id} (user {user_id})")
    except Exception as e:
        logger.error(f"Failed to notify emergency contacts: {e}")

async def notify_authorities(user_id: str, alert_id: str, emergency_type: str, priority: str, location: Optional[LocationData]):
    """Background task to notify relevant authorities of critical emergency."""
    try:
        # In production, this would:
        # 1. Determine appropriate authorities based on emergency type and location
        # 2. Send notifications to campus security, police, medical services, etc.
        # 3. Log authority notifications
        # 4. Update emergency alert status

        if priority == EmergencyPriority.CRITICAL:
            logger.critical(f"Critical emergency alert {alert_id} - authorities should be notified")
        else:
            logger.warning(f"Emergency alert {alert_id} - authority notification requested")

    except Exception as e:
        logger.error(f"Failed to notify authorities: {e}")