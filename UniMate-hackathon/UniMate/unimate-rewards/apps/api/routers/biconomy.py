from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging

from services.biconomy_client import get_biconomy_client
from services.supabase_client import get_supabase_service
from routers.core_supabase import get_authenticated_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Request/Response Models
class CreateSmartAccountRequest(BaseModel):
    user_private_key: str

class SmartAccountAddressRequest(BaseModel):
    user_private_key: str

class TransactionRequest(BaseModel):
    to: str
    value: Optional[int] = 0
    data: Optional[str] = "0x"

class ExecuteTransactionRequest(BaseModel):
    user_private_key: str
    transaction: TransactionRequest

class BatchTransactionRequest(BaseModel):
    user_private_key: str
    transactions: List[TransactionRequest]

class RedeemTokensRequest(BaseModel):
    user_private_key: str
    amount: int
    user_address: str

class SmartAccountResponse(BaseModel):
    success: bool
    smartAccountAddress: Optional[str] = None
    signerAddress: Optional[str] = None
    error: Optional[str] = None

class TransactionResponse(BaseModel):
    success: bool
    transactionHash: Optional[str] = None
    smartAccountAddress: Optional[str] = None
    gasUsed: Optional[str] = None
    error: Optional[str] = None

@router.get("/health")
async def biconomy_health():
    """Check Biconomy service health"""
    try:
        client = get_biconomy_client()
        health_status = await client.health_check()
        return health_status
    except Exception as e:
        logger.error(f"Health check error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/smart-account/create", response_model=SmartAccountResponse)
async def create_smart_account(
    request: CreateSmartAccountRequest,
    current_user: dict = Depends(get_authenticated_user)
):
    """Create a smart account for the authenticated user"""
    try:
        client = get_biconomy_client()
        result = await client.create_smart_account(request.user_private_key)

        if result.get("success"):
            # Optionally store smart account info in database
            try:
                supabase = get_supabase_service()
                await supabase.store_user_smart_account(
                    user_id=current_user["sub"],
                    smart_account_address=result.get("smartAccountAddress"),
                    signer_address=result.get("signerAddress")
                )
            except Exception as db_error:
                logger.warning(f"Failed to store smart account in DB: {db_error}")

        return SmartAccountResponse(**result)
    except Exception as e:
        logger.error(f"Create smart account error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/smart-account/address", response_model=SmartAccountResponse)
async def get_smart_account_address(
    request: SmartAccountAddressRequest,
    current_user: dict = Depends(get_authenticated_user)
):
    """Get smart account address for user (deterministic)"""
    try:
        client = get_biconomy_client()
        result = await client.get_smart_account_address(request.user_private_key)
        return SmartAccountResponse(**result)
    except Exception as e:
        logger.error(f"Get smart account address error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/smart-account/execute", response_model=TransactionResponse)
async def execute_transaction(
    request: ExecuteTransactionRequest,
    current_user: dict = Depends(get_authenticated_user)
):
    """Execute a single transaction via smart account"""
    try:
        client = get_biconomy_client()
        result = await client.execute_transaction(
            request.user_private_key,
            request.transaction.dict()
        )
        return TransactionResponse(**result)
    except Exception as e:
        logger.error(f"Execute transaction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/smart-account/execute-batch", response_model=TransactionResponse)
async def execute_batch_transactions(
    request: BatchTransactionRequest,
    current_user: dict = Depends(get_authenticated_user)
):
    """Execute multiple transactions in a single UserOperation"""
    try:
        client = get_biconomy_client()
        transactions = [tx.dict() for tx in request.transactions]
        result = await client.execute_batch_transactions(
            request.user_private_key,
            transactions
        )
        return TransactionResponse(**result)
    except Exception as e:
        logger.error(f"Execute batch transactions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/smart-account/balance/{address}")
async def get_account_balance(
    address: str,
    current_user: dict = Depends(get_authenticated_user)
):
    """Get balance of a smart account"""
    try:
        client = get_biconomy_client()
        result = await client.get_account_balance(address)
        return result
    except Exception as e:
        logger.error(f"Get account balance error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/smart-account/estimate-gas")
async def estimate_transaction_gas(
    request: ExecuteTransactionRequest,
    current_user: dict = Depends(get_authenticated_user)
):
    """Estimate gas for a transaction"""
    try:
        client = get_biconomy_client()
        result = await client.estimate_transaction_gas(
            request.user_private_key,
            request.transaction.dict()
        )
        return result
    except Exception as e:
        logger.error(f"Estimate gas error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/smart-account/redeem-tokens", response_model=TransactionResponse)
async def redeem_tokens(
    request: RedeemTokensRequest,
    current_user: dict = Depends(get_authenticated_user)
):
    """Redeem WELL tokens using batch transaction (approve + redeem)"""
    try:
        client = get_biconomy_client()
        result = await client.redeem_tokens(
            request.user_private_key,
            request.amount,
            request.user_address
        )

        # Log redemption attempt in database
        try:
            supabase = get_supabase_service()
            await supabase.log_token_redemption(
                user_id=current_user["sub"],
                amount=request.amount,
                transaction_hash=result.get("transactionHash"),
                success=result.get("success", False)
            )
        except Exception as db_error:
            logger.warning(f"Failed to log redemption in DB: {db_error}")

        return TransactionResponse(**result)
    except Exception as e:
        logger.error(f"Redeem tokens error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Development/Testing endpoints (remove in production)
@router.get("/smart-account/generate-wallet")
async def generate_test_wallet():
    """Generate a new wallet for testing (development only)"""
    try:
        client = get_biconomy_client()
        result = await client.generate_new_wallet()
        return result
    except Exception as e:
        logger.error(f"Generate wallet error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/smart-account/user-info")
async def get_user_smart_account_info(current_user: dict = Depends(get_authenticated_user)):
    """Get smart account information for the current user"""
    try:
        supabase = get_supabase_service()
        user_info = await supabase.get_user_smart_account_info(current_user["sub"])
        return {
            "success": True,
            "user_id": current_user["sub"],
            "email": current_user.get("email"),
            "smart_account_info": user_info
        }
    except Exception as e:
        logger.error(f"Get user smart account info error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# REMOVED: Private key endpoint - users should not access private keys directly
# Private keys are managed internally by the backend for gasless transactions