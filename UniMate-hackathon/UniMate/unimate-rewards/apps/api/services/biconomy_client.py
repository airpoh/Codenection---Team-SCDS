import httpx
import asyncio
from typing import Dict, Any, Optional, List
import logging

logger = logging.getLogger(__name__)

class BiconomyClient:
    """Client for communicating with Biconomy Smart Account Service"""

    def __init__(self, base_url: str = "http://localhost:3001"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=30.0)

    async def health_check(self) -> Dict[str, Any]:
        """Check if Biconomy service is healthy"""
        try:
            response = await self.client.get(f"{self.base_url}/health")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {"status": "unhealthy", "error": str(e)}

    async def create_smart_account(self, user_private_key: str) -> Dict[str, Any]:
        """Create a smart account for a user"""
        try:
            payload = {"userPrivateKey": user_private_key}
            response = await self.client.post(
                f"{self.base_url}/smart-account/create",
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to create smart account: {e}")
            return {"success": False, "error": str(e)}

    async def get_smart_account_address(self, user_private_key: str) -> Dict[str, Any]:
        """Get smart account address for a user (deterministic)"""
        try:
            payload = {"userPrivateKey": user_private_key}
            response = await self.client.post(
                f"{self.base_url}/smart-account/address",
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get smart account address: {e}")
            return {"success": False, "error": str(e)}

    async def execute_transaction(
        self,
        user_private_key: str,
        transaction: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a single transaction via smart account"""
        try:
            payload = {
                "userPrivateKey": user_private_key,
                "transaction": transaction
            }
            response = await self.client.post(
                f"{self.base_url}/smart-account/execute",
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to execute transaction: {e}")
            return {"success": False, "error": str(e)}

    async def execute_batch_transactions(
        self,
        user_private_key: str,
        transactions: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Execute multiple transactions in a single UserOperation"""
        try:
            payload = {
                "userPrivateKey": user_private_key,
                "transactions": transactions
            }
            response = await self.client.post(
                f"{self.base_url}/smart-account/execute-batch",
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to execute batch transactions: {e}")
            return {"success": False, "error": str(e)}

    async def estimate_transaction_gas(
        self,
        user_private_key: str,
        transaction: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Estimate gas for a transaction"""
        try:
            payload = {
                "userPrivateKey": user_private_key,
                "transaction": transaction
            }
            response = await self.client.post(
                f"{self.base_url}/smart-account/estimate-gas",
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to estimate gas: {e}")
            return {"success": False, "error": str(e)}

    async def get_account_balance(self, smart_account_address: str) -> Dict[str, Any]:
        """Get balance of a smart account"""
        try:
            response = await self.client.get(
                f"{self.base_url}/smart-account/balance/{smart_account_address}"
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get account balance: {e}")
            return {"success": False, "error": str(e)}

    async def generate_new_wallet(self) -> Dict[str, Any]:
        """Generate a new wallet for testing"""
        try:
            response = await self.client.get(
                f"{self.base_url}/smart-account/generate-wallet"
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to generate wallet: {e}")
            return {"success": False, "error": str(e)}

    async def redeem_tokens(
        self,
        user_private_key: str,
        amount: int,
        user_address: str
    ) -> Dict[str, Any]:
        """Redeem WELL tokens using batch transaction (approve + redeem)"""
        try:
            payload = {
                "userPrivateKey": user_private_key,
                "amount": amount,
                "userAddress": user_address
            }
            response = await self.client.post(
                f"{self.base_url}/smart-account/redeem-tokens",
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to redeem tokens: {e}")
            return {"success": False, "error": str(e)}

    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

# Singleton instance
_biconomy_client: Optional[BiconomyClient] = None

def get_biconomy_client() -> BiconomyClient:
    """Get singleton Biconomy client instance"""
    global _biconomy_client
    if _biconomy_client is None:
        _biconomy_client = BiconomyClient()
    return _biconomy_client

async def close_biconomy_client():
    """Close the singleton client"""
    global _biconomy_client
    if _biconomy_client is not None:
        await _biconomy_client.close()
        _biconomy_client = None