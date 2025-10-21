"""
UniMate Unified Database Models
================================
Centralized SQLAlchemy ORM models for all backend functionality.

This file replaces the scattered model definitions and provides a single source
of truth for the database schema.

Tables:
- Core User Management: profiles, tasks, reminders
- Emergency & Wellness: trusted_contacts, emergency_alerts, wellness_checkins
- Blockchain: user_operations, vouchers, smart_account_info
- Rewards & Challenges: wellness_challenges, user_challenges, user_points
- Vouchers & Rewards: vouchers_catalog, user_vouchers
- Activity Tracking: activity_logs
"""

from sqlalchemy import create_engine, Column, String, BigInteger, Text, DateTime, Boolean, Integer, ForeignKey, DECIMAL, JSON, Enum as SQLEnum, UniqueConstraint
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.sql import text
from datetime import datetime
import logging

from config import settings

logger = logging.getLogger(__name__)

# Database setup
DB_URL = settings.SUPABASE_DB_URL or settings.DATABASE_URL
if not DB_URL:
    raise RuntimeError("Set SUPABASE_DB_URL or DATABASE_URL in .env")

engine = create_engine(DB_URL, echo=False, future=True, pool_pre_ping=True)
Base = declarative_base()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


# ===================================================================
# CORE USER MANAGEMENT MODELS
# ===================================================================

class Profile(Base):
    """User profiles - stores personal and medical information"""
    __tablename__ = "profiles"

    id = Column(String, primary_key=True)  # UUID from Supabase auth
    name = Column(String(60), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    phone = Column(String(20))
    address = Column(Text)
    date_of_birth = Column(DateTime)
    avatar_url = Column(Text)

    # Emergency contact information
    emergency_contact_name = Column(String(100))
    emergency_contact_phone = Column(String(20))
    emergency_contact_relation = Column(String(50))

    # Medical information
    blood_type = Column(String(10))
    allergies = Column(Text)
    medications = Column(Text)
    medical_history = Column(Text)
    emergency_conditions = Column(Text)
    preferred_clinic = Column(String(200))

    # Status fields
    current_mood = Column(String(20))
    campus_verified = Column(Boolean, nullable=False, default=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    # Relationships
    tasks = relationship("Task", back_populates="owner", cascade="all, delete-orphan")
    reminders = relationship("Reminder", back_populates="owner", cascade="all, delete-orphan")
    trusted_contacts = relationship("TrustedContact", back_populates="user", cascade="all, delete-orphan")
    emergency_alerts = relationship("EmergencyAlert", back_populates="user", cascade="all, delete-orphan")
    wellness_checkins = relationship("WellnessCheckin", back_populates="user", cascade="all, delete-orphan")
    push_tokens = relationship("PushToken", back_populates="profile", cascade="all, delete-orphan")

    # Blockchain/Rewards relationships
    user_operations = relationship("UserOperation", cascade="all, delete-orphan")
    user_challenges = relationship("UserChallenge", cascade="all, delete-orphan")
    user_points = relationship("UserPoints", uselist=False, cascade="all, delete-orphan")
    smart_account = relationship("SmartAccountInfo", uselist=False, cascade="all, delete-orphan")


class Task(Base):
    """Tasks and reminders for users"""
    __tablename__ = "tasks"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    notes = Column(Text)
    category = Column(String(50), nullable=False, default='other')  # academic, health, social, etc.
    kind = Column(String(20), nullable=False, default='event')  # event, reminder, task
    starts_at = Column(DateTime(timezone=True), nullable=False)
    ends_at = Column(DateTime(timezone=True))
    priority = Column(String(10), default='medium')  # low, medium, high
    is_completed = Column(Boolean, nullable=False, default=False)
    remind_minutes_before = Column(Integer, default=30)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    # Relationships
    owner = relationship("Profile", back_populates="tasks")


class Reminder(Base):
    """Reminders for users - separate from tasks"""
    __tablename__ = "reminders"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    reminder_time = Column(DateTime(timezone=True), nullable=False)
    repeat_type = Column(String(20), nullable=False, default='once')  # once, daily, weekly, monthly
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    # Relationships
    owner = relationship("Profile", back_populates="reminders")


class PushToken(Base):
    """Push notification tokens for mobile devices"""
    __tablename__ = "push_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    profile_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    push_token = Column(String(255), nullable=False, unique=True, index=True)  # Expo push token
    device_type = Column(String(20))  # 'ios' or 'android'
    device_name = Column(String(100))  # Optional: Device model/name
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    # Relationships
    profile = relationship("Profile", back_populates="push_tokens")


# ===================================================================
# EMERGENCY & WELLNESS MODELS
# ===================================================================

class TrustedContact(Base):
    """Trusted emergency contacts"""
    __tablename__ = "trusted_contacts"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=False)
    email = Column(String(255))
    relation = Column(String(50), nullable=False)
    is_primary = Column(Boolean, default=False)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("NOW()"))

    # Relationships
    user = relationship("Profile", back_populates="trusted_contacts")


class EmergencyAlert(Base):
    """SOS emergency alert records"""
    __tablename__ = "emergency_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    emergency_type = Column(String(50), nullable=False)  # medical, safety, mental_health
    priority = Column(String(20), nullable=False)  # critical, high, medium
    message = Column(Text, nullable=False)
    location = Column(JSON)
    status = Column(String(20), default='active')  # active, resolved, cancelled
    contacts_notified = Column(ARRAY(String))
    authorities_notified = Column(Boolean, default=False)
    medical_conditions = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    resolved_at = Column(DateTime(timezone=True))

    # Relationships
    user = relationship("Profile", back_populates="emergency_alerts")


class WellnessCheckin(Base):
    """User wellness check-in records"""
    __tablename__ = "wellness_checkins"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), nullable=False)  # ok, struggling, emergency
    mood_score = Column(Integer)  # 1-10
    stress_level = Column(Integer)  # 1-10
    sleep_hours = Column(DECIMAL(3, 1))
    notes = Column(Text)
    location = Column(JSON)
    timestamp = Column(DateTime(timezone=True), server_default=text("NOW()"))
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))

    # Relationships
    user = relationship("Profile", back_populates="wellness_checkins")


# ===================================================================
# BLOCKCHAIN MODELS
# ===================================================================

# User model removed - all functionality migrated to Profile model
# Rewards, challenges, and points now link directly to profiles table

class UserOperation(Base):
    """ERC-4337 User Operations (gasless transactions)"""
    __tablename__ = "user_operations"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_op_hash = Column(String(66), unique=True, nullable=False, index=True)
    profile_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    aa_address = Column(String(42), nullable=False, index=True)
    status = Column(SQLEnum("pending", "success", "failed", "reverted", name="userop_status"), nullable=False, default="pending")
    entry_point_tx_hash = Column(String(66), nullable=True)
    revert_reason = Column(Text, nullable=True)
    calls_data = Column(Text, nullable=False)  # JSON string of the calls
    chain_id = Column(BigInteger, nullable=False, default=80002)
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)

    # Relationships
    profile = relationship("Profile", back_populates="user_operations")


class Voucher(Base):
    """Redemption vouchers"""
    __tablename__ = "vouchers"

    code = Column(String(64), primary_key=True)
    address = Column(String(42), index=True, nullable=False)
    reward_id = Column(String(128), nullable=False)
    amount_wei = Column(String(78), nullable=False)
    approve_tx = Column(String(66), nullable=False)
    redeem_tx = Column(String(66), nullable=False)
    status = Column(String(16), default="issued")  # issued, redeemed, expired
    created_at = Column(BigInteger, nullable=False)
    note = Column(Text, default="")


# ===================================================================
# REWARDS & CHALLENGES MODELS
# ===================================================================

class Challenge(Base):
    """Wellness challenges"""
    __tablename__ = "wellness_challenges"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=False)
    duration_minutes = Column(Integer, nullable=False)  # For time-based challenges
    points_reward = Column(Integer, nullable=False, default=100)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(BigInteger, nullable=False)

    # Relationships
    user_challenges = relationship("UserChallenge", cascade="all, delete-orphan")


class UserChallenge(Base):
    """User progress on challenges"""
    __tablename__ = "user_challenges"
    __table_args__ = (
        # Unique constraint: One challenge per user per day
        # Prevents duplicate challenge completion even in race conditions
        UniqueConstraint('profile_id', 'challenge_id', 'date', name='uq_user_challenge_date'),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    profile_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    challenge_id = Column(Integer, ForeignKey("wellness_challenges.id", ondelete="CASCADE"), nullable=False)
    date = Column(String(10), nullable=False)  # YYYY-MM-DD format
    status = Column(SQLEnum("not_started", "in_progress", "completed", "failed", name="challenge_status"), nullable=False, default="not_started")
    started_at = Column(BigInteger, nullable=True)
    completed_at = Column(BigInteger, nullable=True)

    # Relationships
    profile = relationship("Profile", back_populates="user_challenges")
    challenge = relationship("Challenge", back_populates="user_challenges")


class UserPoints(Base):
    """User points balance and daily tracking with reconciliation support"""
    __tablename__ = "user_points"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    profile_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    total_points = Column(BigInteger, nullable=False, default=0)  # Cumulative total (never reset)
    earned_today = Column(BigInteger, nullable=False, default=0)
    last_updated = Column(BigInteger, nullable=False)
    last_daily_reset = Column(String(10), nullable=False)  # YYYY-MM-DD format

    # Reconciliation tracking
    points_reconciled = Column(BigInteger, nullable=False, default=0)  # Points already converted to WELL
    last_reconciliation_date = Column(DateTime(timezone=True))  # Last reconciliation timestamp
    last_reconciliation_tx = Column(String(66))  # Transaction hash of last reconciliation

    # Relationships
    profile = relationship("Profile", back_populates="user_points")


# ===================================================================
# SMART ACCOUNT MANAGEMENT MODELS
# ===================================================================

class SmartAccountInfo(Base):
    """Smart account information for user profiles (linked to Supabase auth)"""
    __tablename__ = "smart_account_info"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    smart_account_address = Column(String(42), unique=True, nullable=False, index=True)
    signer_address = Column(String(42), nullable=False)
    encrypted_private_key = Column(Text, nullable=False)  # Encrypted for security
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    # Relationships
    user = relationship("Profile")


# ===================================================================
# ACTIVITY LOGGING MODEL (Consolidated)
# ===================================================================

class ActivityLog(Base):
    """Consolidated log for all user activities, transactions, and redemptions

    Replaces: RedemptionLog, WellnessRedemptionLog, PointRedemptionLog, RewardClaimLog
    """
    __tablename__ = "activity_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    profile_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)

    # Type of activity (general_redemption, wellness_redemption, point_redemption, reward_claim, etc.)
    activity_type = Column(String(50), nullable=False, index=True)

    # Generic fields for common data
    amount = Column(Integer)  # Points or token amounts
    smart_account_address = Column(String(42), index=True)
    transaction_hash = Column(String(66), index=True)
    status = Column(String(20), nullable=False, default='success')  # success, failed, pending

    # Flexible JSONB field for activity-specific data
    # Examples:
    #   - {"reward_id": "...", "voucher_id": "..."}
    #   - {"task_id": "...", "challenge_id": "..."}
    #   - {"points_earned": 100, "source": "wellness_checkin"}
    details = Column(JSONB)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    # Relationships
    profile = relationship("Profile")


# ===================================================================
# VOUCHERS CATALOG & USER VOUCHERS MODELS
# ===================================================================

class VouchersCatalog(Base):
    """Master catalog of available vouchers for redemption"""
    __tablename__ = "vouchers_catalog"

    id = Column(String(128), primary_key=True)  # e.g., "food_starbucks_10"
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    points_required = Column(Integer, nullable=False)
    category = Column(String(50), nullable=False, index=True)  # food, wellness, shopping, education, entertainment
    image_url = Column(Text)
    terms_conditions = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    # Relationships
    user_vouchers = relationship("UserVouchers", back_populates="voucher_catalog")


class UserVouchers(Base):
    """Track user's redeemed vouchers"""
    __tablename__ = "user_vouchers"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    profile_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    voucher_id = Column(String(128), ForeignKey("vouchers_catalog.id"), nullable=False, index=True)
    redemption_code = Column(String(64), nullable=False, unique=True, index=True)
    status = Column(String(20), nullable=False, default='active')  # active, used, expired
    points_spent = Column(Integer, nullable=False)
    transaction_hash = Column(String(66))
    redeemed_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    expires_at = Column(DateTime(timezone=True))
    used_at = Column(DateTime(timezone=True))

    # Relationships
    profile = relationship("Profile")
    voucher_catalog = relationship("VouchersCatalog", back_populates="user_vouchers")


# ===================================================================
# DATABASE HELPER FUNCTIONS
# ===================================================================

def get_db():
    """Get database session (dependency injection pattern for FastAPI)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def db():
    """Get database session (direct pattern for non-FastAPI code)"""
    return SessionLocal()


def init_database():
    """Initialize database tables"""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database tables initialized successfully")
        logger.info(f"   Connected to: {DB_URL.split('@')[1] if '@' in DB_URL else 'database'}")
    except Exception as e:
        logger.error(f"❌ Failed to initialize database: {e}")
        raise


# Initialize database on import
if __name__ != "__main__":
    try:
        init_database()
    except Exception as e:
        logger.warning(f"⚠️  Database initialization skipped: {e}")
