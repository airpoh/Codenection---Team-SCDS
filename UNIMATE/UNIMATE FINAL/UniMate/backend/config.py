from typing import Optional
import os
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Simple settings class without Pydantic dependency issues
class Settings:
    def __init__(self):
        # Vault Configuration
        self.USE_VAULT = os.getenv("USE_VAULT", "false").lower() == "true"
        self.VAULT_ADDR = os.getenv("VAULT_ADDR")
        self.VAULT_ROLE_ID = os.getenv("VAULT_ROLE_ID")
        self.VAULT_SECRET_ID = os.getenv("VAULT_SECRET_ID")
        self.VAULT_NAMESPACE = os.getenv("VAULT_NAMESPACE")

        # Supabase Configuration (shared)
        self.SUPABASE_URL = os.getenv("SUPABASE_URL", "")
        self.SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
        self.SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
        self.SUPABASE_PROJECT_REF = os.getenv("SUPABASE_PROJECT_REF", "")  # 项目引用（URL 中的子域名）
        self.SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "")
        self.DATABASE_URL = os.getenv("DATABASE_URL", "")
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

        # Blockchain Configuration - Load from Vault or Environment
        if self.USE_VAULT:
            self._load_secrets_from_vault()
        else:
            self._load_secrets_from_env()

        # Non-secret blockchain configuration
        self.AMOY_RPC_URL = os.getenv("AMOY_RPC_URL", "")
        self.WELL_ADDRESS = os.getenv("WELL_ADDRESS", "")
        self.REDEMPTION_SYSTEM_ADDRESS = os.getenv("REDEMPTION_SYSTEM_ADDRESS", "")
        self.ACHIEVEMENTS_ADDRESS = os.getenv("ACHIEVEMENTS_ADDRESS", "")
        self.ACH_ADDRESS = os.getenv("ACH_ADDRESS")
        self.RS_ADDRESS = os.getenv("RS_ADDRESS")
        self.MINTER_ADDRESS = os.getenv("MINTER_ADDRESS")

        # API Configuration
        self.API_SECRET = os.getenv("API_SECRET", "dev-secret")

        # OpenZeppelin Defender Configuration (Optional - service discontinued)
        self.DEFENDER_ENABLED = os.getenv("DEFENDER_ENABLED", "false").lower() == "true"
        self.DEFENDER_API_KEY = os.getenv("DEFENDER_API_KEY", "")
        self.DEFENDER_API_SECRET = os.getenv("DEFENDER_API_SECRET", "")
        self.DEFENDER_API_URL = os.getenv("DEFENDER_API_URL", "https://api.defender.openzeppelin.com")
        self.MAX_PER_MINT = int(os.getenv("MAX_PER_MINT", "10"))
        self.RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "5"))

        # Biconomy Configuration
        self.BICONOMY_PAYMASTER_API_KEY = os.getenv("BICONOMY_PAYMASTER_API_KEY", "")
        self.BICONOMY_BUNDLER_URL = os.getenv("BICONOMY_BUNDLER_URL")
        self.CHAIN_ID = int(os.getenv("CHAIN_ID", "80002"))  # Polygon Amoy testnet

        # CORS Configuration
        self.ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "")

        # Timezone
        self.DEFAULT_TZ = "Asia/Kuala_Lumpur"

    def _load_secrets_from_vault(self):
        """Load sensitive secrets from HashiCorp Vault with retry and fail-fast"""
        import time
        from services.vault_service import get_vault_client

        max_retries = 3
        is_production = os.getenv("ENV", "development").lower() == "production"

        for attempt in range(max_retries):
            try:
                logger.info(f"Loading secrets from Vault (attempt {attempt + 1}/{max_retries})...")
                vault = get_vault_client()

                # Load blockchain secrets
                self.PRIVATE_KEY = vault.get_secret("backend/blockchain", "private_key")
                self.OWNER_PRIVATE_KEY = vault.get_secret("backend/blockchain", "owner_private_key")
                self.SIGNER_PRIVATE_KEY = vault.get_secret("backend/blockchain", "signer_private_key")

                # Load encryption password (used by crypto.py)
                self.PRIVATE_KEY_ENCRYPTION_PASSWORD = vault.get_secret(
                    "backend/encryption",
                    "master_password"
                )

                logger.info("Successfully loaded secrets from Vault")
                return  # Success - exit function

            except Exception as e:
                logger.error(f"Failed to load secrets from Vault (attempt {attempt + 1}/{max_retries}): {e}")

                if attempt < max_retries - 1:
                    # Exponential backoff: 1s, 2s, 4s
                    sleep_time = 2 ** attempt
                    logger.info(f"Retrying in {sleep_time}s...")
                    time.sleep(sleep_time)
                else:
                    # All retries exhausted
                    if is_production:
                        # FAIL FAST in production - do NOT fall back to env vars
                        logger.critical("FATAL: Cannot load secrets from Vault in production environment")
                        logger.critical("Application cannot start securely. Exiting...")
                        raise SystemExit(1)
                    else:
                        # Development mode - allow fallback
                        logger.warning("Development mode: Falling back to environment variables")
                        logger.warning("This fallback is disabled in production for security")
                        self._load_secrets_from_env()

    def _load_secrets_from_env(self):
        """Load secrets from environment variables (fallback/development)"""
        logger.info("Loading secrets from environment variables")

        self.PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")
        self.OWNER_PRIVATE_KEY = os.getenv("OWNER_PRIVATE_KEY")
        self.SIGNER_PRIVATE_KEY = os.getenv("SIGNER_PRIVATE_KEY")
        self.PRIVATE_KEY_ENCRYPTION_PASSWORD = os.getenv(
            "PRIVATE_KEY_ENCRYPTION_PASSWORD",
            "default-dev-password-change-in-production"
        )

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
# PRODUCTION SECURITY: Demo user variables removed for production deployment
# DEMO_USER_PK = settings.DEMO_USER_PRIVATE_KEY
# DEMO_USER_ADDR = settings.DEMO_USER_ADDRESS
BICONOMY_BUNDLER_URL = settings.BICONOMY_BUNDLER_URL
ALLOWED_ORIGINS = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]