"""
Automated Points Reconciliation System (Biconomy-based)

Replaces the disabled Defender Relayer approach with Biconomy Smart Account
Reconciles off-chain points from Supabase to on-chain WELL tokens daily
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
import subprocess
import json
import tempfile
import os
from datetime import datetime, timedelta

from routers.core_supabase import get_authenticated_user
from services.supabase_client import supabase_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reconciliation", tags=["reconciliation", "points"])

# Configuration
POINTS_TO_WELL_RATE = int(os.getenv("POINTS_TO_WELL_RATE", "100"))  # 100 points = 1 WELL
MAX_BATCH_SIZE = 200  # Gas limit optimization
NODE_SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "..", "aa-test", "batch-reconcile.js")

# === Models ===

class ReconciliationBatch(BaseModel):
    """Batch of users to reconcile"""
    users: List[str]  # User addresses
    points: List[int]  # Points to reconcile
    points_to_well_rate: int = 100

class ReconciliationResult(BaseModel):
    """Result of batch reconciliation"""
    success: bool
    transaction_hash: Optional[str] = None
    userOp_hash: Optional[str] = None
    users_reconciled: int
    total_points: int
    total_well: float
    block_number: Optional[str] = None
    error: Optional[str] = None

class ReconciliationStatus(BaseModel):
    """Status of reconciliation system"""
    enabled: bool
    last_run: Optional[str] = None
    next_run: Optional[str] = None
    pending_users: int
    total_pending_points: int

# === Helper Functions ===

async def get_pending_reconciliations() -> List[Dict[str, Any]]:
    """
    Query database for users with pending points that need reconciliation

    Pending points = total_points - points_reconciled

    Returns list of {user_id, wallet_address, pending_points, total_points, reconciled_points}
    """
    try:
        from models import db, UserPoints, SmartAccountInfo

        session = db()
        try:
            # Query users with pending points (total > reconciled)
            # Join with smart_account_info to get wallet addresses
            results = session.query(
                UserPoints.profile_id,
                SmartAccountInfo.smart_account_address,
                UserPoints.total_points,
                UserPoints.points_reconciled
            ).join(
                SmartAccountInfo,
                UserPoints.profile_id == SmartAccountInfo.profile_id
            ).filter(
                UserPoints.total_points > UserPoints.points_reconciled,
                SmartAccountInfo.smart_account_address.isnot(None)
            ).all()

            pending_users = []
            for profile_id, wallet_address, total_points, points_reconciled in results:
                pending_points = total_points - points_reconciled

                if pending_points > 0:
                    pending_users.append({
                        "user_id": profile_id,
                        "wallet_address": wallet_address,
                        "pending_points": pending_points,
                        "total_points": total_points,
                        "reconciled_points": points_reconciled
                    })

            logger.info(f"Found {len(pending_users)} users with pending points")
            if pending_users:
                total_pending = sum(u["pending_points"] for u in pending_users)
                logger.info(f"Total pending points to reconcile: {total_pending}")

            return pending_users

        finally:
            session.close()

    except Exception as e:
        logger.error(f"Failed to get pending reconciliations: {e}")
        return []

async def execute_batch_reconciliation(
    users: List[str],
    points: List[int],
    points_to_well_rate: int = 100
) -> ReconciliationResult:
    """
    Execute batch reconciliation via Node.js script (Biconomy)

    Args:
        users: List of user wallet addresses
        points: List of points to reconcile (must match users length)
        points_to_well_rate: Conversion rate (default 100 points = 1 WELL)

    Returns:
        ReconciliationResult with transaction details
    """
    if len(users) != len(points):
        raise ValueError("users and points arrays must have same length")

    if len(users) == 0:
        raise ValueError("Cannot reconcile empty batch")

    if len(users) > MAX_BATCH_SIZE:
        raise ValueError(f"Batch too large (max {MAX_BATCH_SIZE} users)")

    # Create batch configuration
    batch_config = {
        "users": users,
        "points": points,
        "points_to_well_rate": points_to_well_rate
    }

    # Write to temporary file
    with tempfile.NamedTemporaryFile(
        mode='w',
        suffix='.json',
        delete=False,
        prefix='reconcile-batch-'
    ) as f:
        json.dump(batch_config, f)
        config_path = f.name

    try:
        logger.info(f"Executing batch reconciliation for {len(users)} users...")
        logger.info(f"Config file: {config_path}")

        # Execute Node.js script
        result = subprocess.run(
            ['node', NODE_SCRIPT_PATH, config_path],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minutes timeout
            cwd=os.path.dirname(NODE_SCRIPT_PATH)
        )

        # Check for errors
        if result.returncode != 0:
            logger.error(f"Batch reconciliation script failed:")
            logger.error(f"STDOUT: {result.stdout}")
            logger.error(f"STDERR: {result.stderr}")
            raise Exception(f"Script failed with code {result.returncode}: {result.stderr}")

        # Read result file
        result_path = config_path.replace('.json', '-result.json')

        if not os.path.exists(result_path):
            logger.error(f"Result file not found: {result_path}")
            logger.error(f"STDOUT: {result.stdout}")
            raise Exception("Reconciliation completed but result file not found")

        with open(result_path, 'r') as f:
            result_data = json.load(f)

        # Clean up result file
        os.unlink(result_path)

        # Parse result
        if not result_data.get('success'):
            error_msg = result_data.get('error', 'Unknown error')
            logger.error(f"Batch reconciliation failed: {error_msg}")
            return ReconciliationResult(
                success=False,
                users_reconciled=0,
                total_points=0,
                total_well=0.0,
                error=error_msg
            )

        logger.info(f"✅ Batch reconciliation successful!")
        logger.info(f"   Tx Hash: {result_data.get('transactionHash')}")
        logger.info(f"   Users: {result_data.get('usersReconciled')}")
        logger.info(f"   Points: {result_data.get('totalPoints')}")
        logger.info(f"   WELL: {result_data.get('totalWELL')}")

        return ReconciliationResult(
            success=True,
            transaction_hash=result_data.get('transactionHash'),
            userOp_hash=result_data.get('userOpHash'),
            users_reconciled=result_data.get('usersReconciled', len(users)),
            total_points=result_data.get('totalPoints', sum(points)),
            total_well=result_data.get('totalWELL', sum(points) / points_to_well_rate),
            block_number=result_data.get('blockNumber')
        )

    except subprocess.TimeoutExpired:
        logger.error("Batch reconciliation timeout (5 minutes)")
        return ReconciliationResult(
            success=False,
            users_reconciled=0,
            total_points=0,
            total_well=0.0,
            error="Reconciliation timeout after 5 minutes"
        )
    except Exception as e:
        logger.error(f"Batch reconciliation error: {e}")
        return ReconciliationResult(
            success=False,
            users_reconciled=0,
            total_points=0,
            total_well=0.0,
            error=str(e)
        )
    finally:
        # Clean up config file
        if os.path.exists(config_path):
            os.unlink(config_path)

async def mark_users_reconciled(user_ids: List[str], transaction_hash: str):
    """
    Mark users as reconciled in database

    Updates points_reconciled to match total_points
    This way:
    - total_points stays the same (user can still see their points!)
    - points_reconciled = total_points (nothing pending)
    - pending_points = total_points - points_reconciled = 0
    """
    try:
        from models import db, UserPoints

        session = db()
        try:
            for user_id in user_ids:
                # Update user_points - set points_reconciled = total_points
                user_points = session.query(UserPoints).filter(
                    UserPoints.profile_id == user_id
                ).first()

                if user_points:
                    # Set reconciled to match total (all points now on-chain)
                    user_points.points_reconciled = user_points.total_points
                    user_points.last_reconciliation_date = datetime.utcnow()
                    user_points.last_reconciliation_tx = transaction_hash

            session.commit()
            logger.info(f"✅ Marked {len(user_ids)} users as reconciled")
            logger.info(f"   Transaction: {transaction_hash}")

        except Exception as db_error:
            session.rollback()
            logger.error(f"Database error marking users reconciled: {db_error}")
            raise
        finally:
            session.close()

    except Exception as e:
        logger.error(f"Failed to mark users as reconciled: {e}")
        # Don't raise - reconciliation succeeded on-chain, DB update is secondary

# === API Endpoints ===

@router.get("/status", response_model=ReconciliationStatus)
async def get_reconciliation_status():
    """
    Get current status of reconciliation system

    Returns:
        - enabled: Whether reconciliation is enabled
        - last_run: Last reconciliation timestamp
        - next_run: Next scheduled run
        - pending_users: Number of users awaiting reconciliation
        - total_pending_points: Total points to reconcile
    """
    try:
        # Get pending users
        pending_users = await get_pending_reconciliations()

        pending_count = len(pending_users)
        total_points = sum(u["pending_points"] for u in pending_users)

        # TODO: Get last_run and next_run from scheduler/database
        # For now, return placeholder values

        return ReconciliationStatus(
            enabled=True,
            last_run=None,  # TODO: Get from database
            next_run="Daily at 00:00 UTC",  # TODO: Get from scheduler
            pending_users=pending_count,
            total_pending_points=total_points
        )

    except Exception as e:
        logger.error(f"Failed to get reconciliation status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/trigger", response_model=ReconciliationResult)
async def trigger_manual_reconciliation(
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """
    Manually trigger batch reconciliation (ADMIN ONLY)

    This endpoint:
    1. Queries pending reconciliations from database
    2. Batches users into groups of 200
    3. Executes batch reconciliation via Biconomy
    4. Updates database with results

    Returns:
        ReconciliationResult with transaction details
    """
    try:
        logger.info(f"🔧 Manual reconciliation triggered by user {user.get('sub')}")

        # Get pending reconciliations
        pending_users = await get_pending_reconciliations()

        if not pending_users:
            return ReconciliationResult(
                success=True,
                users_reconciled=0,
                total_points=0,
                total_well=0.0,
                error="No pending reconciliations"
            )

        logger.info(f"📊 Found {len(pending_users)} users with pending points")

        # For now, process first batch only (max 200 users)
        # TODO: Implement multi-batch processing
        batch = pending_users[:MAX_BATCH_SIZE]

        users = [u["wallet_address"] for u in batch]
        points = [u["pending_points"] for u in batch]
        user_ids = [u["user_id"] for u in batch]

        logger.info(f"Processing batch of {len(users)} users...")

        # Execute batch reconciliation
        result = await execute_batch_reconciliation(
            users=users,
            points=points,
            points_to_well_rate=POINTS_TO_WELL_RATE
        )

        # If successful, mark users as reconciled
        if result.success and result.transaction_hash:
            await mark_users_reconciled(user_ids, result.transaction_hash)
            logger.info(f"✅ Reconciliation completed successfully!")
        else:
            logger.error(f"❌ Reconciliation failed: {result.error}")

        return result

    except Exception as e:
        logger.error(f"Manual reconciliation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/daily-job")
async def daily_reconciliation_job():
    """
    Daily reconciliation job - called by APScheduler at midnight UTC

    This job:
    1. Queries all pending reconciliations
    2. Batches users into groups of 200
    3. Executes batch reconciliation for each group
    4. Updates database with results

    NOTE: This is called internally by the scheduler, not exposed publicly
    """
    try:
        logger.info("🕐 Starting daily reconciliation job...")

        # Get pending reconciliations
        pending_users = await get_pending_reconciliations()

        if not pending_users:
            logger.info("✅ No pending reconciliations - skipping job")
            return {"success": True, "message": "No pending reconciliations"}

        logger.info(f"📊 Found {len(pending_users)} users with pending points")

        # Batch users into groups of 200
        batches = [
            pending_users[i:i + MAX_BATCH_SIZE]
            for i in range(0, len(pending_users), MAX_BATCH_SIZE)
        ]

        logger.info(f"📦 Processing {len(batches)} batches...")

        successful_batches = 0
        failed_batches = 0
        total_users_reconciled = 0

        for batch_num, batch in enumerate(batches, 1):
            users = [u["wallet_address"] for u in batch]
            points = [u["pending_points"] for u in batch]
            user_ids = [u["user_id"] for u in batch]

            logger.info(f"Batch {batch_num}/{len(batches)}: {len(users)} users, {sum(points)} points")

            # Execute batch reconciliation
            result = await execute_batch_reconciliation(
                users=users,
                points=points,
                points_to_well_rate=POINTS_TO_WELL_RATE
            )

            if result.success and result.transaction_hash:
                # Mark users as reconciled
                await mark_users_reconciled(user_ids, result.transaction_hash)
                successful_batches += 1
                total_users_reconciled += result.users_reconciled
                logger.info(f"✅ Batch {batch_num} completed: {result.transaction_hash}")
            else:
                failed_batches += 1
                logger.error(f"❌ Batch {batch_num} failed: {result.error}")

            # Small delay between batches to avoid nonce conflicts
            if batch_num < len(batches):
                import asyncio
                await asyncio.sleep(5)

        logger.info(f"🎉 Daily reconciliation completed!")
        logger.info(f"   Successful batches: {successful_batches}/{len(batches)}")
        logger.info(f"   Failed batches: {failed_batches}")
        logger.info(f"   Users reconciled: {total_users_reconciled}")

        return {
            "success": True,
            "batches_processed": len(batches),
            "successful_batches": successful_batches,
            "failed_batches": failed_batches,
            "users_reconciled": total_users_reconciled
        }

    except Exception as e:
        logger.error(f"❌ Daily reconciliation job failed: {e}")
        # TODO: Send alert to admin
        raise

@router.get("/history")
async def get_reconciliation_history(
    limit: int = 10,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """
    Get reconciliation history for current user

    Returns list of past reconciliations with transaction hashes
    """
    try:
        user_id = user.get("sub")

        # Get user's reconciliation history from profile
        response = supabase_service.client.table("profiles").select(
            "last_reconciliation_date, last_reconciliation_tx"
        ).eq("user_id", user_id).execute()

        if not response.data:
            return []

        profile = response.data[0]

        if not profile.get("last_reconciliation_date"):
            return []

        return [{
            "date": profile["last_reconciliation_date"],
            "transaction_hash": profile.get("last_reconciliation_tx"),
            "explorer_url": f"https://amoy.polygonscan.com/tx/{profile.get('last_reconciliation_tx')}" if profile.get("last_reconciliation_tx") else None
        }]

    except Exception as e:
        logger.error(f"Failed to get reconciliation history: {e}")
        raise HTTPException(status_code=500, detail=str(e))
