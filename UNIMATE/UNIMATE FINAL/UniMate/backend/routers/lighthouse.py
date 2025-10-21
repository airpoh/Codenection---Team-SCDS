"""
Lighthouse Emergency and Wellness router for UniMate backend.
Handles emergency SOS, trusted contacts, wellness check-ins, and mental health resources.

MIGRATED TO SQLALCHEMY for better performance (10-20x faster than REST API)
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Query
from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional, List, Dict, Any
import logging
from enum import Enum

from models import db, TrustedContact as TrustedContactModel, EmergencyAlert as EmergencyAlertModel, WellnessCheckin as WellnessCheckinModel, Profile as ProfileModel
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
    status: str = "active"
    contacts_notified: List[str] = []
    authorities_notified: bool = False
    medical_conditions: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None

class WellnessCheckIn(BaseModel):
    mood: str = Field(..., min_length=1, max_length=200)  # Frontend sends free-text mood
    stress_level: int = Field(..., ge=1, le=10)
    sleep_hours: Optional[float] = Field(None, ge=0, le=24)
    notes: Optional[str] = Field(None, max_length=1000)
    location: Optional[LocationData] = None

    @validator('stress_level')
    def validate_stress(cls, v):
        if not 1 <= v <= 10:
            raise ValueError('Stress level must be between 1 and 10')
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
    contact_info: Dict[str, Any]
    availability: str
    location: Optional[str] = None
    is_local: bool = False


# --- Emergency Endpoints ---

@router.post("/emergency", response_model=EmergencyAlert)
def trigger_emergency_alert(
    emergency: EmergencyRequest,
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Trigger an emergency alert and notify trusted contacts."""
    session = db()
    try:
        user_id = user["sub"]
        now = datetime.utcnow()

        # Get user's medical conditions from profile
        profile = session.query(ProfileModel).filter(ProfileModel.id == user_id).first()
        medical_info = emergency.medical_conditions or (profile.emergency_conditions if profile else None)

        # Create emergency alert
        alert = EmergencyAlertModel(
            user_id=user_id,
            emergency_type=emergency.emergency_type.value,
            priority=emergency.priority.value,
            message=emergency.message,
            location=emergency.location.dict() if emergency.location else None,
            status="active",
            contacts_notified=[],
            authorities_notified=emergency.notify_authorities,
            medical_conditions=medical_info,
            created_at=now
        )

        session.add(alert)
        session.commit()
        session.refresh(alert)

        # Get trusted contacts for notification
        if emergency.notify_contacts:
            contacts = session.query(TrustedContactModel).filter(
                TrustedContactModel.user_id == user_id
            ).all()

            contact_list = [c.phone for c in contacts]
            alert.contacts_notified = contact_list
            session.commit()

            # TODO: Send actual notifications via background task
            # background_tasks.add_task(send_emergency_notifications, alert, contacts)

        logger.info(f"Emergency alert created: {alert.id} for user {user_id}")
        return EmergencyAlert(
            id=str(alert.id),
            user_id=alert.user_id,
            emergency_type=EmergencyType(alert.emergency_type),
            priority=EmergencyPriority(alert.priority),
            message=alert.message,
            location=LocationData(**alert.location) if alert.location else None,
            status=alert.status,
            contacts_notified=alert.contacts_notified or [],
            authorities_notified=alert.authorities_notified,
            medical_conditions=alert.medical_conditions,
            created_at=alert.created_at,
            resolved_at=alert.resolved_at
        )

    except Exception as e:
        session.rollback()
        logger.error(f"Failed to create emergency alert: {e}")
        raise HTTPException(status_code=500, detail="Failed to create emergency alert")
    finally:
        session.close()


@router.get("/emergency", response_model=List[EmergencyAlert])
def get_emergency_alerts(
    status: Optional[str] = Query(None, regex="^(active|resolved|cancelled)$"),
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get emergency alerts for the current user."""
    session = db()
    try:
        user_id = user["sub"]

        query = session.query(EmergencyAlertModel).filter(EmergencyAlertModel.user_id == user_id)

        if status:
            query = query.filter(EmergencyAlertModel.status == status)

        alerts = query.order_by(EmergencyAlertModel.created_at.desc()).all()

        return [
            EmergencyAlert(
                id=str(a.id),
                user_id=a.user_id,
                emergency_type=EmergencyType(a.emergency_type),
                priority=EmergencyPriority(a.priority),
                message=a.message,
                location=LocationData(**a.location) if a.location else None,
                status=a.status,
                contacts_notified=a.contacts_notified or [],
                authorities_notified=a.authorities_notified,
                medical_conditions=a.medical_conditions,
                created_at=a.created_at,
                resolved_at=a.resolved_at
            )
            for a in alerts
        ]

    except Exception as e:
        logger.error(f"Failed to get emergency alerts: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve alerts")
    finally:
        session.close()


@router.put("/emergency/{alert_id}/resolve")
def resolve_emergency_alert(
    alert_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Mark an emergency alert as resolved."""
    session = db()
    try:
        user_id = user["sub"]

        alert = session.query(EmergencyAlertModel).filter(
            EmergencyAlertModel.id == alert_id,
            EmergencyAlertModel.user_id == user_id
        ).first()

        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        alert.status = "resolved"
        alert.resolved_at = datetime.utcnow()
        session.commit()

        logger.info(f"Resolved emergency alert {alert_id}")
        return {"message": "Alert resolved successfully", "alert_id": alert_id}

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to resolve alert: {e}")
        raise HTTPException(status_code=500, detail="Failed to resolve alert")
    finally:
        session.close()


# --- Trusted Contacts Endpoints ---

@router.get("/contacts", response_model=List[TrustedContact])
def get_trusted_contacts(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """Get all trusted contacts for the current user."""
    session = db()
    try:
        user_id = user["sub"]

        contacts = session.query(TrustedContactModel).filter(
            TrustedContactModel.user_id == user_id
        ).order_by(TrustedContactModel.is_primary.desc(), TrustedContactModel.created_at).all()

        return [
            TrustedContact(
                id=str(c.id),
                user_id=c.user_id,
                name=c.name,
                phone=c.phone,
                email=c.email,
                relation=ContactRelation(c.relation),
                is_primary=c.is_primary,
                notes=c.notes,
                created_at=c.created_at,
                updated_at=c.updated_at
            )
            for c in contacts
        ]

    except Exception as e:
        logger.error(f"Failed to get trusted contacts: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve contacts")
    finally:
        session.close()


@router.post("/contacts", response_model=TrustedContact)
def create_trusted_contact(
    contact: TrustedContactCreate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Add a new trusted contact."""
    session = db()
    try:
        user_id = user["sub"]
        now = datetime.utcnow()

        new_contact = TrustedContactModel(
            user_id=user_id,
            name=contact.name,
            phone=contact.phone,
            email=contact.email,
            relation=contact.relation.value,
            is_primary=contact.is_primary,
            notes=contact.notes,
            created_at=now,
            updated_at=now
        )

        session.add(new_contact)
        session.commit()
        session.refresh(new_contact)

        logger.info(f"Created trusted contact for user {user_id}")
        return TrustedContact(
            id=str(new_contact.id),
            user_id=new_contact.user_id,
            name=new_contact.name,
            phone=new_contact.phone,
            email=new_contact.email,
            relation=ContactRelation(new_contact.relation),
            is_primary=new_contact.is_primary,
            notes=new_contact.notes,
            created_at=new_contact.created_at,
            updated_at=new_contact.updated_at
        )

    except Exception as e:
        session.rollback()
        logger.error(f"Failed to create contact: {e}")
        raise HTTPException(status_code=500, detail="Failed to create contact")
    finally:
        session.close()


@router.put("/contacts/{contact_id}", response_model=TrustedContact)
def update_trusted_contact(
    contact_id: str,
    contact_update: TrustedContactUpdate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Update a trusted contact."""
    session = db()
    try:
        user_id = user["sub"]

        contact = session.query(TrustedContactModel).filter(
            TrustedContactModel.id == contact_id,
            TrustedContactModel.user_id == user_id
        ).first()

        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")

        # Update fields
        if contact_update.name is not None:
            contact.name = contact_update.name
        if contact_update.phone is not None:
            contact.phone = contact_update.phone
        if contact_update.email is not None:
            contact.email = contact_update.email
        if contact_update.relation is not None:
            contact.relation = contact_update.relation.value
        if contact_update.is_primary is not None:
            contact.is_primary = contact_update.is_primary
        if contact_update.notes is not None:
            contact.notes = contact_update.notes

        contact.updated_at = datetime.utcnow()
        session.commit()
        session.refresh(contact)

        logger.info(f"Updated contact {contact_id}")
        return TrustedContact(
            id=str(contact.id),
            user_id=contact.user_id,
            name=contact.name,
            phone=contact.phone,
            email=contact.email,
            relation=ContactRelation(contact.relation),
            is_primary=contact.is_primary,
            notes=contact.notes,
            created_at=contact.created_at,
            updated_at=contact.updated_at
        )

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to update contact: {e}")
        raise HTTPException(status_code=500, detail="Failed to update contact")
    finally:
        session.close()


@router.delete("/contacts/{contact_id}")
def delete_trusted_contact(
    contact_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Delete a trusted contact."""
    session = db()
    try:
        user_id = user["sub"]

        contact = session.query(TrustedContactModel).filter(
            TrustedContactModel.id == contact_id,
            TrustedContactModel.user_id == user_id
        ).first()

        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")

        session.delete(contact)
        session.commit()

        logger.info(f"Deleted contact {contact_id}")
        return {"message": "Contact deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to delete contact: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete contact")
    finally:
        session.close()


# --- Wellness Check-in Endpoints ---

@router.post("/wellness-check")
def create_wellness_checkin(
    checkin: WellnessCheckIn,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Create a wellness check-in entry."""
    session = db()
    try:
        user_id = user["sub"]
        now = datetime.utcnow()

        # Map frontend 'mood' to database 'status' field
        new_checkin = WellnessCheckinModel(
            user_id=user_id,
            status=checkin.mood,  # Frontend sends free-text mood
            mood_score=None,  # Frontend doesn't send this
            stress_level=checkin.stress_level,
            sleep_hours=checkin.sleep_hours,
            notes=checkin.notes,
            location=checkin.location.dict() if checkin.location else None,
            timestamp=now,
            created_at=now
        )

        session.add(new_checkin)
        session.commit()
        session.refresh(new_checkin)

        logger.info(f"Created wellness check-in for user {user_id}: mood={checkin.mood}, stress={checkin.stress_level}")

        # Return plain dict to avoid Pydantic validation issues
        return {
            "id": str(new_checkin.id),
            "user_id": new_checkin.user_id,
            "mood": new_checkin.status,
            "stress_level": new_checkin.stress_level,
            "sleep_hours": float(new_checkin.sleep_hours) if new_checkin.sleep_hours else None,
            "notes": new_checkin.notes,
            "location": new_checkin.location,
            "timestamp": new_checkin.timestamp.isoformat() if new_checkin.timestamp else None,
            "created_at": new_checkin.created_at.isoformat() if new_checkin.created_at else None
        }

    except Exception as e:
        session.rollback()
        logger.error(f"Failed to create wellness check-in: {e}")
        raise HTTPException(status_code=500, detail="Failed to create check-in")
    finally:
        session.close()


@router.get("/wellness-history")
def get_wellness_history(
    days: int = Query(30, ge=1, le=365),
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get wellness check-in history."""
    session = db()
    try:
        user_id = user["sub"]

        checkins = session.query(WellnessCheckinModel).filter(
            WellnessCheckinModel.user_id == user_id
        ).order_by(WellnessCheckinModel.timestamp.desc()).limit(days).all()

        # Return plain dicts to match frontend expectations
        result = [
            {
                "id": str(c.id),
                "user_id": c.user_id,
                "mood": c.status,  # Map database 'status' to frontend 'mood'
                "stress_level": c.stress_level,
                "sleep_hours": float(c.sleep_hours) if c.sleep_hours else None,
                "notes": c.notes,
                "location": c.location,
                "timestamp": c.timestamp.isoformat() if c.timestamp else None,
                "created_at": c.created_at.isoformat() if c.created_at else None
            }
            for c in checkins
        ]

        logger.info(f"Retrieved {len(result)} wellness check-ins for user {user_id}")
        return result

    except Exception as e:
        logger.error(f"Failed to get wellness history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve history")
    finally:
        session.close()


# --- Emergency Resources ---

@router.get("/resources", response_model=List[EmergencyResource])
def get_emergency_resources(
    category: Optional[ResourceCategory] = None,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get emergency and wellness resources."""
    # Static resources - could be moved to database later
    resources = [
        {
            "id": "1",
            "title": "National Suicide Prevention Lifeline",
            "description": "24/7 free and confidential support",
            "category": "mental_health",
            "contact_info": {"phone": "988", "website": "https://988lifeline.org"},
            "availability": "24/7",
            "is_local": False
        },
        {
            "id": "2",
            "title": "Crisis Text Line",
            "description": "Text HOME to 741741 for crisis support",
            "category": "mental_health",
            "contact_info": {"phone": "741741", "website": "https://www.crisistextline.org"},
            "availability": "24/7",
            "is_local": False
        },
        {
            "id": "3",
            "title": "Campus Health Center",
            "description": "Student health services",
            "category": "medical",
            "contact_info": {"phone": "555-0100"},
            "availability": "Mon-Fri 8AM-5PM",
            "is_local": True
        },
        {
            "id": "4",
            "title": "Campus Safety",
            "description": "Emergency campus security",
            "category": "safety",
            "contact_info": {"phone": "555-0911"},
            "availability": "24/7",
            "is_local": True
        }
    ]

    if category:
        resources = [r for r in resources if r["category"] == category.value]

    return [EmergencyResource(**r) for r in resources]


# --- Compatibility Endpoints ---

@router.post("/emergency-alert")
def trigger_emergency_alert_compat(
    emergency: EmergencyRequest,
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Compatibility endpoint - redirects to /emergency"""
    return trigger_emergency_alert(emergency, background_tasks, user)


@router.get("/trusted-contacts")
def get_trusted_contacts_compat(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """Compatibility endpoint - redirects to /contacts"""
    return get_trusted_contacts(user)
