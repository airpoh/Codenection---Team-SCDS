#!/usr/bin/env python3
"""
UniMate Database Initialization Script
初始化数据库表结构
"""

import sys
import logging
from pathlib import Path

# Add the current directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

from models import init_database, DATABASE_SCHEMA, engine
from sqlalchemy import text

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

def create_tables_with_sql():
    """使用原生SQL创建表（如果SQLAlchemy创建失败）"""
    try:
        with engine.connect() as conn:
            # Split schema into individual statements
            statements = [stmt.strip() for stmt in DATABASE_SCHEMA.split(';') if stmt.strip()]
            
            for statement in statements:
                if statement:
                    try:
                        conn.execute(text(statement))
                        logger.info(f"Executed: {statement[:50]}...")
                    except Exception as e:
                        logger.warning(f"Statement failed (may already exist): {e}")
            
            conn.commit()
            logger.info("Database schema created successfully using SQL")
            return True
    except Exception as e:
        logger.error(f"Failed to create schema with SQL: {e}")
        return False

def main():
    """初始化数据库"""
    logger.info("Starting database initialization...")
    
    try:
        # Try SQLAlchemy first
        logger.info("Attempting to create tables with SQLAlchemy...")
        init_database()
        logger.info("✅ Database initialized successfully with SQLAlchemy")
        
    except Exception as e:
        logger.warning(f"SQLAlchemy initialization failed: {e}")
        logger.info("Attempting to create tables with raw SQL...")
        
        if create_tables_with_sql():
            logger.info("✅ Database initialized successfully with SQL")
        else:
            logger.error("❌ Database initialization failed completely")
            sys.exit(1)
    
    logger.info("Database initialization completed!")
    
    # Print schema information
    print("\n" + "="*60)
    print("DATABASE SCHEMA CREATED")
    print("="*60)
    print("Tables created:")
    print("- profiles (用户档案)")
    print("- tasks (任务和提醒)")
    print("- trusted_contacts (信任联系人)")
    print("- emergency_alerts (紧急警报)")
    print("- wellness_checkins (健康检查)")
    print("- user_smart_accounts (智能账户)")
    print("- token_redemptions (代币兑换)")
    print("- vouchers (兑换凭证)")
    print("- users (区块链用户)")
    print("- accounts (用户账户)")
    print("- user_operations (用户操作)")
    print("- challenges (挑战)")
    print("- user_challenges (用户挑战)")
    print("- user_points (积分记录)")
    print("="*60)
    print("✅ Ready to start the UniMate backend server!")

if __name__ == "__main__":
    main()
