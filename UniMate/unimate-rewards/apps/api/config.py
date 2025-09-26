from typing import Optional
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Simple settings class without Pydantic dependency issues
class Settings:
    def __init__(self):
        # Supabase Configuration (shared)
        self.SUPABASE_URL = os.getenv("SUPABASE_URL", "")
        self.SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
        self.SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
        self.SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
        self.SUPABASE_PROJECT_REF = os.getenv("SUPABASE_PROJECT_REF", "")  # 项目引用（URL 中的子域名）
        self.ALLOWED_EMAIL_DOMAIN = os.getenv("ALLOWED_EMAIL_DOMAIN", ".edu.my")
        self.FRONTEND_RESET_URL = os.getenv("FRONTEND_RESET_URL", "http://localhost:3000/reset")

        # Resend Configuration for SMTP
        self.RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
        self.FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@unimate.edu.my")
        self.FROM_NAME = os.getenv("FROM_NAME", "UniMate")
        
        # JWT Configuration for API tokens
        self.JWT_SECRET = os.getenv("JWT_SECRET", "supersecretlongrandom")
        self.JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "unimate-api")
        self.JWT_ISSUER = os.getenv("JWT_ISSUER", "unimate")
        self.JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

        # Blockchain Configuration
        self.AMOY_RPC_URL = os.getenv("AMOY_RPC_URL", "")
        self.WELL_ADDRESS = os.getenv("WELL_ADDRESS", "")
        self.REDEMPTION_SYSTEM_ADDRESS = os.getenv("REDEMPTION_SYSTEM_ADDRESS", "")
        self.ACHIEVEMENTS_ADDRESS = os.getenv("ACHIEVEMENTS_ADDRESS", "")
        self.PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")

        # Optional Blockchain Settings
        self.OWNER_PRIVATE_KEY = os.getenv("OWNER_PRIVATE_KEY")
        self.API_SECRET = os.getenv("API_SECRET", "dev-secret")
        self.MAX_PER_MINT = int(os.getenv("MAX_PER_MINT", "10"))
        self.RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "5"))
        self.MINTER_ADDRESS = os.getenv("MINTER_ADDRESS")
        self.SIGNER_PRIVATE_KEY = os.getenv("SIGNER_PRIVATE_KEY")
        self.ACH_ADDRESS = os.getenv("ACH_ADDRESS")
        self.RS_ADDRESS = os.getenv("RS_ADDRESS")
        self.DEMO_USER_PRIVATE_KEY = os.getenv("DEMO_USER_PRIVATE_KEY")
        self.DEMO_USER_ADDRESS = os.getenv("DEMO_USER_ADDRESS")

        # Biconomy Configuration
        self.BICONOMY_PAYMASTER_API_KEY = os.getenv("BICONOMY_PAYMASTER_API_KEY", "")
        self.BICONOMY_BUNDLER_URL = os.getenv("BICONOMY_BUNDLER_URL")

        # Particle Network Configuration (REMOVED - not using Particle Network)
        # self.PARTICLE_PROJECT_ID = os.getenv("PARTICLE_PROJECT_ID", "")
        # self.PARTICLE_CLIENT_KEY = os.getenv("PARTICLE_CLIENT_KEY", "")
        # self.PARTICLE_APP_ID = os.getenv("PARTICLE_APP_ID", "")

        # CORS Configuration
        self.ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "")

        # Database Configuration
        self.DATABASE_URL = os.getenv("DATABASE_URL")

        # Timezone
        self.DEFAULT_TZ = "Asia/Kuala_Lumpur"

# Create global settings instance
settings = Settings()

# Derived values for backward compatibility
RPC = settings.AMOY_RPC_URL
WELL = settings.WELL_ADDRESS
REDEMPTION_SYSTEM = settings.REDEMPTION_SYSTEM_ADDRESS
ACHIEVEMENTS = settings.ACHIEVEMENTS_ADDRESS
PRIVATE_KEY = settings.PRIVATE_KEY
SUPABASE_URL = settings.SUPABASE_URL
ANON_KEY = settings.SUPABASE_ANON_KEY
SERVICE_KEY = settings.SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET = settings.SUPABASE_JWT_SECRET
ALLOWED_EMAIL_DOMAIN = settings.ALLOWED_EMAIL_DOMAIN
FRONTEND_RESET_URL = settings.FRONTEND_RESET_URL
BICONOMY_PAYMASTER_API_KEY = settings.BICONOMY_PAYMASTER_API_KEY
# PARTICLE_PROJECT_ID = settings.PARTICLE_PROJECT_ID  # REMOVED
# PARTICLE_CLIENT_KEY = settings.PARTICLE_CLIENT_KEY  # REMOVED
# PARTICLE_APP_ID = settings.PARTICLE_APP_ID  # REMOVED
OWNER_PK = settings.OWNER_PRIVATE_KEY
API_SECRET = settings.API_SECRET
MAX_PER_MINT = settings.MAX_PER_MINT
RATE_LIMIT_PER_MIN = settings.RATE_LIMIT_PER_MIN
MINTER = settings.MINTER_ADDRESS
SIGNER_PK = settings.SIGNER_PRIVATE_KEY
ACH = settings.ACH_ADDRESS
RS = settings.RS_ADDRESS
DEMO_USER_PK = settings.DEMO_USER_PRIVATE_KEY
DEMO_USER_ADDR = settings.DEMO_USER_ADDRESS
BICONOMY_BUNDLER_URL = settings.BICONOMY_BUNDLER_URL
DB_URL = settings.SUPABASE_DB_URL
ALLOWED_ORIGINS = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]