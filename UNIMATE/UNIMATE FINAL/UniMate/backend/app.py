from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
import logging

from config import ALLOWED_ORIGINS, settings
from models import init_database
from routers.core import router as core_router
from routers.biconomy import router as biconomy_router
from routers.tasks import router as tasks_router
from routers.profile import router as profile_router
from routers.lighthouse import router as lighthouse_router
from routers.rewards import router as rewards_router
from routers.challenges import router as challenges_router
from routers.calendar import router as calendar_router
from routers.relayer import router as relayer_router
from routers.reconciliation import router as reconciliation_router
from routers.notifications import router as notifications_router

# Import blockchain router
try:
    from routers.blockchain import router as blockchain_router
    # Try to import limiter from blockchain router, fallback to default
    try:
        from routers.blockchain import limiter
    except ImportError:
        limiter = Limiter(key_func=get_remote_address)
    BLOCKCHAIN_AVAILABLE = True
except ImportError:
    BLOCKCHAIN_AVAILABLE = False
    # Create a default limiter if blockchain router is not available
    limiter = Limiter(key_func=get_remote_address)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create the main FastAPI application
app = FastAPI(
    title="UniMate Backend",
    description="Unified API for UniMate core functionality and blockchain rewards",
    version="1.0.0"
)

@app.on_event("startup")
async def on_startup():
    """
    Application startup event
    - Initialize database
    - Start scheduled jobs (cron)
    """
    init_database()

    # Start scheduled jobs for backend operations
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
        from apscheduler.triggers.interval import IntervalTrigger
        from routers.reconciliation import daily_reconciliation_job
        from services.notification_scheduler import (
            check_and_send_task_reminders,
            check_and_send_reminder_notifications
        )

        scheduler = AsyncIOScheduler()

        # Schedule daily reconciliation at 00:00 UTC (Biconomy-based)
        scheduler.add_job(
            daily_reconciliation_job,
            CronTrigger(hour=0, minute=0, timezone='UTC'),
            id='daily_reconciliation',
            name='Daily Point Reconciliation (Biconomy)',
            replace_existing=True
        )

        # ✅ Schedule push notification checks every 1 minute
        scheduler.add_job(
            check_and_send_task_reminders,
            IntervalTrigger(minutes=1),
            id='task_reminders',
            name='Task Reminder Notifications',
            replace_existing=True
        )

        scheduler.add_job(
            check_and_send_reminder_notifications,
            IntervalTrigger(minutes=1),
            id='reminder_notifications',
            name='Reminder Notifications',
            replace_existing=True
        )

        scheduler.start()
        logger.info("✅ Scheduled jobs started successfully")
        logger.info("   - Daily reconciliation (Biconomy): 00:00 UTC")
        logger.info("   - Converts off-chain points → on-chain WELL tokens")
        logger.info("   - Task reminders: Every 1 minute")
        logger.info("   - Reminder notifications: Every 1 minute")

        # Store scheduler in app state for graceful shutdown
        app.state.scheduler = scheduler

    except ImportError:
        logger.warning("⚠️  APScheduler not installed - scheduled jobs disabled")
        logger.warning("   Install with: pip install apscheduler")
    except Exception as e:
        logger.error(f"❌ Failed to start scheduled jobs: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    """
    Application shutdown event
    - Stop scheduled jobs gracefully
    """
    if hasattr(app.state, 'scheduler'):
        try:
            app.state.scheduler.shutdown()
            logger.info("✅ Scheduled jobs stopped successfully")
        except Exception as e:
            logger.error(f"Error stopping scheduler: {e}")

# CORS configuration
origins = ALLOWED_ORIGINS or [
    "http://localhost:3000",      # React development
    "http://127.0.0.1:3000",     # React development alternative
    "http://10.72.127.211:8000",  # Mobile client (Expo Go) - CURRENT IP (updated 2025-10-21)
    "http://10.72.246.152:8000",  # Mobile client (Expo Go) - old IP (keep for compatibility)
    "http://172.20.10.4:8000",    # Mobile client (Expo Go) - old IP (keep for compatibility)
    "http://10.72.114.176:8000",  # Mobile client (Expo Go) - old IP (keep for compatibility)
    "http://192.168.1.38:8000",   # Mobile client (Expo Go) - old IP (keep for compatibility)
    "http://10.72.122.46:8000",   # Mobile client (Expo Go) - old IP (keep for compatibility)
    "https://unimate.app",        # Production frontend
    "https://*.unimate.app",      # Production subdomains
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],  # lock down in prod
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

# Rate limiting configuration
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Include routers
app.include_router(core_router, tags=["Core", "Auth", "Tasks", "Calendar"])
if BLOCKCHAIN_AVAILABLE:
    app.include_router(blockchain_router, tags=["Blockchain", "Rewards", "Challenges"])
    logger.info("Blockchain router loaded successfully")
else:
    logger.warning("Blockchain router not available - running without blockchain functionality")

app.include_router(biconomy_router, prefix="/biconomy", tags=["Biconomy", "Smart-Accounts", "ERC4337"])
app.include_router(relayer_router, tags=["Relayer", "Webhooks", "Backend-Operations"])
app.include_router(tasks_router, tags=["Tasks", "Calendar", "Reminders"])
app.include_router(profile_router, tags=["Profile", "Medical", "User-Data"])
app.include_router(lighthouse_router, tags=["Emergency", "Wellness", "Safety"])
app.include_router(rewards_router, tags=["Rewards", "Points", "Vouchers", "Market"])
app.include_router(challenges_router, tags=["Daily-Challenges", "Wellness-Activities"])
app.include_router(calendar_router, tags=["Calendar", "Tasks", "Reminders", "Schedule"])
app.include_router(reconciliation_router, tags=["Reconciliation", "Points", "Automation"])
app.include_router(notifications_router, tags=["Push-Notifications", "Mobile", "Alerts"])

# Root health endpoint
@app.get("/")
@app.head("/")  # ✅ Explicitly support HEAD for health checks
async def root():
    return {
        "message": "UniMate Backend API",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "core": "Traditional email/password authentication with tasks and calendar",
            "blockchain": "/chain - Blockchain rewards and challenges" if BLOCKCHAIN_AVAILABLE else "Blockchain functionality not available",
            "biconomy": "/biconomy - ERC4337 Smart Account operations via Biconomy SDK",
            "relayer": "/relayer - OpenZeppelin Defender Relayer integration for backend operations",
            "tasks": "/tasks - Task and reminder management",
            "profile": "/users - User profile and medical information",
            "lighthouse": "/lighthouse - Emergency alerts and wellness check-ins",
            "rewards": "/rewards - User-friendly points system and voucher marketplace",
            "challenges": "/challenges - Daily wellness challenges with blockchain rewards",
            "calendar": "/calendar - Calendar, tasks, and reminders management"
        },
        "blockchain_enabled": BLOCKCHAIN_AVAILABLE
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
