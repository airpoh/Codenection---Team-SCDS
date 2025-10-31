"""
HashiCorp Vault integration for secure secret management.

This module provides a production-grade Vault client with:
- AppRole authentication
- Automatic token renewal
- Secret caching with TTL
- Error handling and retries
- Transit engine support for signing

Usage:
    from services.vault_service import get_vault_client

    vault = get_vault_client()
    secret = vault.get_secret("backend/blockchain", "owner_private_key")
"""

import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

try:
    import hvac
    from hvac.exceptions import VaultError as HvacVaultError
    HVAC_AVAILABLE = True
except ImportError:
    HVAC_AVAILABLE = False
    HvacVaultError = Exception

try:
    from tenacity import (
        retry,
        stop_after_attempt,
        wait_exponential,
        retry_if_exception_type,
        before_sleep_log
    )
    TENACITY_AVAILABLE = True
except ImportError:
    TENACITY_AVAILABLE = False
    # Dummy decorator if tenacity not available
    def retry(*args, **kwargs):
        def decorator(func):
            return func
        return decorator
    stop_after_attempt = wait_exponential = retry_if_exception_type = before_sleep_log = None

logger = logging.getLogger(__name__)


class VaultError(Exception):
    """Custom Vault error exception."""
    pass


class VaultClient:
    """
    Production-grade HashiCorp Vault client.

    Features:
    - AppRole authentication with automatic renewal
    - In-memory secret caching
    - Graceful error handling
    - Support for KV v2 and Transit engines
    """

    def __init__(
        self,
        vault_addr: str,
        role_id: str,
        secret_id: str,
        namespace: Optional[str] = None,
        mount_point: str = "secret"
    ):
        if not HVAC_AVAILABLE:
            raise VaultError(
                "hvac library not installed. Install with: pip install hvac"
            )

        self.vault_addr = vault_addr
        self.role_id = role_id
        self.secret_id = secret_id
        self.namespace = namespace
        self.mount_point = mount_point

        self._client: Optional[hvac.Client] = None
        self._token_expiry: Optional[datetime] = None
        self._secret_cache: Dict[str, Any] = {}

        # Initialize connection
        self._authenticate()

    @retry(
        stop=stop_after_attempt(3) if TENACITY_AVAILABLE else None,
        wait=wait_exponential(multiplier=1, min=1, max=10) if TENACITY_AVAILABLE else None,
        retry=retry_if_exception_type((ConnectionError, TimeoutError)) if TENACITY_AVAILABLE else None,
        before_sleep=before_sleep_log(logger, logging.WARNING) if TENACITY_AVAILABLE else None
    ) if TENACITY_AVAILABLE else lambda f: f
    def _authenticate(self) -> None:
        """Authenticate with Vault using AppRole with automatic retry on network errors."""
        try:
            logger.info(f"Authenticating with Vault at {self.vault_addr}")

            self._client = hvac.Client(
                url=self.vault_addr,
                namespace=self.namespace
            )

            # AppRole authentication
            auth_response = self._client.auth.approle.login(
                role_id=self.role_id,
                secret_id=self.secret_id
            )

            # Calculate token expiry (with 5 min buffer for safety)
            ttl = auth_response['auth']['lease_duration']
            self._token_expiry = datetime.now() + timedelta(seconds=ttl - 300)

            logger.info(
                f"Successfully authenticated with Vault. "
                f"Token expires at {self._token_expiry.isoformat()}"
            )

        except Exception as e:
            logger.error(f"Vault authentication failed: {e}")
            raise VaultError(f"Failed to authenticate with Vault: {e}")

    def _ensure_authenticated(self) -> None:
        """Ensure we have a valid token, renew if needed."""
        if not self._client or not self._client.is_authenticated():
            logger.warning("Vault client not authenticated, re-authenticating...")
            self._authenticate()
            return

        # Renew if token is about to expire
        if self._token_expiry and datetime.now() >= self._token_expiry:
            logger.info("Vault token expired, renewing...")
            self._authenticate()

    @retry(
        stop=stop_after_attempt(3) if TENACITY_AVAILABLE else None,
        wait=wait_exponential(multiplier=1, min=1, max=10) if TENACITY_AVAILABLE else None,
        retry=retry_if_exception_type((ConnectionError, TimeoutError)) if TENACITY_AVAILABLE else None,
        before_sleep=before_sleep_log(logger, logging.WARNING) if TENACITY_AVAILABLE else None
    ) if TENACITY_AVAILABLE else lambda f: f
    def get_secret(self, path: str, key: str, use_cache: bool = True) -> str:
        """
        Retrieve a secret from Vault KV v2 engine with automatic retry on network errors.

        Args:
            path: Secret path (e.g., 'backend/blockchain')
            key: Secret key (e.g., 'owner_private_key')
            use_cache: Whether to use cached value (default: True)

        Returns:
            Secret value as string

        Raises:
            VaultError: If secret retrieval fails
        """
        cache_key = f"{path}/{key}"

        # Check cache first
        if use_cache and cache_key in self._secret_cache:
            logger.debug(f"Using cached secret: {cache_key}")
            return self._secret_cache[cache_key]

        self._ensure_authenticated()

        try:
            # Read from KV v2
            secret_response = self._client.secrets.kv.v2.read_secret_version(
                path=path,
                mount_point=self.mount_point
            )

            secret_value = secret_response['data']['data'].get(key)

            if secret_value is None:
                raise VaultError(f"Key '{key}' not found in secret '{path}'")

            # Cache the secret
            if use_cache:
                self._secret_cache[cache_key] = secret_value

            logger.info(f"Successfully retrieved secret: {cache_key}")
            return secret_value

        except HvacVaultError as e:
            logger.error(f"Failed to retrieve secret {cache_key}: {e}")
            raise VaultError(f"Failed to retrieve secret: {e}")
        except Exception as e:
            logger.error(f"Unexpected error retrieving secret {cache_key}: {e}")
            raise VaultError(f"Unexpected error: {e}")

    def get_all_secrets(self, path: str, use_cache: bool = True) -> Dict[str, str]:
        """
        Retrieve all secrets from a path.

        Args:
            path: Secret path (e.g., 'backend/blockchain')
            use_cache: Whether to use cached values (default: True)

        Returns:
            Dictionary of all secrets at path

        Raises:
            VaultError: If secret retrieval fails
        """
        self._ensure_authenticated()

        try:
            secret_response = self._client.secrets.kv.v2.read_secret_version(
                path=path,
                mount_point=self.mount_point
            )

            secrets = secret_response['data']['data']

            # Cache all secrets
            if use_cache:
                for key, value in secrets.items():
                    self._secret_cache[f"{path}/{key}"] = value

            logger.info(f"Successfully retrieved all secrets from: {path}")
            return secrets

        except HvacVaultError as e:
            logger.error(f"Failed to retrieve secrets from {path}: {e}")
            raise VaultError(f"Failed to retrieve secrets: {e}")
        except Exception as e:
            logger.error(f"Unexpected error retrieving secrets from {path}: {e}")
            raise VaultError(f"Unexpected error: {e}")

    def sign_message(
        self,
        key_name: str,
        message: bytes,
        mount_point: str = "transit"
    ) -> str:
        """
        Sign a message using Vault Transit engine.

        Args:
            key_name: Transit key name
            message: Message to sign
            mount_point: Transit mount point (default: 'transit')

        Returns:
            Signature string (e.g., 'vault:v1:...')

        Raises:
            VaultError: If signing fails
        """
        self._ensure_authenticated()

        try:
            import base64

            # Encode message to base64
            encoded_message = base64.b64encode(message).decode('utf-8')

            # Sign using Transit engine
            sign_response = self._client.secrets.transit.sign_data(
                name=key_name,
                input=encoded_message,
                mount_point=mount_point
            )

            signature = sign_response['data']['signature']
            logger.info(f"Successfully signed message with key: {key_name}")
            return signature

        except HvacVaultError as e:
            logger.error(f"Failed to sign message: {e}")
            raise VaultError(f"Failed to sign message: {e}")
        except Exception as e:
            logger.error(f"Unexpected error signing message: {e}")
            raise VaultError(f"Unexpected error: {e}")

    def clear_cache(self) -> None:
        """Clear the secret cache."""
        self._secret_cache.clear()
        logger.info("Vault secret cache cleared")

    def is_authenticated(self) -> bool:
        """Check if client is authenticated."""
        return self._client is not None and self._client.is_authenticated()

    def get_token_expiry(self) -> Optional[datetime]:
        """Get token expiry time."""
        return self._token_expiry


# Singleton instance
_vault_client: Optional[VaultClient] = None


def get_vault_client() -> VaultClient:
    """
    Get or create the global Vault client instance.

    Environment variables required:
    - VAULT_ADDR: Vault server URL
    - VAULT_ROLE_ID: AppRole role ID
    - VAULT_SECRET_ID: AppRole secret ID
    - VAULT_NAMESPACE: (Optional) Vault namespace
    - VAULT_KV_MOUNT: (Optional) KV v2 mount point name (default: "secret")

    Returns:
        VaultClient instance

    Raises:
        VaultError: If Vault configuration is incomplete
    """
    global _vault_client

    if _vault_client is None:
        vault_addr = os.getenv("VAULT_ADDR")
        role_id = os.getenv("VAULT_ROLE_ID")
        secret_id = os.getenv("VAULT_SECRET_ID")
        namespace = os.getenv("VAULT_NAMESPACE")
        kv_mount = os.getenv("VAULT_KV_MOUNT", "secret")

        if not all([vault_addr, role_id, secret_id]):
            raise VaultError(
                "Vault configuration incomplete. Required environment variables: "
                "VAULT_ADDR, VAULT_ROLE_ID, VAULT_SECRET_ID"
            )

        logger.info(
            f"Initializing Vault client (addr={vault_addr}, namespace={namespace or 'None'}, kv_mount={kv_mount})"
        )

        _vault_client = VaultClient(
            vault_addr=vault_addr,
            role_id=role_id,
            secret_id=secret_id,
            namespace=namespace,
            mount_point=kv_mount
        )

    return _vault_client


def reset_vault_client() -> None:
    """Reset the global Vault client (useful for testing)."""
    global _vault_client
    _vault_client = None
