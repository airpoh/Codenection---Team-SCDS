"""
OpenZeppelin Defender Relayer webhook handler & backend operations
Receives transaction status updates from Relayer service
Provides endpoints for admin/backend operations via Relayer
"""

from fastapi import APIRouter, HTTPException, Header, Request, Depends
from pydantic import BaseModel
from typing import Optional, List
import hmac
import hashlib
import logging
import os

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/relayer", tags=["relayer", "backend-operations"])

# Get configuration from environment
WEBHOOK_SIGNING_KEY = os.getenv("WEBHOOK_SIGNING_KEY", "unimate_webhook_key_12345_secure_development_key_2024")
REDEMPTION_SYSTEM_ADDRESS = os.getenv("REDEMPTION_SYSTEM_ADDRESS", "0x06CD3f30bbD1765415eE5B3C84D34c5eaaDCa635")
WELL_TOKEN_ADDRESS = os.getenv("WELL_TOKEN_ADDRESS", "0x2AaBE1C44a3122776f84C22eB3E9EBcb881c2651")

class RelayerWebhookEvent(BaseModel):
    """Relayer webhook event payload"""
    transaction_id: str
    relayer_id: str
    status: str  # "pending", "sent", "confirmed", "failed"
    hash: Optional[str] = None
    block_number: Optional[int] = None
    gas_used: Optional[int] = None
    gas_price: Optional[str] = None
    error: Optional[str] = None

async def get_raw_body(request: Request) -> bytes:
    """Get raw request body for signature verification."""
    return await request.body()


async def verify_webhook_signature(
    raw_body: bytes = Depends(get_raw_body),
    x_webhook_signature: Optional[str] = Header(None)
) -> bool:
    """
    Verify webhook signature using HMAC SHA256.

    Raises:
        HTTPException: If signature is invalid or missing
    """
    if not x_webhook_signature:
        logger.warning("Missing webhook signature header")
        raise HTTPException(status_code=403, detail="Missing signature")

    expected_sig = hmac.new(
        WEBHOOK_SIGNING_KEY.encode(),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Use constant-time comparison to prevent timing attacks
    if not hmac.compare_digest(x_webhook_signature, expected_sig):
        logger.warning("Invalid webhook signature")
        raise HTTPException(status_code=403, detail="Invalid signature")

    return True


@router.post("/webhook")
async def relayer_webhook(
    raw_body: bytes = Depends(get_raw_body),
    verified: bool = Depends(verify_webhook_signature)
):
    """
    Receive transaction status updates from OpenZeppelin Relayer

    Security: Verifies webhook signature to ensure it's from our Relayer
    Using FastAPI Depends pattern to properly handle body reading and signature verification
    """
    try:
        # Parse the verified body
        import json
        event_data = json.loads(raw_body)
        event = RelayerWebhookEvent(**event_data)

        # Log event
        logger.info(f"Relayer webhook: {event.transaction_id} - {event.status}")

        # Handle different statuses
        if event.status == "confirmed":
            # Transaction confirmed on blockchain
            await handle_confirmed_transaction(event)
        elif event.status == "failed":
            # Transaction failed
            await handle_failed_transaction(event)

        return {"received": True, "transaction_id": event.transaction_id}

    except Exception as e:
        logger.error(f"Webhook processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def handle_confirmed_transaction(event: RelayerWebhookEvent):
    """Process confirmed transaction"""
    # TODO: Update database based on transaction type
    # Example: Mark point reconciliation as complete
    logger.info(f"✅ Transaction confirmed: {event.hash}")
    logger.info(f"   Gas used: {event.gas_used}")
    logger.info(f"   Block: {event.block_number}")

    # Future implementation: Update database
    # from services.supabase_client import get_supabase_service
    # supabase = get_supabase_service()
    # await supabase.mark_reconciliation_complete(event.transaction_id, event.hash)

async def handle_failed_transaction(event: RelayerWebhookEvent):
    """Process failed transaction"""
    # TODO: Handle failure (retry, alert admin, etc.)
    logger.error(f"❌ Transaction failed: {event.transaction_id}")
    logger.error(f"   Error: {event.error}")

    # Future implementation: Alert admin, retry logic
    # await notify_admin_of_failure(event)
    # await schedule_retry(event)

@router.get("/health")
async def relayer_health():
    """
    Check if relayer integration is healthy
    """
    try:
        from services.defender_relayer_client import get_relayer_client
        from config import settings

        # Check if Defender is enabled
        if not settings.DEFENDER_ENABLED:
            return {
                "status": "disabled",
                "message": "OpenZeppelin Defender is not configured",
                "reason": "Service discontinued for new users - no API access available",
                "biconomy_status": "active",
                "working_features": [
                    "User-initiated gasless minting (/mint_gasless)",
                    "Smart account creation (/aa/get-address)",
                    "Batch transactions (/aa/execute-batch)",
                    "Transaction status queries (/aa/status/{hash})"
                ],
                "unavailable_features": [
                    "Backend reconcile points (/relayer/backend-ops/reconcile-points)",
                    "Backend mint NFTs (/relayer/backend-ops/mint-nft)",
                    "Admin operations from server"
                ],
                "recommendation": "Use Biconomy-powered endpoints for user transactions"
            }

        relayer = get_relayer_client()

        if relayer is None:
            return {
                "status": "disabled",
                "message": "Defender client not initialized"
            }

        health = await relayer.health_check()

        return {
            "status": "healthy",
            "relayer_service": health,
            "webhook_endpoint": "/relayer/webhook"
        }
    except Exception as e:
        logger.error(f"Relayer health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }


# ============================================================================
# BACKEND OPERATIONS ENDPOINTS (Admin/Relayer Operations)
# ============================================================================

def check_defender_available():
    """Helper to check if Defender is available, raises HTTPException if not"""
    from config import settings

    if not settings.DEFENDER_ENABLED:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Service Unavailable",
                "message": "OpenZeppelin Defender backend relayer is not configured",
                "reason": "Defender service discontinued for new users",
                "alternative": "Use Biconomy-powered endpoints for user-initiated transactions",
                "working_endpoints": [
                    "/mint_gasless - User gasless minting",
                    "/aa/get-address - Smart account creation",
                    "/aa/execute-batch - Batch transactions"
                ]
            }
        )

class BatchReconcileRequest(BaseModel):
    """Request to reconcile points for multiple users"""
    user_addresses: List[str]
    points: List[int]

class PauseContractRequest(BaseModel):
    """Request to pause a contract"""
    contract_address: str
    reason: Optional[str] = "Emergency pause by admin"

class TransactionStatusResponse(BaseModel):
    """Response for transaction status"""
    transaction_id: str
    status: str
    hash: Optional[str] = None
    block_number: Optional[int] = None
    gas_used: Optional[int] = None


@router.post("/backend-ops/reconcile-points")
async def reconcile_points_batch(request: BatchReconcileRequest):
    """
    Batch reconcile points to WELL tokens via Defender Relayer

    This endpoint:
    1. Encodes batchReconcile() function call
    2. Sends transaction via Relayer (gasless for backend)
    3. Returns transaction ID for tracking

    Called by:
    - Cron job (nightly reconciliation)
    - Admin action (manual reconciliation)

    Note: Requires BACKEND_ROLE on RedemptionSystem contract
    """
    # Check if Defender is available
    check_defender_available()

    try:
        from services.defender_relayer_client import get_relayer_client

        # Validate input
        if len(request.user_addresses) != len(request.points):
            raise HTTPException(
                status_code=400,
                detail="user_addresses and points arrays must have same length"
            )

        if len(request.user_addresses) == 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot reconcile empty batch"
            )

        if len(request.user_addresses) > 200:
            raise HTTPException(
                status_code=400,
                detail="Batch too large (max 200 users)"
            )

        # Get relayer client
        relayer = get_relayer_client()

        # Encode batchReconcile function call
        function_signature = "batchReconcile(address[],uint256[])"
        data = await relayer.encode_function_call(
            function_signature,
            ["address[]", "uint256[]"],
            [request.user_addresses, request.points]
        )

        logger.info(f"Encoded batchReconcile for {len(request.user_addresses)} users")

        # Send transaction via Relayer
        result = await relayer.send_transaction(
            relayer_id="unimate-polygon-amoy",
            to=REDEMPTION_SYSTEM_ADDRESS,
            data=data,
            gas_limit=500000,  # ~3k gas per user
            speed="fast"
        )

        logger.info(f"✅ Reconciliation submitted: {result.get('transaction_id')}")

        return {
            "success": True,
            "transaction_id": result["transaction_id"],
            "status": result["status"],
            "users_count": len(request.user_addresses),
            "total_points": sum(request.points),
            "contract": REDEMPTION_SYSTEM_ADDRESS,
            "message": "Batch reconciliation submitted to Relayer"
        }

    except Exception as e:
        logger.error(f"❌ Reconciliation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backend-ops/pause-contract")
async def pause_contract(request: PauseContractRequest):
    """
    Emergency pause a contract via Defender Relayer

    This endpoint:
    1. Encodes pause() function call
    2. Sends transaction via Relayer with FASTEST speed
    3. Returns transaction ID

    Called by:
    - Admin action (manual emergency response)
    - Automated monitoring (fraud detection)

    Note: Requires PAUSER_ROLE on target contract
    """
    # Check if Defender is available
    check_defender_available()

    try:
        from services.defender_relayer_client import get_relayer_client

        # Validate contract address
        if not request.contract_address.startswith("0x") or len(request.contract_address) != 42:
            raise HTTPException(
                status_code=400,
                detail="Invalid contract address format"
            )

        # Get relayer client
        relayer = get_relayer_client()

        # Encode pause() function call
        function_signature = "pause()"
        data = await relayer.encode_function_call(
            function_signature,
            [],
            []
        )

        logger.warning(f"⚠️  PAUSE REQUEST: {request.contract_address}")
        logger.warning(f"   Reason: {request.reason}")

        # Send transaction via Relayer (FASTEST speed for emergency)
        result = await relayer.send_transaction(
            relayer_id="unimate-polygon-amoy",
            to=request.contract_address,
            data=data,
            gas_limit=100000,
            speed="fastest"  # Emergency - use fastest
        )

        logger.warning(f"🚨 Pause transaction submitted: {result.get('transaction_id')}")

        return {
            "success": True,
            "transaction_id": result["transaction_id"],
            "contract": request.contract_address,
            "action": "pause",
            "reason": request.reason,
            "message": "Emergency pause submitted to Relayer"
        }

    except Exception as e:
        logger.error(f"❌ Pause failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backend-ops/unpause-contract")
async def unpause_contract(contract_address: str):
    """
    Unpause a previously paused contract via Defender Relayer

    Note: Requires PAUSER_ROLE on target contract
    """
    try:
        from services.defender_relayer_client import get_relayer_client

        # Validate contract address
        if not contract_address.startswith("0x") or len(contract_address) != 42:
            raise HTTPException(
                status_code=400,
                detail="Invalid contract address format"
            )

        # Get relayer client
        relayer = get_relayer_client()

        # Encode unpause() function call
        function_signature = "unpause()"
        data = await relayer.encode_function_call(
            function_signature,
            [],
            []
        )

        logger.info(f"⏯️  UNPAUSE REQUEST: {contract_address}")

        # Send transaction via Relayer
        result = await relayer.send_transaction(
            relayer_id="unimate-polygon-amoy",
            to=contract_address,
            data=data,
            gas_limit=100000,
            speed="fast"
        )

        logger.info(f"✅ Unpause transaction submitted: {result.get('transaction_id')}")

        return {
            "success": True,
            "transaction_id": result["transaction_id"],
            "contract": contract_address,
            "action": "unpause",
            "message": "Unpause submitted to Relayer"
        }

    except Exception as e:
        logger.error(f"❌ Unpause failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/backend-ops/transaction/{transaction_id}")
async def get_transaction_status(transaction_id: str):
    """
    Get status of a Relayer transaction

    Returns current status, hash (if mined), gas used, etc.
    """
    try:
        from services.defender_relayer_client import get_relayer_client

        relayer = get_relayer_client()
        status = await relayer.get_transaction_status(
            relayer_id="unimate-polygon-amoy",
            transaction_id=transaction_id
        )

        return {
            "success": True,
            "transaction": status
        }

    except Exception as e:
        logger.error(f"Failed to get transaction status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SCHEDULED JOBS (Cron Jobs)
# ============================================================================

async def daily_reconciliation_job():
    """
    Daily point reconciliation job - runs at midnight UTC

    This job:
    1. Queries database for users with pending point reconciliations
    2. Batches users into groups of 200 (gas limit optimization)
    3. Submits batch reconciliation via Defender Relayer
    4. Updates database with transaction IDs

    Called by: APScheduler (scheduled in app.py)
    """
    try:
        logger.info("🕐 Starting daily point reconciliation...")

        # TODO: Implement database query for pending reconciliations
        # For now, this is a placeholder structure

        # Example query structure:
        # from services.supabase_client import get_supabase_service
        # supabase = get_supabase_service()
        #
        # pending_users = await supabase.client
        #     .from_("point_reconciliation")
        #     .select("user_address, total_points")
        #     .eq("reconciled", False)
        #     .execute()

        # Placeholder: Simulate pending reconciliations
        pending_users = []

        if not pending_users:
            logger.info("✅ No pending reconciliations - skipping job")
            return

        logger.info(f"📊 Found {len(pending_users)} users with pending points")

        # Batch users into groups of 200 (gas limit optimization)
        batch_size = 200
        batches = [
            pending_users[i:i + batch_size]
            for i in range(0, len(pending_users), batch_size)
        ]

        logger.info(f"📦 Processing {len(batches)} batches...")

        from services.defender_relayer_client import get_relayer_client
        relayer = get_relayer_client()

        transaction_ids = []

        for batch_num, batch in enumerate(batches, 1):
            # Extract addresses and points from batch
            addresses = [user["user_address"] for user in batch]
            points = [user["total_points"] for user in batch]

            # Encode batchReconcile function call
            data = await relayer.encode_function_call(
                "batchReconcile(address[],uint256[])",
                ["address[]", "uint256[]"],
                [addresses, points]
            )

            # Submit transaction via Relayer
            result = await relayer.send_transaction(
                relayer_id="unimate-polygon-amoy",
                to=REDEMPTION_SYSTEM_ADDRESS,
                data=data,
                gas_limit=500000,
                speed="average"  # Not urgent, save gas
            )

            transaction_ids.append(result["transaction_id"])

            logger.info(
                f"✅ Batch {batch_num}/{len(batches)} submitted: "
                f"{result['transaction_id']} ({len(addresses)} users)"
            )

            # Small delay between batches to avoid nonce conflicts
            import asyncio
            await asyncio.sleep(2)

        logger.info(f"🎉 Daily reconciliation completed successfully!")
        logger.info(f"   Total batches: {len(batches)}")
        logger.info(f"   Total users: {len(pending_users)}")
        logger.info(f"   Transaction IDs: {', '.join(transaction_ids)}")

        # TODO: Update database to mark reconciliations as submitted
        # await supabase.client
        #     .from_("point_reconciliation")
        #     .update({"reconciled": True, "transaction_ids": transaction_ids})
        #     .eq("reconciled", False)
        #     .execute()

    except Exception as e:
        logger.error(f"❌ Daily reconciliation failed: {e}")
        # TODO: Send alert to admin
        raise


@router.post("/backend-ops/trigger-reconciliation")
async def trigger_manual_reconciliation():
    """
    Manually trigger the daily reconciliation job

    Useful for:
    - Testing the reconciliation flow
    - Running reconciliation outside of scheduled time
    - Emergency reconciliation after system downtime

    Note: This endpoint should be protected with admin authentication in production
    """
    try:
        logger.info("🔧 Manual reconciliation triggered by admin")
        await daily_reconciliation_job()

        return {
            "success": True,
            "message": "Manual reconciliation completed successfully"
        }

    except Exception as e:
        logger.error(f"Manual reconciliation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
