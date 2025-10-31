from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import logging

from services.biconomy_client import get_biconomy_client
from routers.core_supabase import get_authenticated_user
from utils.crypto import decrypt_private_key
from models import (
    db, get_db, SmartAccountInfo, ActivityLog
)

logger = logging.getLogger(__name__)
router = APIRouter()

# SECURITY: Helper function to safely retrieve and decrypt user private keys
def get_user_private_key(user_id: str) -> str:
    """Securely retrieve and decrypt user's private key from database (SQLAlchemy)"""
    session = db()
    try:
        # Query smart account info using SQLAlchemy
        account_info = session.query(SmartAccountInfo).filter(
            SmartAccountInfo.user_id == user_id
        ).first()

        if not account_info:
            raise HTTPException(status_code=400, detail="User smart account not found. Please contact support.")

        # Decrypt the stored private key
        encrypted_private_key = account_info.encrypted_private_key
        try:
            decrypted_private_key = decrypt_private_key(encrypted_private_key)
            return decrypted_private_key
        except Exception as e:
            logger.error(f"Failed to decrypt private key for user {user_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to decrypt private key. Please contact support.")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to retrieve account for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve smart account.")
    finally:
        session.close()

# Request/Response Models - SECURE: No private keys from frontend
class CreateSmartAccountRequest(BaseModel):
    # No private key - will be retrieved from secure server storage
    pass

class SmartAccountAddressRequest(BaseModel):
    # No private key - will be retrieved from secure server storage
    pass

class TransactionRequest(BaseModel):
    to: str
    value: Optional[int] = 0
    data: Optional[str] = "0x"

class ExecuteTransactionRequest(BaseModel):
    # No private key - will be retrieved from secure server storage
    transaction: TransactionRequest

class BatchTransactionRequest(BaseModel):
    # No private key - will be retrieved from secure server storage
    transactions: List[TransactionRequest]

class RedeemTokensRequest(BaseModel):
    # No private key - will be retrieved from secure server storage
    amount: int
    user_address: str

class WellnessRedeemRequest(BaseModel):
    # CONSOLIDATED: Wellness redemption from blockchain.py - SECURE version
    amount: int
    reward_id: str
    smart_account_address: str

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
    """Create a smart account for the authenticated user - SECURE: uses server-stored private key"""
    try:
        # SECURITY: Get user's decrypted private key
        private_key = get_user_private_key(current_user["sub"])

        client = get_biconomy_client()
        result = await client.create_smart_account(private_key)

        if result.get("success"):
            # Store smart account info in database using SQLAlchemy
            session = db()
            try:
                # Check if account already exists
                existing = session.query(SmartAccountInfo).filter(
                    SmartAccountInfo.user_id == current_user["sub"]
                ).first()

                if existing:
                    # Update existing record
                    existing.smart_account_address = result.get("smartAccountAddress")
                    existing.signer_address = result.get("signerAddress")
                    existing.updated_at = datetime.utcnow()
                else:
                    # Create new record (shouldn't happen since private key exists)
                    logger.warning(f"Creating smart account info without existing private key for user {current_user['sub']}")

                session.commit()
                logger.info(f"Stored smart account info for user {current_user['sub']}")
            except Exception as db_error:
                session.rollback()
                logger.warning(f"Failed to store smart account in DB: {db_error}")
            finally:
                session.close()

        return SmartAccountResponse(**result)
    except Exception as e:
        logger.error(f"Create smart account error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/smart-account/address", response_model=SmartAccountResponse)
async def get_smart_account_address(
    request: SmartAccountAddressRequest,
    current_user: dict = Depends(get_authenticated_user)
):
    """Get smart account address for user - SECURE: uses server-stored private key"""
    try:
        # SECURITY: Get user's decrypted private key
        private_key = await get_user_private_key(current_user["sub"])

        client = get_biconomy_client()
        result = await client.get_smart_account_address(private_key)
        return SmartAccountResponse(**result)
    except Exception as e:
        logger.error(f"Get smart account address error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/smart-account/execute", response_model=TransactionResponse)
async def execute_transaction(
    request: ExecuteTransactionRequest,
    current_user: dict = Depends(get_authenticated_user)
):
    """Execute a single transaction via smart account - SECURE: uses server-stored private key"""
    try:
        # SECURITY: Get user's decrypted private key
        private_key = await get_user_private_key(current_user["sub"])

        client = get_biconomy_client()
        result = await client.execute_transaction(
            private_key,
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
    """Execute multiple transactions in a single UserOperation - SECURE: uses server-stored private key"""
    try:
        # SECURITY: Get user's decrypted private key
        private_key = await get_user_private_key(current_user["sub"])

        client = get_biconomy_client()
        transactions = [tx.dict() for tx in request.transactions]
        result = await client.execute_batch_transactions(
            private_key,
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
    """Estimate gas for a transaction - SECURE: uses server-stored private key"""
    try:
        # SECURITY: Get user's decrypted private key
        private_key = await get_user_private_key(current_user["sub"])

        client = get_biconomy_client()
        result = await client.estimate_transaction_gas(
            private_key,
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
    """Redeem WELL tokens using batch transaction - SECURE: uses server-stored private key"""
    try:
        # SECURITY: Get user's decrypted private key
        private_key = await get_user_private_key(current_user["sub"])

        client = get_biconomy_client()
        result = await client.redeem_tokens(
            private_key,
            request.amount,
            request.user_address
        )

        # Log redemption attempt in database using SQLAlchemy
        session = db()
        try:
            activity_log = ActivityLog(
                profile_id=current_user["sub"],
                activity_type='general_redemption',
                amount=request.amount,
                smart_account_address=request.user_address,
                transaction_hash=result.get("transactionHash"),
                status='success' if result.get("success", False) else 'failed',
                details={'user_address': request.user_address}
            )
            session.add(activity_log)
            session.commit()
            logger.info(f"Logged redemption for user {current_user['sub']}")
        except Exception as db_error:
            session.rollback()
            logger.warning(f"Failed to log redemption in DB: {db_error}")
        finally:
            session.close()

        return TransactionResponse(**result)
    except Exception as e:
        logger.error(f"Redeem tokens error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/smart-account/wellness-redeem", response_model=TransactionResponse)
async def wellness_redeem(
    request: WellnessRedeemRequest,
    current_user: dict = Depends(get_authenticated_user)
):
    """CONSOLIDATED: Wellness redemption via Smart Account - SECURE replacement for blockchain.py /aa/wellness-redeem"""
    try:
        # SECURITY: Get user's decrypted private key
        private_key = await get_user_private_key(current_user["sub"])

        # Use existing redeem_tokens functionality with wellness-specific logic
        client = get_biconomy_client()
        result = await client.redeem_tokens(
            private_key,
            request.amount,
            request.smart_account_address
        )

        # Log wellness redemption attempt in database using SQLAlchemy
        session = db()
        try:
            activity_log = ActivityLog(
                profile_id=current_user["sub"],
                activity_type='wellness_redemption',
                amount=request.amount,
                smart_account_address=request.smart_account_address,
                transaction_hash=result.get("transactionHash"),
                status='success' if result.get("success", False) else 'failed',
                details={'reward_id': request.reward_id}
            )
            session.add(activity_log)
            session.commit()
            logger.info(f"Wellness redemption logged for user {current_user['sub']}: {request.amount} WELL for {request.reward_id}")
        except Exception as db_error:
            session.rollback()
            logger.warning(f"Failed to log wellness redemption: {db_error}")
        finally:
            session.close()

        return TransactionResponse(**result)
    except Exception as e:
        logger.error(f"Wellness redeem error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PHASE 4: POINT-BASED REDEMPTION & BATCH CLAIMING (Biconomy + EIP-712)
# ============================================================================

class RedeemWithPointsRequest(BaseModel):
    """Request to redeem voucher using challenge points"""
    points: int
    voucher_id: str
    smart_account_address: str

class BatchClaimRequest(BaseModel):
    """Request to batch claim multiple rewards"""
    claims: List[Dict[str, Any]]  # [{points: int, task_id: str}, ...]
    smart_account_address: str


@router.post("/smart-account/redeem-with-points", response_model=TransactionResponse)
async def redeem_voucher_with_points(
    request: RedeemWithPointsRequest,
    current_user: dict = Depends(get_authenticated_user)
):
    """
    Redeem voucher using challenge points (GASLESS via Biconomy)

    Flow:
    1. Backend creates EIP-712 signature for on-chain validation
    2. Backend encodes redeemWithPoints() function call
    3. Backend creates UserOperation via Biconomy SDK
    4. Biconomy Paymaster sponsors gas (student pays $0)
    5. Smart contract validates signature and processes redemption

    This is PATH 1 of the architecture: Student Actions → Biconomy → Blockchain
    """
    try:
        logger.info(f"Point-based redemption: {request.points} points for voucher {request.voucher_id}")

        # SECURITY: Get user's decrypted private key
        private_key = await get_user_private_key(current_user["sub"])

        # Get Biconomy client
        client = get_biconomy_client()

        # Call the biconomy_client method for point-based redemption
        result = await client.redeem_with_points(
            private_key=private_key,
            points=request.points,
            voucher_id=request.voucher_id,
            user_address=request.smart_account_address
        )

        # Log redemption in database using SQLAlchemy
        session = db()
        try:
            activity_log = ActivityLog(
                profile_id=current_user["sub"],
                activity_type='point_redemption',
                amount=request.points,
                smart_account_address=request.smart_account_address,
                transaction_hash=result.get("transactionHash"),
                status='success' if result.get("success", False) else 'failed',
                details={'voucher_id': request.voucher_id, 'points': request.points}
            )
            session.add(activity_log)
            session.commit()
            logger.info(f"✅ Point redemption logged: {request.points} points for {request.voucher_id}")
        except Exception as db_error:
            session.rollback()
            logger.warning(f"Failed to log point redemption in DB: {db_error}")
        finally:
            session.close()

        return TransactionResponse(**result)

    except Exception as e:
        logger.error(f"❌ Redeem with points error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/smart-account/batch-claim", response_model=TransactionResponse)
async def batch_claim_rewards(
    request: BatchClaimRequest,
    current_user: dict = Depends(get_authenticated_user)
):
    """
    Batch claim multiple challenge rewards in one gasless transaction

    Allows students to claim multiple completed tasks/challenges at once
    without paying gas fees for each claim separately.

    This is more gas-efficient and provides better UX.
    """
    try:
        logger.info(f"Batch claim: {len(request.claims)} rewards for user {current_user['sub']}")

        # SECURITY: Get user's decrypted private key
        private_key = await get_user_private_key(current_user["sub"])

        # Get Biconomy client
        client = get_biconomy_client()

        # Call the biconomy_client method for batch claiming
        result = await client.batch_claim_rewards(
            private_key=private_key,
            claims=request.claims,
            user_address=request.smart_account_address
        )

        # Log batch claim in database using SQLAlchemy
        session = db()
        try:
            for claim in request.claims:
                activity_log = ActivityLog(
                    profile_id=current_user["sub"],
                    activity_type='reward_claim',
                    amount=claim.get("points"),
                    smart_account_address=request.smart_account_address,
                    transaction_hash=result.get("transactionHash"),
                    status='success' if result.get("success", False) else 'failed',
                    details={'task_id': claim.get("task_id"), 'points': claim.get("points")}
                )
                session.add(activity_log)
            session.commit()
            logger.info(f"✅ Batch claim logged: {len(request.claims)} rewards")
        except Exception as db_error:
            session.rollback()
            logger.warning(f"Failed to log batch claim in DB: {db_error}")
        finally:
            session.close()

        return TransactionResponse(**result)

    except Exception as e:
        logger.error(f"❌ Batch claim error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/smart-account/well-balance")
async def get_well_balance(
    address: str,
    current_user: dict = Depends(get_authenticated_user)
):
    """
    Get WELL token balance for user's smart account

    Returns the balance in WELL tokens (formatted as decimal string)
    """
    try:
        client = get_biconomy_client()
        result = await client.get_well_balance(address)
        return result
    except Exception as e:
        logger.error(f"Get WELL balance error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/smart-account/points-to-well")
async def convert_points_to_well(
    points: int,
    current_user: dict = Depends(get_authenticated_user)
):
    """
    Convert points to WELL tokens (preview calculation)

    Shows users how many WELL tokens they'll receive for their points
    before they complete the redemption.
    """
    try:
        client = get_biconomy_client()
        result = await client.points_to_well(points)
        return result
    except Exception as e:
        logger.error(f"Points to WELL conversion error: {e}")
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
    session = db()
    try:
        # Query smart account info using SQLAlchemy
        account_info = session.query(SmartAccountInfo).filter(
            SmartAccountInfo.user_id == current_user["sub"]
        ).first()

        if not account_info:
            return {
                "success": True,
                "user_id": current_user["sub"],
                "email": current_user.get("email"),
                "smart_account_info": None
            }

        return {
            "success": True,
            "user_id": current_user["sub"],
            "email": current_user.get("email"),
            "smart_account_info": {
                "smart_account_address": account_info.smart_account_address,
                "signer_address": account_info.signer_address,
                "created_at": account_info.created_at.isoformat() if account_info.created_at else None
            }
        }
    except Exception as e:
        logger.error(f"Get user smart account info error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

# REMOVED: Private key endpoint - users should not access private keys directly
# Private keys are managed internally by the backend for gasless transactions