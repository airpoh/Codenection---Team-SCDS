"""
OpenZeppelin Defender Relayer Client
Handles secure transaction submission via Relayer API
"""

import httpx
import jwt
import time
from typing import Dict, Any, List, Optional
import logging
from eth_abi import encode
from web3 import Web3
from config import settings

logger = logging.getLogger(__name__)

class DefenderRelayerClient:
    """Client for OpenZeppelin Defender Relayer API with JWT authentication"""

    def __init__(
        self,
        api_url: str = None,
        api_key: str = None,
        api_secret: str = None
    ):
        self.api_url = api_url or settings.DEFENDER_API_URL
        self.api_key = api_key or settings.DEFENDER_API_KEY
        self.api_secret = api_secret or settings.DEFENDER_API_SECRET
        self.client = httpx.AsyncClient(timeout=30.0)

        # JWT token caching
        self._token_cache: Optional[str] = None
        self._token_expiry: int = 0

    async def _get_auth_token(self) -> str:
        """
        Generate JWT token for Defender API authentication.
        Caches token and reuses until expiry.
        """
        # Return cached token if still valid
        if self._token_cache and self._token_expiry > time.time():
            return self._token_cache

        # Generate new JWT token
        now = int(time.time())
        expiry = now + 3600  # Token valid for 1 hour

        payload = {
            'apiKey': self.api_key,
            'iat': now,
            'exp': expiry
        }

        token = jwt.encode(payload, self.api_secret, algorithm="HS256")

        # Cache the token
        self._token_cache = token
        self._token_expiry = expiry

        logger.debug(f"Generated new Defender API token (expires in 1 hour)")
        return token

    async def health_check(self) -> Dict[str, Any]:
        """Check if relayer service is running"""
        try:
            response = await self.client.get(f"{self.api_url}/health")
            return response.json()
        except Exception as e:
            logger.error(f"Relayer health check failed: {e}")
            raise

    async def send_transaction(
        self,
        relayer_id: str,
        to: str,
        data: str,
        value: str = "0",
        gas_limit: Optional[int] = None,
        speed: str = "fast"
    ) -> Dict[str, Any]:
        """
        Send a transaction via Defender Relayer

        Args:
            relayer_id: ID of relayer to use (e.g., "unimate-polygon-amoy")
            to: Contract address to call
            data: Encoded function call data
            value: ETH value to send (in wei, default "0")
            gas_limit: Optional gas limit (relayer estimates if None)
            speed: Transaction speed ("safeLow", "average", "fast", "fastest")

        Returns:
            {
                "transaction_id": "abc123",
                "status": "pending",
                "hash": null  // Set when mined
            }
        """
        try:
            payload = {
                "to": to,
                "data": data,
                "value": value,
                "speed": speed
            }

            if gas_limit:
                payload["gasLimit"] = gas_limit

            # Get JWT token for authentication
            auth_token = await self._get_auth_token()

            response = await self.client.post(
                f"{self.api_url}/relayers/{relayer_id}/txs",
                json=payload,
                headers={
                    "Authorization": f"Bearer {auth_token}",
                    "Content-Type": "application/json"
                }
            )

            if response.status_code >= 400:
                logger.error(f"Relayer transaction failed: {response.text}")
                raise Exception(f"Relayer error: {response.text}")

            result = response.json()
            logger.info(f"Transaction submitted: {result.get('transaction_id')}")
            return result

        except Exception as e:
            logger.error(f"Failed to send transaction via relayer: {e}")
            raise

    async def get_transaction_status(
        self,
        relayer_id: str,
        transaction_id: str
    ) -> Dict[str, Any]:
        """
        Get status of a relayer transaction

        Returns:
            {
                "transaction_id": "abc123",
                "status": "confirmed",
                "hash": "0x789def...",
                "gasUsed": 487234,
                "blockNumber": 12345
            }
        """
        try:
            # Get JWT token for authentication
            auth_token = await self._get_auth_token()

            response = await self.client.get(
                f"{self.api_url}/relayers/{relayer_id}/txs/{transaction_id}",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get transaction status: {e}")
            raise

    async def encode_function_call(
        self,
        function_signature: str,
        param_types: List[str],
        param_values: List[Any]
    ) -> str:
        """
        Encode function call for transaction data

        Args:
            function_signature: e.g., "batchReconcile(address[],uint256[])"
            param_types: e.g., ["address[]", "uint256[]"]
            param_values: e.g., [[0x...], [100, 200]]

        Returns:
            Encoded data as hex string (0x...)
        """
        try:
            function_selector = Web3.keccak(text=function_signature)[:4]
            encoded_params = encode(param_types, param_values)
            data = "0x" + (function_selector + encoded_params).hex()
            return data
        except Exception as e:
            logger.error(f"Failed to encode function call: {e}")
            raise

    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()


# Singleton instance
_relayer_client: Optional[DefenderRelayerClient] = None

def get_relayer_client() -> Optional[DefenderRelayerClient]:
    """
    Get singleton relayer client instance.
    Initializes with settings from config.py on first call.
    Returns None if Defender is disabled.
    """
    global _relayer_client

    if not settings.DEFENDER_ENABLED:
        logger.warning("⚠️ Defender is disabled - backend relayer operations unavailable")
        logger.info("💡 Use Biconomy for user-initiated gasless transactions")
        return None

    if _relayer_client is None:
        _relayer_client = DefenderRelayerClient(
            api_url=settings.DEFENDER_API_URL,
            api_key=settings.DEFENDER_API_KEY,
            api_secret=settings.DEFENDER_API_SECRET
        )
        logger.info(f"✅ Defender client initialized: {settings.DEFENDER_API_URL}")
    return _relayer_client
