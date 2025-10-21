"""
Direct Biconomy Integration - Python Native Implementation
Replaces the Node.js service dependency with direct web3.py integration
"""

import httpx
import logging
from typing import Dict, Any, Optional
from web3 import Web3, AsyncWeb3
from web3.eth import AsyncEth
from eth_account import Account
from eth_account.signers.local import LocalAccount
from config import settings

logger = logging.getLogger(__name__)

# Biconomy Simple Account Factory address (standard across chains)
SIMPLE_ACCOUNT_FACTORY = "0x9406Cc6185a346906296840746125a0E44976454"


class BiconomyDirectClient:
    """
    Direct Python implementation for Biconomy Smart Account operations.
    Uses web3.py to interact with Biconomy bundler and create deterministic smart accounts.
    """

    def __init__(
        self,
        bundler_url: str = None,
        paymaster_api_key: str = None,
        rpc_url: str = None,
        chain_id: int = None
    ):
        self.bundler_url = bundler_url or settings.BICONOMY_BUNDLER_URL
        self.paymaster_api_key = paymaster_api_key or settings.BICONOMY_PAYMASTER_API_KEY
        self.rpc_url = rpc_url or settings.AMOY_RPC_URL
        self.chain_id = chain_id or settings.CHAIN_ID

        # Initialize AsyncWeb3 for non-blocking operations
        self.w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(self.rpc_url))

        # HTTP client for bundler calls
        self.http_client = httpx.AsyncClient(timeout=30.0)

    async def get_smart_account_address(self, owner_private_key: str) -> Dict[str, Any]:
        """
        Get deterministic smart account address for a given owner.
        Uses Biconomy's SimpleAccount factory to compute the address.

        Args:
            owner_private_key: Private key of the EOA that will own the smart account

        Returns:
            {
                "success": True,
                "smartAccountAddress": "0x...",
                "ownerAddress": "0x...",
                "signerAddress": "0x..."  # Same as ownerAddress for simple accounts
            }
        """
        try:
            # Create account from private key
            if not owner_private_key.startswith('0x'):
                owner_private_key = '0x' + owner_private_key

            owner_account: LocalAccount = Account.from_key(owner_private_key)
            owner_address = owner_account.address

            # For Biconomy SimpleAccount, the smart account address is deterministic
            # based on: factory address, owner address, and salt (0 for first account)
            #
            # We use eth_call to getAddress(owner, 0) on the factory contract
            # Factory method: getAddress(address owner, uint256 salt) returns (address)

            factory_contract = self.w3.eth.contract(
                address=Web3.to_checksum_address(SIMPLE_ACCOUNT_FACTORY),
                abi=[{
                    "inputs": [
                        {"name": "owner", "type": "address"},
                        {"name": "salt", "type": "uint256"}
                    ],
                    "name": "getAddress",
                    "outputs": [{"name": "", "type": "address"}],
                    "stateMutability": "view",
                    "type": "function"
                }]
            )

            # Get deterministic smart account address (salt = 0)
            smart_account_address = await factory_contract.functions.getAddress(
                Web3.to_checksum_address(owner_address),
                0  # salt
            ).call()

            logger.info(f"Computed smart account address: {smart_account_address} for owner: {owner_address}")

            return {
                "success": True,
                "smartAccountAddress": smart_account_address,
                "ownerAddress": owner_address,
                "signerAddress": owner_address  # For SimpleAccount, signer = owner
            }

        except Exception as e:
            logger.error(f"Failed to get smart account address: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def create_smart_account(self, owner_private_key: str) -> Dict[str, Any]:
        """
        Create a smart account for a user.
        Note: In Biconomy SimpleAccount, the account is created on first UserOp.
        This method returns the deterministic address - actual deployment happens on first tx.

        Args:
            owner_private_key: Private key of the EOA that will own the smart account

        Returns:
            {
                "success": True,
                "smartAccountAddress": "0x...",
                "ownerAddress": "0x...",
                "deployed": False  # True only if we actually deploy
            }
        """
        try:
            # Get the deterministic address
            result = await self.get_smart_account_address(owner_private_key)

            if not result.get("success"):
                return result

            smart_account_address = result["smartAccountAddress"]

            # Check if smart account is already deployed
            code = await self.w3.eth.get_code(Web3.to_checksum_address(smart_account_address))
            is_deployed = len(code) > 0

            if is_deployed:
                logger.info(f"Smart account already deployed at {smart_account_address}")
            else:
                logger.info(f"Smart account will be deployed at {smart_account_address} on first transaction")

            return {
                "success": True,
                "smartAccountAddress": smart_account_address,
                "ownerAddress": result["ownerAddress"],
                "signerAddress": result["signerAddress"],
                "deployed": is_deployed
            }

        except Exception as e:
            logger.error(f"Failed to create smart account: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def get_account_balance(self, address: str) -> Dict[str, Any]:
        """Get native token balance of an address"""
        try:
            balance_wei = await self.w3.eth.get_balance(Web3.to_checksum_address(address))
            balance_eth = self.w3.from_wei(balance_wei, 'ether')

            return {
                "success": True,
                "balance": str(balance_eth),
                "balanceWei": str(balance_wei),
                "address": address
            }
        except Exception as e:
            logger.error(f"Failed to get balance: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def bundler_rpc_call(self, method: str, params: list) -> Dict[str, Any]:
        """
        Make a JSON-RPC call to Biconomy bundler.

        Args:
            method: JSON-RPC method (e.g., "eth_supportedEntryPoints")
            params: Array of parameters
        """
        try:
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": method,
                "params": params
            }

            response = await self.http_client.post(
                self.bundler_url,
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()

            result = response.json()

            if "error" in result:
                return {
                    "success": False,
                    "error": result["error"].get("message", str(result["error"]))
                }

            return {
                "success": True,
                "result": result.get("result")
            }

        except Exception as e:
            logger.error(f"Bundler RPC call failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def health_check(self) -> Dict[str, Any]:
        """Check bundler connectivity"""
        try:
            # Test bundler with eth_supportedEntryPoints
            result = await self.bundler_rpc_call("eth_supportedEntryPoints", [])

            if result.get("success"):
                return {
                    "status": "healthy",
                    "bundler": self.bundler_url,
                    "entryPoints": result.get("result", []),
                    "chainId": self.chain_id
                }
            else:
                return {
                    "status": "unhealthy",
                    "error": result.get("error"),
                    "bundler": self.bundler_url
                }

        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {
                "status": "unhealthy",
                "error": str(e)
            }

    async def close(self):
        """Close HTTP client"""
        await self.http_client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()


# Singleton instance
_biconomy_direct_client: Optional[BiconomyDirectClient] = None


def get_biconomy_direct_client() -> BiconomyDirectClient:
    """Get singleton Biconomy direct client instance"""
    global _biconomy_direct_client
    if _biconomy_direct_client is None:
        _biconomy_direct_client = BiconomyDirectClient()
    return _biconomy_direct_client


async def close_biconomy_direct_client():
    """Close the singleton client"""
    global _biconomy_direct_client
    if _biconomy_direct_client is not None:
        await _biconomy_direct_client.close()
        _biconomy_direct_client = None
