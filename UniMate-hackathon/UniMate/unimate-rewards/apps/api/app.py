from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
import logging

from config import ALLOWED_ORIGINS, settings
from routers.core import router as core_router
from routers.biconomy import router as biconomy_router
from routers.tasks import router as tasks_router
from routers.profile import router as profile_router
from routers.lighthouse import router as lighthouse_router
from routers.rewards import router as rewards_router
from routers.challenges import router as challenges_router
from routers.calendar import router as calendar_router

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

# CORS configuration
origins = ALLOWED_ORIGINS or [
    "http://localhost:3000",      # React development
    "http://127.0.0.1:3000",     # React development alternative
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
app.include_router(tasks_router, tags=["Tasks", "Calendar", "Reminders"])
app.include_router(profile_router, tags=["Profile", "Medical", "User-Data"])
app.include_router(lighthouse_router, tags=["Emergency", "Wellness", "Safety"])
app.include_router(rewards_router, tags=["Rewards", "Points", "Vouchers", "Market"])
app.include_router(challenges_router, tags=["Daily-Challenges", "Wellness-Activities"])
app.include_router(calendar_router, tags=["Calendar", "Tasks", "Reminders", "Schedule"])

# Root health endpoint
@app.get("/")
async def root():
    return {
        "message": "UniMate Backend API",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "core": "Traditional email/password authentication with tasks and calendar",
            "blockchain": "/chain - Blockchain rewards and challenges" if BLOCKCHAIN_AVAILABLE else "Blockchain functionality not available",
            "biconomy": "/biconomy - ERC4337 Smart Account operations via Biconomy SDK",
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