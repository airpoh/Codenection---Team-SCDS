#!/usr/bin/env python3
"""
UniMate Backend Server Startup Script
"""

import os
import sys
import uvicorn
import logging
from pathlib import Path

# Add the current directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

from app import app
from init_db import init_database

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

def main():
    """Start the UniMate backend server"""
    logger.info("Starting UniMate Backend Server...")
    
    # Check for essential environment variables
    required_env_vars = [
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY", 
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_JWT_SECRET"
    ]
    
    missing_vars = []
    for var in required_env_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        logger.error(f"Missing required environment variables: {', '.join(missing_vars)}")
        logger.error("Please create a .env file with the required configuration.")
        logger.error("See .env.example for reference.")
        sys.exit(1)
    
    # Get server configuration from environment
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "true").lower() in ("true", "1", "yes")
    
    logger.info(f"Server will start on {host}:{port}")
    logger.info(f"Reload mode: {reload}")
    
    # Initialize database
    logger.info("Initializing database...")
    try:
        init_database()
        logger.info("✅ Database initialized successfully")
    except Exception as e:
        logger.warning(f"Database initialization failed: {e}")
        logger.info("You may need to run 'python init_db.py' manually")
    
    # Start the server
    uvicorn.run(
        "app:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    )

if __name__ == "__main__":
    main()
