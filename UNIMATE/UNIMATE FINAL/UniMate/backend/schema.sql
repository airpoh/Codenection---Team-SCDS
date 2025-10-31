-- UniMate Blockchain Tables Schema
-- Run this in your Supabase SQL Editor to create/restore blockchain tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Vouchers table
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

-- Users table (blockchain users, separate from auth.users)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    wallet_address VARCHAR(42),
    smart_account_address VARCHAR(42),
    total_points INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- Accounts table (Smart Account addresses)
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id),
    aa_address VARCHAR(42) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    created_at BIGINT NOT NULL
);

-- User Operations table (ERC-4337 transactions)
CREATE TABLE IF NOT EXISTS user_operations (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id),
    user_op_hash VARCHAR(66) UNIQUE NOT NULL,
    aa_address VARCHAR(42) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    entry_point_tx_hash VARCHAR(66),
    revert_reason TEXT,
    calls_data TEXT,
    chain_id INTEGER,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- Challenges table
CREATE TABLE IF NOT EXISTS challenges (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    reward_points INTEGER DEFAULT 0,
    challenge_type VARCHAR(50) NOT NULL,
    target_value INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- User Challenges table (user progress on challenges)
CREATE TABLE IF NOT EXISTS user_challenges (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id),
    challenge_id INTEGER REFERENCES challenges(id),
    status VARCHAR(20) DEFAULT 'in_progress',
    progress INTEGER DEFAULT 0,
    points_earned INTEGER DEFAULT 0,
    completed_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- User Points table (points transaction history)
CREATE TABLE IF NOT EXISTS user_points (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id),
    points INTEGER NOT NULL,
    source VARCHAR(100) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    reference_id VARCHAR(100),
    created_at BIGINT NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vouchers_address ON vouchers(address);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_aa_address ON accounts(aa_address);
CREATE INDEX IF NOT EXISTS idx_user_operations_user_id ON user_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_operations_hash ON user_operations(user_op_hash);
CREATE INDEX IF NOT EXISTS idx_user_challenges_user_id ON user_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_challenges_challenge_id ON user_challenges(challenge_id);
CREATE INDEX IF NOT EXISTS idx_user_points_user_id ON user_points(user_id);

-- Note: RLS policies should be added based on your security requirements
