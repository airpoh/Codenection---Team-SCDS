"""
Database Migration: Add push_tokens table
==========================================
Creates the push_tokens table for storing mobile device push notification tokens.

Run this once to add the table to your existing database.

Usage:
    python migrate_push_tokens.py
"""

from sqlalchemy import create_engine, text
from config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get database URL
DB_URL = settings.SUPABASE_DB_URL or settings.DATABASE_URL
if not DB_URL:
    raise RuntimeError("Set SUPABASE_DB_URL or DATABASE_URL in .env")

def migrate():
    """Create push_tokens table"""
    engine = create_engine(DB_URL)

    try:
        with engine.connect() as conn:
            logger.info("🔧 Creating push_tokens table...")

            # Create push_tokens table
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS push_tokens (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    profile_id VARCHAR NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                    push_token VARCHAR(255) NOT NULL UNIQUE,
                    device_type VARCHAR(20),
                    device_name VARCHAR(100),
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                )
            """))

            # Create indexes for better query performance
            logger.info("📑 Creating indexes...")

            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_push_tokens_profile_id
                ON push_tokens(profile_id)
            """))

            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_push_tokens_push_token
                ON push_tokens(push_token)
            """))

            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_push_tokens_active
                ON push_tokens(profile_id, is_active)
                WHERE is_active = TRUE
            """))

            conn.commit()

            logger.info("✅ Migration completed successfully!")
            logger.info("   - Created push_tokens table")
            logger.info("   - Added indexes for performance")
            logger.info("   - Ready to receive push notification registrations")

    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        raise

if __name__ == "__main__":
    logger.info("Starting push_tokens table migration...")
    logger.info(f"Database: {DB_URL.split('@')[1] if '@' in DB_URL else 'local'}")

    confirm = input("\nProceed with migration? (yes/no): ")
    if confirm.lower() in ['yes', 'y']:
        migrate()
    else:
        logger.info("Migration cancelled")
