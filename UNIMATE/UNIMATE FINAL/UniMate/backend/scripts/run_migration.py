"""
Run SQL migration to create vouchers_catalog and activity_logs tables
"""

import sys
sys.path.insert(0, '/Users/quanpin/Desktop/UniMate-hackathon/UniMate/backend')

from services.supabase_client import get_supabase_service
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Read the SQL migration file
migration_sql = """
-- Create vouchers_catalog table (master data for available vouchers)
CREATE TABLE IF NOT EXISTS vouchers_catalog (
    id VARCHAR(128) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    points_required INTEGER NOT NULL,
    category VARCHAR(50) NOT NULL,
    image_url TEXT,
    terms_conditions TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_vouchers_catalog_category ON vouchers_catalog(category);
CREATE INDEX IF NOT EXISTS idx_vouchers_catalog_active ON vouchers_catalog(is_active);

-- Create user_vouchers table (track redeemed vouchers per user)
CREATE TABLE IF NOT EXISTS user_vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id VARCHAR(36) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    voucher_id VARCHAR(128) NOT NULL REFERENCES vouchers_catalog(id),
    redemption_code VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    points_spent INTEGER NOT NULL,
    transaction_hash VARCHAR(66),
    redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    used_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_vouchers_profile ON user_vouchers(profile_id);
CREATE INDEX IF NOT EXISTS idx_user_vouchers_voucher ON user_vouchers(voucher_id);
CREATE INDEX IF NOT EXISTS idx_user_vouchers_code ON user_vouchers(redemption_code);
"""


def run_migration():
    """Execute SQL migration using Supabase client"""
    try:
        supabase = get_supabase_service()

        logger.info("🚀 Running database migration...")

        # Execute SQL using rpc call
        result = supabase.client.rpc('exec_sql', {'sql': migration_sql}).execute()

        logger.info("✅ Migration completed successfully!")
        logger.info("📋 Created tables: vouchers_catalog, user_vouchers")

        return True

    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        logger.info("ℹ️  Attempting alternative approach using table creation...")

        # Alternative: Create tables using Python API
        try:
            # Note: This won't work for CREATE TABLE statements directly
            # You'll need to run the SQL manually in Supabase SQL Editor
            logger.warning("⚠️  Please run the SQL migration manually in Supabase SQL Editor")
            logger.info("📄 SQL file location: backend/migrations/create_vouchers_and_activity_logs.sql")
            return False

        except Exception as e2:
            logger.error(f"❌ Alternative approach failed: {e2}")
            raise


if __name__ == "__main__":
    run_migration()
