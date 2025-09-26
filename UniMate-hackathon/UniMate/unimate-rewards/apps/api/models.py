"""
UniMate Database Models
统一的数据库模型定义，包含所有表结构
"""

from sqlalchemy import create_engine, Column, String, BigInteger, Text, DateTime, Boolean, Integer, ForeignKey, DECIMAL, JSON, text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from datetime import datetime
import logging

from config import settings

logger = logging.getLogger(__name__)

# Database setup
if not settings.SUPABASE_DB_URL:
    raise RuntimeError("Set SUPABASE_DB_URL in .env")

engine = create_engine(settings.SUPABASE_DB_URL, echo=False, future=True)
Base = declarative_base()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# === Core User Management Models ===

class Profile(Base):
    """用户档案表 - 存储用户个人和医疗信息"""
    __tablename__ = "profiles"
    
    id = Column(String, primary_key=True)  # UUID from Supabase auth
    name = Column(String(60), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(20))
    address = Column(Text)
    date_of_birth = Column(DateTime)
    avatar_url = Column(Text)
    emergency_contact_name = Column(String(100))
    emergency_contact_phone = Column(String(20))
    emergency_contact_relation = Column(String(50))
    blood_type = Column(String(10))
    allergies = Column(Text)
    medications = Column(Text)
    medical_history = Column(Text)
    emergency_conditions = Column(Text)
    preferred_clinic = Column(String(200))
    current_mood = Column(String(20))
    campus_verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    tasks = relationship("Task", back_populates="owner")
    trusted_contacts = relationship("TrustedContact", back_populates="user")
    emergency_alerts = relationship("EmergencyAlert", back_populates="user")
    wellness_checkins = relationship("WellnessCheckin", back_populates="user")


class Task(Base):
    """任务表 - 存储用户任务和提醒"""
    __tablename__ = "tasks"
    
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("profiles.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    notes = Column(Text)
    category = Column(String(50), nullable=False, default='other')
    kind = Column(String(20), nullable=False, default='event')
    starts_at = Column(DateTime(timezone=True), nullable=False)
    ends_at = Column(DateTime(timezone=True))
    priority = Column(String(10), default='medium')
    is_completed = Column(Boolean, nullable=False, default=False)
    remind_minutes_before = Column(Integer, default=30)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    owner = relationship("Profile", back_populates="tasks")


# === Emergency & Wellness Models ===

class TrustedContact(Base):
    """信任联系人表 - 紧急联系人"""
    __tablename__ = "trusted_contacts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(String, ForeignKey("profiles.id"), nullable=False, index=True)
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
    """紧急警报表 - SOS警报记录"""
    __tablename__ = "emergency_alerts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(String, ForeignKey("profiles.id"), nullable=False, index=True)
    emergency_type = Column(String(50), nullable=False)
    priority = Column(String(20), nullable=False)
    message = Column(Text, nullable=False)
    location = Column(JSON)
    status = Column(String(20), default='active')
    contacts_notified = Column(ARRAY(String))
    authorities_notified = Column(Boolean, default=False)
    medical_conditions = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    resolved_at = Column(DateTime(timezone=True))

    # Relationships
    user = relationship("Profile", back_populates="emergency_alerts")


class WellnessCheckin(Base):
    """健康检查表 - 用户健康状态记录"""
    __tablename__ = "wellness_checkins"
    
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(String, ForeignKey("profiles.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False)
    mood_score = Column(Integer)  # 1-10
    stress_level = Column(Integer)  # 1-10
    sleep_hours = Column(DECIMAL(3, 1))
    notes = Column(Text)
    location = Column(JSON)
    timestamp = Column(DateTime(timezone=True), server_default=text("NOW()"))
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))

    # Relationships
    user = relationship("Profile", back_populates="wellness_checkins")


# === Blockchain Models ===

class UserSmartAccount(Base):
    """智能账户表 - 区块链集成"""
    __tablename__ = "user_smart_accounts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(String, ForeignKey("profiles.id"), nullable=False, index=True)
    smart_account_address = Column(String(42), nullable=False)
    signer_address = Column(String(42), nullable=False)
    encrypted_private_key = Column(Text)  # 存储加密的私钥
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))


class TokenRedemption(Base):
    """代币兑换记录表 - 区块链交易记录"""
    __tablename__ = "token_redemptions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(String, ForeignKey("profiles.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)
    transaction_hash = Column(String(66))
    success = Column(Boolean, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))


# === Blockchain Extended Models (from blockchain.py) ===

class Voucher(Base):
    """代币兑换凭证"""
    __tablename__ = "vouchers"
    
    code = Column(String(64), primary_key=True)
    address = Column(String(42), index=True, nullable=False)
    reward_id = Column(String(128), nullable=False)
    amount_wei = Column(String(78), nullable=False)
    approve_tx = Column(String(66), nullable=False)
    redeem_tx = Column(String(66), nullable=False)
    status = Column(String(16), default="issued")
    created_at = Column(BigInteger, nullable=False)
    note = Column(Text, default="")


class User(Base):
    """区块链用户表"""
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)  # Supabase user ID
    email = Column(String(255), unique=True, nullable=False)
    wallet_address = Column(String(42))
    smart_account_address = Column(String(42))
    total_points = Column(Integer, default=0)
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)

    # Relationships
    accounts = relationship("Account", back_populates="user")
    user_operations = relationship("UserOperation", back_populates="user")
    user_points = relationship("UserPoints", back_populates="user")


class Account(Base):
    """用户账户表"""
    __tablename__ = "accounts"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    account_type = Column(String(50), nullable=False)  # 'eoa', 'smart_account'
    address = Column(String(42), unique=True, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(BigInteger, nullable=False)

    # Relationships
    user = relationship("User", back_populates="accounts")


class UserOperation(Base):
    """用户操作记录表"""
    __tablename__ = "user_operations"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    user_op_hash = Column(String(66), unique=True, nullable=False)
    transaction_hash = Column(String(66))
    status = Column(String(20), default='pending')  # pending, success, failed
    operation_type = Column(String(50), nullable=False)  # mint, redeem, transfer
    amount = Column(String(78))
    gas_used = Column(String(78))
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)

    # Relationships
    user = relationship("User", back_populates="user_operations")


class Challenge(Base):
    """挑战表"""
    __tablename__ = "challenges"
    
    id = Column(String, primary_key=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    reward_points = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(BigInteger, nullable=False)


class UserChallenge(Base):
    """用户挑战完成记录"""
    __tablename__ = "user_challenges"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    challenge_id = Column(String, ForeignKey("challenges.id"), nullable=False)
    status = Column(String(20), default='in_progress')  # in_progress, completed, failed
    points_earned = Column(Integer, default=0)
    completed_at = Column(BigInteger)
    created_at = Column(BigInteger, nullable=False)

    # Relationships
    user = relationship("User")
    challenge = relationship("Challenge")


class UserPoints(Base):
    """用户积分记录"""
    __tablename__ = "user_points"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    points = Column(Integer, nullable=False)
    source = Column(String(100), nullable=False)  # challenge, task_completion, etc.
    transaction_type = Column(String(20), nullable=False)  # earned, spent, redeemed
    reference_id = Column(String(100))  # challenge_id, task_id, etc.
    created_at = Column(BigInteger, nullable=False)

    # Relationships
    user = relationship("User", back_populates="user_points")


# === Database Management Functions ===

def get_db():
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_database():
    """初始化数据库表"""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


# SQL Schema for manual creation (if needed)
DATABASE_SCHEMA = """
-- UniMate Database Schema
-- This schema can be run in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 用户档案表 (存储用户个人和医疗信息)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    date_of_birth DATE,
    avatar_url TEXT,
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relation VARCHAR(50),
    blood_type VARCHAR(10),
    allergies TEXT,
    medications TEXT,
    medical_history TEXT,
    emergency_conditions TEXT,
    preferred_clinic VARCHAR(200),
    current_mood VARCHAR(20),
    campus_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 任务表 (存储用户任务和提醒)
CREATE TABLE IF NOT EXISTS tasks (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    notes TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'other',
    kind VARCHAR(20) NOT NULL DEFAULT 'event',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    priority VARCHAR(10) DEFAULT 'medium',
    is_completed BOOLEAN DEFAULT FALSE,
    remind_minutes_before INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 信任联系人表 (紧急联系人)
CREATE TABLE IF NOT EXISTS trusted_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    relation VARCHAR(50) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 紧急警报表 (SOS警报记录)
CREATE TABLE IF NOT EXISTS emergency_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    emergency_type VARCHAR(50) NOT NULL,
    priority VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    location JSONB,
    status VARCHAR(20) DEFAULT 'active',
    contacts_notified TEXT[],
    authorities_notified BOOLEAN DEFAULT FALSE,
    medical_conditions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 健康检查表 (用户健康状态记录)
CREATE TABLE IF NOT EXISTS wellness_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    mood_score INTEGER CHECK (mood_score >= 1 AND mood_score <= 10),
    stress_level INTEGER CHECK (stress_level >= 1 AND stress_level <= 10),
    sleep_hours DECIMAL(3,1),
    notes TEXT,
    location JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 智能账户表 (区块链集成)
CREATE TABLE IF NOT EXISTS user_smart_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    smart_account_address VARCHAR(42) NOT NULL,
    signer_address VARCHAR(42) NOT NULL,
    encrypted_private_key TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 代币兑换记录表 (区块链交易记录)
CREATE TABLE IF NOT EXISTS token_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    transaction_hash VARCHAR(66),
    success BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 区块链扩展表
CREATE TABLE IF NOT EXISTS vouchers (
    code VARCHAR(64) PRIMARY KEY,
    address VARCHAR(42) NOT NULL,
    reward_id VARCHAR(128) NOT NULL,
    amount_wei VARCHAR(78) NOT NULL,
    approve_tx VARCHAR(66) NOT NULL,
    redeem_tx VARCHAR(66) NOT NULL,
    status VARCHAR(16) DEFAULT 'issued',
    created_at BIGINT NOT NULL,
    note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    wallet_address VARCHAR(42),
    smart_account_address VARCHAR(42),
    total_points INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id),
    account_type VARCHAR(50) NOT NULL,
    address VARCHAR(42) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_operations (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id),
    user_op_hash VARCHAR(66) UNIQUE NOT NULL,
    transaction_hash VARCHAR(66),
    status VARCHAR(20) DEFAULT 'pending',
    operation_type VARCHAR(50) NOT NULL,
    amount VARCHAR(78),
    gas_used VARCHAR(78),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges (
    id VARCHAR PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    reward_points INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_challenges (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id),
    challenge_id VARCHAR REFERENCES challenges(id),
    status VARCHAR(20) DEFAULT 'in_progress',
    points_earned INTEGER DEFAULT 0,
    completed_at BIGINT,
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_points (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id),
    points INTEGER NOT NULL,
    source VARCHAR(100) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    reference_id VARCHAR(100),
    created_at BIGINT NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_starts_at ON tasks(starts_at);
CREATE INDEX IF NOT EXISTS idx_trusted_contacts_user_id ON trusted_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_alerts_user_id ON emergency_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_wellness_checkins_user_id ON wellness_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_wellness_checkins_timestamp ON wellness_checkins(timestamp);
CREATE INDEX IF NOT EXISTS idx_vouchers_address ON vouchers(address);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_operations_user_id ON user_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_challenges_user_id ON user_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_points_user_id ON user_points(user_id);

-- 设置行级安全策略 (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE trusted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wellness_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_smart_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_redemptions ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的数据
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own tasks" ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tasks" ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks" ON tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tasks" ON tasks FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own contacts" ON trusted_contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own contacts" ON trusted_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own contacts" ON trusted_contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own contacts" ON trusted_contacts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own alerts" ON emergency_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON emergency_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON emergency_alerts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own checkins" ON wellness_checkins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own checkins" ON wellness_checkins FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own smart accounts" ON user_smart_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own smart accounts" ON user_smart_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own redemptions" ON token_redemptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own redemptions" ON token_redemptions FOR INSERT WITH CHECK (auth.uid() = user_id);
"""

# Note: Database initialization should be called explicitly
# Use init_database() or run init_db.py script
