"""
User-friendly rewards and points system
Integrates with existing blockchain.py gasless infrastructure
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
from datetime import datetime, date, time as dt_time, timedelta
import time
import secrets
from zoneinfo import ZoneInfo

from routers.core_supabase import get_authenticated_user
from services.supabase_client import get_supabase_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rewards", tags=["rewards"])

# Define Malaysia timezone for consistent date/time handling
MALAYSIA_TZ = ZoneInfo("Asia/Kuala_Lumpur")

# Import activity logging helpers
try:
    from scripts.add_activity_logging import (
        log_voucher_redemption,
        log_points_earned,
        log_points_exchanged,
        log_challenge_completed
    )
    ACTIVITY_LOGGING_ENABLED = True
except ImportError:
    logger.warning("Activity logging not available")
    ACTIVITY_LOGGING_ENABLED = False

# Import from unified models.py (SQLAlchemy - 10-20x faster than REST API)
try:
    from models import (
        db as blockchain_db,
        UserPoints as BlockchainUserPoints,
        Profile,
        Voucher as BlockchainVoucher,
        SmartAccountInfo
    )
    from routers.blockchain import verify_sig, API_SECRET
    BLOCKCHAIN_INTEGRATION = True
except ImportError:
    logger.warning("Blockchain integration not available")
    BLOCKCHAIN_INTEGRATION = False

# === Unified Biconomy Gasless Minting Helper ===

async def mint_tokens_gasless(
    user_id: str,
    smart_account_address: str,
    token_amount: float,
    request: Request = None
) -> Dict[str, Any]:
    """
    Unified gasless minting function using Biconomy ERC-4337
    Replaces direct minting with true gasless smart account minting

    Args:
        user_id: User's UUID
        smart_account_address: User's Biconomy smart account address
        token_amount: Amount of WELL tokens to mint
        request: FastAPI request object

    Returns:
        Dict with tx_hash, user_op_hash, explorer URL, and success status
    """
    try:
        from routers.blockchain import mint_gasless, MintGaslessBody
        from config import API_SECRET
        import hmac, hashlib
        from web3 import Web3

        # Ensure address is properly checksummed
        wallet_address = Web3.to_checksum_address(smart_account_address)

        # Create HMAC signature for gasless minting
        current_time = int(time.time())
        raw_message = f"{wallet_address}|{token_amount}|{current_time}"
        signature = hmac.new(
            API_SECRET.encode(),
            raw_message.encode(),
            hashlib.sha256
        ).hexdigest()

        # Create gasless mint request
        mint_request = MintGaslessBody(
            to=wallet_address,
            amount=token_amount,
            ts=current_time,
            sig=signature
        )

        # Execute TRUE gasless mint via Biconomy ERC-4337
        mint_result = await mint_gasless(mint_request, request)

        logger.info(f"✅ Biconomy gasless mint successful for user {user_id}: {token_amount} WELL → {wallet_address}")
        logger.info(f"   Tx Hash: {mint_result.get('tx_hash')}")
        logger.info(f"   UserOp Hash: {mint_result.get('user_op_hash')}")

        return {
            "success": True,
            "tx_hash": mint_result.get("tx_hash"),
            "user_op_hash": mint_result.get("user_op_hash"),
            "explorer": mint_result.get("explorer"),
            "to": wallet_address,
            "amount": str(token_amount),
            "method": "Biconomy-ERC4337",
            "gasless": True
        }

    except Exception as e:
        logger.error(f"❌ Biconomy gasless mint failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Gasless minting failed: {str(e)}"
        )

# === User-friendly Models ===

class UserPoints(BaseModel):
    """用户积分信息"""
    total_points: int
    available_points: int  # 可用于兑换的积分
    earned_today: int
    earned_this_week: int

class Voucher(BaseModel):
    """兑换券信息"""
    id: str
    title: str
    description: str
    points_required: int
    category: str  # food, shopping, wellness, etc.
    image_url: Optional[str] = None
    expires_at: Optional[datetime] = None
    terms_conditions: Optional[str] = None

class UserVoucher(BaseModel):
    """用户已兑换的券"""
    id: str
    voucher: Voucher
    redeemed_at: datetime
    status: str  # active, used, expired
    redemption_code: str

class PointsTransaction(BaseModel):
    """积分交易记录"""
    id: str
    type: str  # earned, spent
    amount: int
    source: str  # task_completion, wellness_checkin, voucher_redemption
    description: str
    created_at: datetime

# === User-friendly Endpoints ===

@router.get("/points", response_model=UserPoints)
async def get_user_points(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """获取用户积分信息 - 从区块链系统获取真实数据"""
    try:
        user_id = user["sub"]
        
        if not BLOCKCHAIN_INTEGRATION:
            # Get points from Supabase instead of mock data
            try:
                supabase_service = get_supabase_service()

                # Get user profile with points
                response = supabase_service.client.table("profiles").select("points").eq("user_id", user_id).execute()

                total_points = 0
                if response.data:
                    total_points = response.data[0].get("points", 0)

                # Get today's earned points from user_challenges
                # Use Malaysia timezone for accurate "today" calculation
                today_malaysia = datetime.now(MALAYSIA_TZ).date()
                start_of_today = datetime.combine(today_malaysia, dt_time.min, tzinfo=MALAYSIA_TZ)
                start_of_tomorrow = start_of_today + timedelta(days=1)

                today_response = supabase_service.client.table("user_challenges").select("points_earned").eq("user_id", user_id).gte("completed_at", start_of_today.isoformat()).lt("completed_at", start_of_tomorrow.isoformat()).execute()

                earned_today_challenges = sum([challenge.get("points_earned", 0) for challenge in (today_response.data or [])])

                # ✅ Also count Daily Habits points completed today
                daily_habits_points = 0
                try:
                    from models import Task as TaskModel, Reminder as ReminderModel, db as blockchain_db_func
                    session_temp = blockchain_db_func()

                    # Convert Malaysia timezone to UTC for database comparison
                    # Database stores timestamps in UTC
                    start_of_today_utc = start_of_today.astimezone(ZoneInfo("UTC"))
                    start_of_tomorrow_utc = start_of_tomorrow.astimezone(ZoneInfo("UTC"))

                    logger.info(f"🕐 Checking Daily Habits for Malaysia date: {today_malaysia}")
                    logger.info(f"🕐 UTC range: {start_of_today_utc} to {start_of_tomorrow_utc}")

                    # Login: 5 points (if they're calling this API, they logged in today)
                    daily_habits_points += 5
                    logger.info(f"✅ Daily habits: Login +5 points")

                    # Add a task: 5 points
                    task_count = session_temp.query(TaskModel).filter(
                        TaskModel.user_id == user_id,
                        TaskModel.created_at >= start_of_today_utc,
                        TaskModel.created_at < start_of_tomorrow_utc
                    ).count()
                    logger.info(f"📋 Found {task_count} tasks created today")
                    if task_count > 0:
                        daily_habits_points += 5
                        logger.info(f"✅ Daily habits: Added {task_count} tasks +5 points")

                    # Add a reminder: 10 points
                    reminder_count = session_temp.query(ReminderModel).filter(
                        ReminderModel.user_id == user_id,
                        ReminderModel.created_at >= start_of_today_utc,
                        ReminderModel.created_at < start_of_tomorrow_utc
                    ).count()
                    logger.info(f"🔔 Found {reminder_count} reminders created today")
                    if reminder_count > 0:
                        daily_habits_points += 10
                        logger.info(f"✅ Daily habits: Added {reminder_count} reminders +10 points")

                    session_temp.close()
                    logger.info(f"💰 Total daily habits points: {daily_habits_points}")
                except Exception as e:
                    logger.error(f"❌ Failed to calculate daily habits points: {e}", exc_info=True)

                earned_today = earned_today_challenges + daily_habits_points

                logger.info(f"🎯 FINAL CALCULATION: Challenges={earned_today_challenges} + Daily Habits={daily_habits_points} = Total={earned_today}")

                # Calculate this week's points (simplified)
                earned_this_week = earned_today  # Can be enhanced to calculate weekly

                return UserPoints(
                    total_points=total_points,
                    available_points=total_points,
                    earned_today=earned_today,
                    earned_this_week=earned_this_week
                )

            except Exception as e:
                logger.error(f"Failed to get user points from Supabase: {e}")
                return UserPoints(
                    total_points=0,
                    available_points=0,
                    earned_today=0,
                    earned_this_week=0
                )
        
        # 从blockchain.py的数据库获取积分信息
        session = blockchain_db()
        try:
            # user_id from JWT is already the profile UUID
            # 获取用户积分记录
            user_points = session.query(BlockchainUserPoints).filter(
                BlockchainUserPoints.profile_id == user_id
            ).first()

            # ✅ PRIORITY 2: Perform daily reset check FIRST (reliable, timezone-aware)
            today_str_malaysia = datetime.now(MALAYSIA_TZ).strftime("%Y-%m-%d")

            if user_points:
                # Check if we need to reset for new day (Malaysia timezone)
                if user_points.last_daily_reset != today_str_malaysia:
                    user_points.earned_today = 0
                    user_points.last_daily_reset = today_str_malaysia
                    session.commit()
                    logger.info(f"🔄 Daily reset performed for user {user_id} (MYT: {today_str_malaysia})")
            else:
                # Create new points record if user doesn't have one
                user_points = BlockchainUserPoints(
                    profile_id=user_id,
                    total_points=0,
                    earned_today=0,
                    last_updated=int(time.time()),
                    last_daily_reset=today_str_malaysia
                )
                session.add(user_points)
                session.commit()
                logger.info(f"📝 Created new points record for user {user_id}")

            if user_points:
                # ✅ Calculate Daily Habits points for blockchain integration path
                daily_habits_points = 0

                # ⚠️ Do NOT use user_points.earned_today - it may include old daily habits additions
                # We'll calculate challenges separately from user_challenges table
                earned_today_challenges = 0

                try:
                    from models import Task as TaskModel, Reminder as ReminderModel, UserChallenge

                    # Use Malaysia timezone for accurate "today" calculation
                    today_malaysia = datetime.now(MALAYSIA_TZ).date()
                    today_str = today_malaysia.strftime("%Y-%m-%d")
                    start_of_today = datetime.combine(today_malaysia, dt_time.min, tzinfo=MALAYSIA_TZ)
                    start_of_tomorrow = start_of_today + timedelta(days=1)

                    # Convert Malaysia timezone to UTC for database comparison
                    start_of_today_utc = start_of_today.astimezone(ZoneInfo("UTC"))
                    start_of_tomorrow_utc = start_of_tomorrow.astimezone(ZoneInfo("UTC"))

                    logger.info(f"🕐 Checking Daily Habits for Malaysia date: {today_malaysia}")
                    logger.info(f"🕐 UTC range: {start_of_today_utc} to {start_of_tomorrow_utc}")

                    # ✅ Get actual challenges completed today from user_challenges table
                    from models import Challenge as ChallengeModel

                    challenges_today = session.query(UserChallenge).filter(
                        UserChallenge.profile_id == user_id,
                        UserChallenge.date == today_str,
                        UserChallenge.status == "completed"
                    ).all()

                    # DEBUG: Log query details
                    logger.info(f"🔍 Challenge query: user_id={user_id}, date={today_str}, status=completed")

                    # Get points from the related Challenge model
                    earned_today_challenges = 0
                    for uc in challenges_today:
                        logger.info(f"🔍 Found challenge: id={uc.challenge_id}, status={uc.status}, date={uc.date}")
                        if uc.challenge:
                            earned_today_challenges += uc.challenge.points_reward or 0

                    logger.info(f"🏆 Challenges completed today: {len(challenges_today)} challenges, {earned_today_challenges} points")

                    # Login: 5 points (if they're calling this API, they logged in today)
                    daily_habits_points += 5
                    logger.info(f"✅ Daily habits: Login +5 points")

                    # Add a task: 5 points
                    task_count = session.query(TaskModel).filter(
                        TaskModel.user_id == user_id,
                        TaskModel.created_at >= start_of_today_utc,
                        TaskModel.created_at < start_of_tomorrow_utc
                    ).count()
                    logger.info(f"📋 Found {task_count} tasks created today")
                    if task_count > 0:
                        daily_habits_points += 5
                        logger.info(f"✅ Daily habits: Added {task_count} tasks +5 points")

                    # Add a reminder: 10 points
                    reminder_count = session.query(ReminderModel).filter(
                        ReminderModel.user_id == user_id,
                        ReminderModel.created_at >= start_of_today_utc,
                        ReminderModel.created_at < start_of_tomorrow_utc
                    ).count()
                    logger.info(f"🔔 Found {reminder_count} reminders created today")
                    if reminder_count > 0:
                        daily_habits_points += 10
                        logger.info(f"✅ Daily habits: Added {reminder_count} reminders +10 points")

                    # Set mood today: 5 points
                    profile = session.query(Profile).filter(Profile.id == user_id).first()
                    mood_set_today = False
                    if profile and profile.updated_at:
                        # Check if profile was updated today (mood update triggers this)
                        try:
                            if isinstance(profile.updated_at, int):
                                # Unix timestamp
                                updated_datetime = datetime.fromtimestamp(profile.updated_at, tz=ZoneInfo("UTC"))
                            else:
                                # datetime object
                                updated_datetime = profile.updated_at
                                if updated_datetime.tzinfo is None:
                                    updated_datetime = updated_datetime.replace(tzinfo=ZoneInfo("UTC"))

                            # Check if it's today in Malaysia timezone
                            if updated_datetime >= start_of_today_utc and updated_datetime < start_of_tomorrow_utc:
                                mood_set_today = True
                        except Exception as e:
                            logger.error(f"Failed to check mood update time: {e}")

                    logger.info(f"😊 Mood set today: {mood_set_today}")
                    if mood_set_today:
                        daily_habits_points += 5
                        logger.info(f"✅ Daily habits: Set mood today +5 points")

                    logger.info(f"💰 Total daily habits points: {daily_habits_points}")
                except Exception as e:
                    logger.error(f"❌ Failed to calculate daily habits points: {e}", exc_info=True)

                # Calculate total earned today = challenges + daily habits
                earned_today_total = earned_today_challenges + daily_habits_points
                logger.info(f"🎯 FINAL CALCULATION: Challenges={earned_today_challenges} + Daily Habits={daily_habits_points} = Total={earned_today_total}")

                # Log database values
                logger.info(f"💎 Database total_points: {user_points.total_points}")
                logger.info(f"💎 Database earned_today (from DB): {user_points.earned_today}")

                # ⚠️ NOTE: We calculate daily habits but DO NOT persist them to DB
                # Daily habits should be awarded when actions happen, not at display time
                # For now, we just show the correct calculated value in the API response
                # The database may be out of sync, but it will correct itself at daily reset

                # For display: Use DATABASE values for both total and earned_today
                # The database is the source of truth, updated by earn_points()
                logger.info(f"📊 DISPLAY VALUES: total={user_points.total_points}, earned_today={user_points.earned_today}")

                # 计算本周积分 (简化实现)
                earned_this_week = user_points.earned_today * 7  # 简化计算

                return UserPoints(
                    total_points=user_points.total_points,
                    available_points=user_points.total_points,
                    earned_today=user_points.earned_today,  # ✅ Use database value (source of truth)
                    earned_this_week=earned_this_week
                )
            else:
                return UserPoints(
                    total_points=0,
                    available_points=0,
                    earned_today=0,
                    earned_this_week=0
                )
                
        finally:
            session.close()
        
    except Exception as e:
        logger.error(f"Failed to get user points: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve points")

@router.get("/points/history", response_model=List[PointsTransaction])
async def get_points_history(
    limit: int = 20,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """获取积分历史记录"""
    try:
        user_id = user["sub"]
        
        # TODO: 从数据库获取积分历史
        
        # 暂时返回模拟数据
        return [
            PointsTransaction(
                id="1",
                type="earned",
                amount=50,
                source="wellness_checkin",
                description="Complete daily wellness check-in",
                created_at=datetime.now()
            ),
            PointsTransaction(
                id="2",
                type="earned",
                amount=100,
                source="task_completion",
                description="Complete 3 tasks today",
                created_at=datetime.now()
            )
        ]
        
    except Exception as e:
        logger.error(f"Failed to get points history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve points history")

@router.get("/vouchers/available", response_model=List[Voucher])
async def get_available_vouchers(
    category: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """获取可兑换的券 - Reward Market"""
    try:
        # 真实的Reward Market券列表 - 马来西亚本地商家
        vouchers = [
            # 食物类
            Voucher(
                id="food_starbucks_10",
                title="Starbucks Malaysia RM10 Voucher",
                description="Enjoy premium coffee and beverages at any Starbucks Malaysia outlet",
                points_required=500,
                category="food",
                image_url="https://1000logos.net/wp-content/uploads/2020/05/Starbucks-Logo.png",
                terms_conditions="Valid for 30 days from redemption. Cannot be combined with other promotions."
            ),
            Voucher(
                id="food_kfc_15",
                title="KFC Malaysia RM15 Voucher",
                description="Finger lickin' good! Valid at all KFC Malaysia restaurants",
                points_required=750,
                category="food",
                image_url="https://logos-world.net/wp-content/uploads/2020/04/KFC-Logo.png",
                terms_conditions="Valid for 30 days. Not applicable for delivery charges."
            ),
            Voucher(
                id="food_mcd_12",
                title="McDonald's Malaysia RM12 Voucher",
                description="I'm lovin' it! Use at any McDonald's Malaysia outlet",
                points_required=600,
                category="food",
                image_url="https://logos-world.net/wp-content/uploads/2020/04/McDonalds-Logo.png"
            ),
            
            # 健康类
            Voucher(
                id="wellness_guardian_20",
                title="Guardian Malaysia RM20 Voucher",
                description="Health, beauty and wellness products at Guardian pharmacies",
                points_required=1000,
                category="wellness",
                image_url="https://www.guardian.com.my/images/guardian-logo.png",
                terms_conditions="Valid for health and beauty products only. Prescription medicines excluded."
            ),
            Voucher(
                id="wellness_fitness_first_trial",
                title="Fitness First - 3 Day Trial Pass",
                description="Experience premium fitness facilities with a 3-day trial membership",
                points_required=400,
                category="wellness",
                image_url="https://www.fitnessfirst.com.my/images/ff-logo.png"
            ),
            Voucher(
                id="wellness_yoga_class",
                title="Pure Yoga - Single Class Pass",
                description="Join a yoga session at Pure Yoga studios across Malaysia",
                points_required=350,
                category="wellness",
                image_url="https://pureyoga.com.my/images/pure-yoga-logo.png"
            ),
            
            # 购物类
            Voucher(
                id="shopping_grab_10",
                title="Grab Malaysia RM10 Credit",
                description="Use for GrabFood, GrabCar or GrabMart services",
                points_required=500,
                category="shopping",
                image_url="https://logos-world.net/wp-content/uploads/2020/11/Grab-Logo.png",
                terms_conditions="Valid for 60 days from redemption date."
            ),
            Voucher(
                id="shopping_shopee_15",
                title="Shopee Malaysia RM15 Voucher",
                description="Shop online with Malaysia's leading e-commerce platform",
                points_required=750,
                category="shopping",
                image_url="https://logos-world.net/wp-content/uploads/2020/11/Shopee-Logo.png",
                terms_conditions="Minimum spend RM30. Valid for 30 days."
            ),
            Voucher(
                id="shopping_lazada_12",
                title="Lazada Malaysia RM12 Voucher",
                description="Discover millions of products on Lazada Malaysia",
                points_required=600,
                category="shopping",
                image_url="https://logos-world.net/wp-content/uploads/2020/11/Lazada-Logo.png"
            ),
            
            # 教育类
            Voucher(
                id="education_coursera_month",
                title="Coursera Plus - 1 Month Free",
                description="Access thousands of courses from top universities and companies",
                points_required=800,
                category="education",
                image_url="https://logos-world.net/wp-content/uploads/2021/11/Coursera-Logo.png",
                terms_conditions="New subscribers only. Auto-renewal can be cancelled anytime."
            ),
            Voucher(
                id="education_udemy_discount",
                title="Udemy - 50% Discount Coupon",
                description="Learn new skills with 50% off any Udemy course",
                points_required=300,
                category="education",
                image_url="https://logos-world.net/wp-content/uploads/2021/11/Udemy-Logo.png"
            ),
            
            # 娱乐类
            Voucher(
                id="entertainment_tgv_ticket",
                title="TGV Cinemas - Movie Ticket",
                description="Enjoy the latest movies at TGV Cinemas nationwide",
                points_required=900,
                category="entertainment",
                image_url="https://www.tgv.com.my/images/tgv-logo.png",
                terms_conditions="Valid for regular 2D movies only. Surcharge applies for 3D/IMAX."
            ),
            Voucher(
                id="entertainment_spotify_premium",
                title="Spotify Premium - 1 Month",
                description="Enjoy ad-free music streaming with Spotify Premium",
                points_required=450,
                category="entertainment",
                image_url="https://logos-world.net/wp-content/uploads/2020/06/Spotify-Logo.png"
            )
        ]
        
        # 按类别筛选
        if category:
            vouchers = [v for v in vouchers if v.category == category]
            
        # 按积分要求排序
        vouchers.sort(key=lambda x: x.points_required)
        
        logger.info(f"Retrieved {len(vouchers)} available vouchers for category: {category or 'all'}")
        return vouchers
        
    except Exception as e:
        logger.error(f"Failed to get available vouchers: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve vouchers")

@router.post("/vouchers/{voucher_id}/redeem")
async def redeem_voucher(
    voucher_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user),
    request: Request = None
):
    """兑换券 - 集成blockchain.py的gasless系统"""
    try:
        user_id = user["sub"]
        
        if not BLOCKCHAIN_INTEGRATION:
            raise HTTPException(status_code=503, detail="Blockchain system not available")
        
        # 1. 获取券信息
        available_vouchers = await get_available_vouchers(user=user)
        voucher = next((v for v in available_vouchers if v.id == voucher_id), None)
        
        if not voucher:
            raise HTTPException(status_code=404, detail="Voucher not found")
        
        # 2. 检查用户积分是否足够
        user_points = await get_user_points(user)
        if user_points.available_points < voucher.points_required:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient points. Required: {voucher.points_required}, Available: {user_points.available_points}"
            )
        
        # 3. Convert points to WELL tokens first (if not already minted)
        # Then use blockchain.py's gasless redemption system
        redeem_result = None
        wallet_address = None

        try:
            from config import API_SECRET
            import hmac, hashlib
            from web3 import Web3

            # 获取用户的Smart Account地址
            session = blockchain_db()
            try:
                # user_id from JWT is already the profile UUID
                blockchain_user = session.query(Profile).filter(
                    Profile.id == user_id
                ).first()

                if not blockchain_user:
                    raise HTTPException(status_code=400, detail="User blockchain account not found")

                # Get user's smart account address
                smart_account = session.query(SmartAccountInfo).filter(
                    SmartAccountInfo.user_id == user_id
                ).first()

                if not smart_account or not smart_account.smart_account_address:
                    raise HTTPException(
                        status_code=400,
                        detail="No smart account found. Please create a wallet first."
                    )

                wallet_address = Web3.to_checksum_address(smart_account.smart_account_address)

                # STEP 1: Mint WELL tokens to user's wallet via TRUE Biconomy gasless (coins → tokens conversion)
                amount_in_tokens = voucher.points_required / 100  # 100 points = 1 WELL

                try:
                    # ✅ Use unified Biconomy gasless minting helper (ERC-4337)
                    mint_result = await mint_tokens_gasless(
                        user_id=user_id,
                        smart_account_address=wallet_address,
                        token_amount=amount_in_tokens,
                        request=request
                    )

                    logger.info(f"✅ Biconomy gasless mint for voucher redemption: {amount_in_tokens} WELL → {wallet_address}")
                    logger.info(f"   UserOp Hash: {mint_result.get('user_op_hash')}")
                    logger.info(f"   Tx Hash: {mint_result.get('tx_hash')}")

                    # Note: Biconomy handles transaction confirmation internally
                    # No need to wait for confirmation like old direct minting

                except Exception as mint_error:
                    logger.error(f"❌ Biconomy gasless mint failed for voucher redemption: {mint_error}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to convert points to WELL tokens: {str(mint_error)}"
                    )

                # STEP 2: Now redeem the voucher using the minted WELL tokens
                # Use ERC-4337 smart account batch execution for gasless redemption
                redeem_time = int(time.time())
                redeem_raw_message = f"{wallet_address}|{amount_in_tokens}|{voucher_id}|{redeem_time}"
                redeem_signature = hmac.new(
                    API_SECRET.encode(),
                    redeem_raw_message.encode(),
                    hashlib.sha256
                ).hexdigest()

                redeem_result = None
                redemption_method = "ERC-4337"

                # Execute ERC-4337 gasless redemption via smart account
                try:
                    from routers.blockchain import aa_wellness_redeem, WellnessRedeemBody

                    redeem_request = WellnessRedeemBody(
                        smart_account_address=wallet_address,
                        amount=amount_in_tokens,
                        reward_id=voucher_id,
                        ts=redeem_time,
                        sig=redeem_signature
                    )

                    # Execute ERC-4337 gasless redemption via smart account
                    redeem_result = await aa_wellness_redeem(redeem_request, request)

                    # ✅ CRITICAL: Verify the redemption was actually successful on blockchain
                    if not redeem_result or not isinstance(redeem_result, dict) or not redeem_result.get("success"):
                        error_msg = redeem_result.get("error") if isinstance(redeem_result, dict) else "Unknown error"
                        logger.error(f"❌ Blockchain redemption failed: {error_msg}")

                        # Redemption failed - don't proceed with point deduction or code generation
                        raise HTTPException(
                            status_code=500,
                            detail=f"Blockchain redemption failed: {error_msg}. Please contact support."
                        )

                    logger.info(f"✅ ERC-4337 gasless redemption successful for user {user_id}: {redeem_result}")

                except HTTPException:
                    # Re-raise HTTP exceptions (these already have proper error messages)
                    raise
                except Exception as redemption_error:
                    logger.error(f"❌ Redemption failed: {redemption_error}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Redemption system error: {str(redemption_error)}"
                    )

            finally:
                session.close()

        except Exception as blockchain_error:
            logger.error(f"Blockchain redemption failed: {blockchain_error}")
            raise HTTPException(status_code=500, detail=f"Redemption failed: {str(blockchain_error)}")

        # 4. 生成兑换码
        redemption_code = f"UNI-{voucher_id.upper()}-{secrets.token_hex(4).upper()}"

        # 5. 更新用户积分
        session = blockchain_db()
        try:
            # user_id from JWT is already the profile UUID
            user_points_record = session.query(BlockchainUserPoints).filter(
                BlockchainUserPoints.profile_id == user_id
            ).first()

            if user_points_record:
                user_points_record.total_points -= voucher.points_required
                user_points_record.last_updated = int(time.time())
                session.commit()

        except Exception as db_error:
            session.rollback()
            logger.error(f"Failed to update user points: {db_error}")
        finally:
            session.close()

        # 6. Log the redemption activity
        if ACTIVITY_LOGGING_ENABLED:
            try:
                log_voucher_redemption(
                    profile_id=user_id,
                    voucher_id=voucher_id,
                    voucher_title=voucher.title,
                    points_spent=voucher.points_required,
                    redemption_code=redemption_code,
                    transaction_hash=redeem_result.get("transaction_hash") if isinstance(redeem_result, dict) else None,
                    smart_account_address=wallet_address,
                    status="success"
                )
            except Exception as log_error:
                logger.warning(f"Failed to log redemption activity: {log_error}")
                # Don't fail the redemption if logging fails

        return {
            "success": True,
            "message": f"🎉 {voucher.title} redeemed successfully!",
            "redemption_code": redemption_code,
            "voucher": {
                "id": voucher.id,
                "title": voucher.title,
                "description": voucher.description,
                "category": voucher.category
            },
            "points_spent": voucher.points_required,
            "remaining_points": max(0, user_points.available_points - voucher.points_required),
            "blockchain_tx": redeem_result.get("transaction_hash") if isinstance(redeem_result, dict) else None,
            "method": redemption_method,  # Shows which method was used: ERC-4337 or Standard
            "user_op_hash": redeem_result.get("user_op_hash") if isinstance(redeem_result, dict) else None,
            "expires_at": datetime.now().timestamp() + (30 * 24 * 60 * 60)  # 30 days from now
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to redeem voucher: {e}")
        raise HTTPException(status_code=500, detail="Redemption failed")

@router.get("/vouchers/my-vouchers", response_model=List[UserVoucher])
async def get_my_vouchers(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """获取用户已兑换的券 - 从blockchain.py数据库获取"""
    try:
        user_id = user["sub"]
        
        if not BLOCKCHAIN_INTEGRATION:
            return []
        
        # 从blockchain.py数据库获取用户的voucher记录
        session = blockchain_db()
        try:
            # 获取用户的区块链记录
            # user_id from JWT is already the profile UUID
            blockchain_user = session.query(Profile).filter(
                Profile.id == user_id
            ).first()

            if not blockchain_user:
                return []
            
            # 获取用户的voucher记录
            vouchers = session.query(BlockchainVoucher).filter(
                BlockchainVoucher.address == blockchain_user.email
            ).all()
            
            # 获取可用券列表用于匹配
            available_vouchers = await get_available_vouchers(user=user)
            voucher_map = {v.id: v for v in available_vouchers}
            
            user_vouchers = []
            for v in vouchers:
                # 匹配voucher信息
                voucher_info = voucher_map.get(v.reward_id)
                if not voucher_info:
                    # 如果找不到匹配的券信息，创建基本信息
                    voucher_info = Voucher(
                        id=v.reward_id,
                        title=f"Voucher {v.reward_id}",
                        description="Redeemed voucher",
                        points_required=0,
                        category="other"
                    )
                
                # 确定状态
                status = "active"
                if v.status == "used":
                    status = "used"
                elif v.created_at < (time.time() - 30 * 24 * 60 * 60):  # 30天过期
                    status = "expired"
                
                user_voucher = UserVoucher(
                    id=v.code,
                    voucher=voucher_info,
                    redeemed_at=datetime.fromtimestamp(v.created_at),
                    status=status,
                    redemption_code=v.code
                )
                user_vouchers.append(user_voucher)
            
            # 按兑换时间降序排列
            user_vouchers.sort(key=lambda x: x.redeemed_at, reverse=True)
            
            logger.info(f"Retrieved {len(user_vouchers)} vouchers for user {user_id}")
            return user_vouchers
            
        finally:
            session.close()
        
    except Exception as e:
        logger.error(f"Failed to get user vouchers: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve your vouchers")

@router.post("/points/earn")
async def earn_points(
    source: str,  # task_completion, wellness_checkin, etc.
    amount: int,
    description: str,
    user: Dict[str, Any] = Depends(get_authenticated_user),
    request: Request = None
):
    """用户完成活动后获得积分 - 使用blockchain.py的gasless mint系统"""
    try:
        user_id = user["sub"]
        
        if not BLOCKCHAIN_INTEGRATION:
            raise HTTPException(status_code=503, detail="Blockchain system not available")
        
        # 1. 验证积分来源的合法性
        valid_sources = [
            "task_completion", "wellness_checkin", "emergency_contact_added",
            "profile_completion", "daily_login", "weekly_goal", "challenge_completion",
            # Daily actions
            "daily_action_login", "daily_action_add_task", "daily_action_add_reminder", "daily_action_set_mood_today",
            # Island actions (challenge milestones)
            "daily_action_complete_1_challenge", "daily_action_complete_3_challenges"
        ]

        if source not in valid_sources:
            raise HTTPException(status_code=400, detail="Invalid points source")
        
        # 2. 获取或创建用户的区块链记录
        session = blockchain_db()
        try:
            # user_id from JWT is already the profile UUID
            blockchain_user = session.query(Profile).filter(
                Profile.id == user_id
            ).first()

            if not blockchain_user:
                # 创建新的区块链用户记录
                blockchain_user = Profile(
                    id=user_id,
                    email=user.get("email", f"user_{user_id}@unimate.app"),
                    created_at=int(time.time()),
                    updated_at=int(time.time())
                )
                session.add(blockchain_user)
                session.commit()
                logger.info(f"Created blockchain user record for {user_id}")
            
            # 3. Get user's smart account address
            smart_account = session.query(SmartAccountInfo).filter(
                SmartAccountInfo.user_id == user_id
            ).first()

            if not smart_account or not smart_account.smart_account_address:
                logger.warning(f"No smart account found for user {user_id}, skipping blockchain mint")
                mint_result = None
            else:
                # 4. 使用TRUE Biconomy gasless mint系统 (ERC-4337)
                try:
                    # 转换积分为代币 (100 points = 1 WELL token)
                    token_amount = amount / 100.0

                    # ✅ Use unified Biconomy gasless minting helper
                    mint_result = await mint_tokens_gasless(
                        user_id=user_id,
                        smart_account_address=smart_account.smart_account_address,
                        token_amount=token_amount,
                        request=request
                    )

                    logger.info(f"✅ Biconomy gasless mint successful: {token_amount} WELL → {smart_account.smart_account_address}")

                except Exception as blockchain_error:
                    logger.error(f"❌ Biconomy gasless mint failed: {blockchain_error}")
                    # 不要因为区块链错误而失败，可以后续补发
                    mint_result = None
            
            # 4. 更新用户积分记录
            user_points = session.query(BlockchainUserPoints).filter(
                BlockchainUserPoints.profile_id == user_id
            ).first()

            # Use Malaysia timezone for daily reset logic
            today_str_malaysia = datetime.now(MALAYSIA_TZ).strftime("%Y-%m-%d")

            if user_points:
                # ✅ Check if we need to reset daily points (Malaysia timezone)
                if user_points.last_daily_reset != today_str_malaysia:
                    user_points.earned_today = 0
                    user_points.last_daily_reset = today_str_malaysia
                    logger.info(f"Reset earned_today for user {user_id} (new day in MYT: {today_str_malaysia})")

                user_points.total_points += amount
                user_points.earned_today += amount
                user_points.last_updated = int(time.time())
            else:
                # 创建新的积分记录 (Use Malaysia timezone)
                user_points = BlockchainUserPoints(
                    profile_id=blockchain_user.id,
                    total_points=amount,
                    earned_today=amount,
                    last_updated=int(time.time()),
                    last_daily_reset=today_str_malaysia
                )
                session.add(user_points)

            session.commit()

            # 5. Log the points earning activity
            if ACTIVITY_LOGGING_ENABLED:
                try:
                    log_points_earned(
                        profile_id=user_id,
                        points_earned=amount,
                        source=source,
                        description=description,
                        transaction_hash=mint_result.get("tx_hash") if isinstance(mint_result, dict) and mint_result else None,
                        smart_account_address=smart_account.smart_account_address if smart_account else None
                    )
                except Exception as log_error:
                    logger.warning(f"Failed to log points earning activity: {log_error}")
                    # Don't fail the points award if logging fails

            return {
                "success": True,
                "points_earned": amount,
                "source": source,
                "description": description,
                "new_total": user_points.total_points,
                "earned_today": user_points.earned_today,
                "blockchain_tx": mint_result.get("tx_hash") if isinstance(mint_result, dict) else None,
                "gasless": True
            }
            
        finally:
            session.close()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to earn points: {e}")
        raise HTTPException(status_code=500, detail="Failed to process points")


# === Points Exchange Endpoint ===

class PointsExchangeRequest(BaseModel):
    amount: int  # Points to exchange

@router.post("/points/exchange")
async def exchange_points_for_tokens(
    request_data: PointsExchangeRequest,
    user: Dict[str, Any] = Depends(get_authenticated_user),
    request: Request = None
):
    """
    Convert off-chain points → on-chain WELL tokens
    Exchange rate: 100 points = 1 WELL token
    Critical gap fix from Gemini consolidation plan
    """
    try:
        user_id = user["sub"]
        points_to_exchange = request_data.amount

        if not BLOCKCHAIN_INTEGRATION:
            raise HTTPException(status_code=503, detail="Blockchain system not available")

        if points_to_exchange <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than 0")

        if points_to_exchange < 100:
            raise HTTPException(status_code=400, detail="Minimum exchange is 100 points (1 WELL token)")

        session = blockchain_db()
        try:
            # 1. Get or create blockchain user
            # user_id from JWT is already the profile UUID
            blockchain_user = session.query(Profile).filter(
                Profile.id == user_id
            ).first()

            if not blockchain_user:
                raise HTTPException(status_code=404, detail="User not found in blockchain system")

            # 2. Check user has sufficient points
            user_points = session.query(BlockchainUserPoints).filter(
                BlockchainUserPoints.profile_id == user_id
            ).first()

            if not user_points or user_points.total_points < points_to_exchange:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient points. You have {user_points.total_points if user_points else 0}, need {points_to_exchange}"
                )

            # 3. Calculate WELL tokens (100 points = 1 WELL)
            well_tokens = points_to_exchange / 100.0

            # 4. Deduct points atomically
            user_points.total_points -= points_to_exchange
            user_points.last_updated = int(time.time())

            # 5. Mint WELL tokens to user's smart account via TRUE Biconomy gasless (ERC-4337)
            try:
                # Get user's smart account address
                smart_account = session.query(SmartAccountInfo).filter(
                    SmartAccountInfo.user_id == user_id
                ).first()

                if not smart_account or not smart_account.smart_account_address:
                    raise HTTPException(
                        status_code=400,
                        detail="No smart account found. Please create a wallet first."
                    )

                # ✅ Use unified Biconomy gasless minting helper (ERC-4337)
                mint_result = await mint_tokens_gasless(
                    user_id=user_id,
                    smart_account_address=smart_account.smart_account_address,
                    token_amount=well_tokens,
                    request=request
                )

                logger.info(f"✅ Biconomy gasless points exchange: {points_to_exchange} points → {well_tokens} WELL")
                logger.info(f"   UserOp Hash: {mint_result.get('user_op_hash')}")

            except Exception as blockchain_error:
                # Rollback points deduction if blockchain fails
                user_points.total_points += points_to_exchange
                logger.error(f"❌ Biconomy gasless mint failed, rolling back points: {blockchain_error}")
                raise HTTPException(status_code=500, detail="Token minting failed, points not deducted")

            session.commit()

            return {
                "success": True,
                "points_exchanged": points_to_exchange,
                "well_tokens_received": well_tokens,
                "remaining_points": user_points.total_points,
                "exchange_rate": "100 points = 1 WELL token",
                "blockchain_tx": mint_result.get("tx_hash") if isinstance(mint_result, dict) else None,
                "gasless": True
            }

        finally:
            session.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to exchange points: {e}")
        raise HTTPException(status_code=500, detail="Failed to process points exchange")

# === Reward Categories Endpoint ===

@router.get("/categories")
async def get_reward_categories():
    """获取奖励券分类"""
    return {
        "categories": [
            {
                "id": "food",
                "name": "Food & Beverages",
                "description": "Restaurant vouchers, coffee, and dining experiences",
                "icon": "🍽️",
                "color": "#FF6B6B"
            },
            {
                "id": "wellness",
                "name": "Health & Wellness", 
                "description": "Fitness, yoga, pharmacy, and health products",
                "icon": "💪",
                "color": "#4ECDC4"
            },
            {
                "id": "shopping",
                "name": "Shopping & Services",
                "description": "E-commerce, delivery services, and retail vouchers",
                "icon": "🛍️",
                "color": "#45B7D1"
            },
            {
                "id": "education",
                "name": "Education & Learning",
                "description": "Online courses, skill development, and learning platforms",
                "icon": "📚",
                "color": "#96CEB4"
            },
            {
                "id": "entertainment",
                "name": "Entertainment & Media",
                "description": "Movies, music streaming, and entertainment services",
                "icon": "🎬",
                "color": "#FFEAA7"
            }
        ]
    }

# === Frontend API Compatibility Endpoints ===

@router.get("", response_model=List[Voucher])
async def get_rewards_marketplace(category: Optional[str] = None):
    """Get rewards marketplace - Frontend getRewardMarket() compatibility"""
    # Redirect to available vouchers endpoint
    return await get_available_vouchers(category)

@router.post("/vouchers/redeem-by-id/{voucher_id}")
async def redeem_voucher_by_id(
    voucher_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Redeem voucher by ID - Frontend redeemVoucher() compatibility"""
    try:
        # Find the voucher from available vouchers
        available_vouchers = await get_available_vouchers()
        voucher = next((v for v in available_vouchers if v.id == voucher_id), None)

        if not voucher:
            raise HTTPException(status_code=404, detail="Voucher not found")

        # Create minimal redemption data (since we have voucher_id from URL)
        redemption_data = {"voucher_id": voucher_id}

        # Attempt redemption by creating user voucher record
        supabase_service = get_supabase_service()
        user_id = user["sub"]

        # Check user's current points
        user_points = await get_user_points(user)
        if user_points.available_points < voucher.points_required:
            raise HTTPException(status_code=400, detail="Insufficient points")

        # Record the redemption - Use existing redeem_voucher function
        from fastapi import Request
        request = Request({"type": "http", "method": "POST"})
        return await redeem_voucher(voucher_id, user, request)


    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to redeem voucher {voucher_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to redeem voucher")

# === Daily Earn Actions Tracking ===

class DailyEarnAction(BaseModel):
    """Daily earn action status"""
    id: str
    label: str
    points: int
    completed: bool

# Helper function to award points for daily actions
# NOTE: This runs as a background task, so it must manage its own database session
def award_daily_action_points(user_id: str, action_id: str):
    """
    Award points for completing a daily action (login, add_task, add_reminder, set_mood)
    This function runs as a FastAPI background task and manages its own DB session.
    Returns True if points were awarded, False if already completed today
    """
    # Create a new database session for this background task
    session = blockchain_db()

    try:
        # Define points for each action
        ACTION_POINTS = {
            "login": 5,
            "add_task": 5,
            "add_reminder": 10,
            "set_mood_today": 5,
            "complete_1_challenge": 5,      # Island action: Complete 1 daily challenge
            "complete_3_challenges": 10     # Island action: Complete 3 daily challenges
        }

        if action_id not in ACTION_POINTS:
            logger.warning(f"Unknown action_id: {action_id}")
            return False

        points_amount = ACTION_POINTS[action_id]
        today_str_malaysia = datetime.now(MALAYSIA_TZ).strftime("%Y-%m-%d")

        # Check if already completed today by checking activity logs
        if ACTIVITY_LOGGING_ENABLED:
            from scripts.add_activity_logging import get_user_activity_logs

            # Check if this action was already logged today
            logs = get_user_activity_logs(user_id, limit=100, activity_type="points_earned")
            for log in logs:
                if log.get("details", {}).get("source") == f"daily_action_{action_id}":
                    # Check if it's from today
                    log_date = log.get("created_at", "")[:10]  # Extract YYYY-MM-DD
                    if log_date == today_str_malaysia:
                        logger.info(f"Action {action_id} already completed today for user {user_id}")
                        return False

        # Award points using this session
        user_points = session.query(BlockchainUserPoints).filter(
            BlockchainUserPoints.profile_id == user_id
        ).first()

        if user_points:
            # Check daily reset
            if user_points.last_daily_reset != today_str_malaysia:
                user_points.earned_today = 0
                user_points.last_daily_reset = today_str_malaysia

            # ADD POINTS
            user_points.total_points += points_amount
            user_points.earned_today += points_amount
            user_points.last_updated = int(time.time())
        else:
            # Create new record
            user_points = BlockchainUserPoints(
                profile_id=user_id,
                total_points=points_amount,
                earned_today=points_amount,
                last_updated=int(time.time()),
                last_daily_reset=today_str_malaysia
            )
            session.add(user_points)

        session.commit()

        # Log the points earning activity
        if ACTIVITY_LOGGING_ENABLED:
            try:
                log_points_earned(
                    profile_id=user_id,
                    points_earned=points_amount,
                    source=f"daily_action_{action_id}",
                    description=f"Completed daily action: {action_id}",
                    transaction_hash=None,
                    smart_account_address=None
                )
            except Exception as log_error:
                logger.warning(f"Failed to log points earning activity: {log_error}")

        logger.info(f"✅ Awarded {points_amount} points for {action_id} to user {user_id}")
        return True

    except Exception as e:
        session.rollback()
        logger.error(f"❌ Failed to award points for {action_id} to user {user_id}: {e}", exc_info=True)
        return False

    finally:
        session.close()

@router.post("/daily-action/{action_id}/complete")
async def complete_daily_action(
    action_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user),
    request: Request = None
):
    """
    Mark a daily action as complete and award points
    Called by other services (login, tasks, profile, etc.)
    """
    try:
        user_id = user["sub"]

        # Award points for this action
        awarded = await award_daily_action_points(user_id, action_id, request)

        if awarded:
            return {
                "success": True,
                "message": f"Completed {action_id} and earned points!",
                "action_id": action_id
            }
        else:
            return {
                "success": False,
                "message": f"Action {action_id} already completed today",
                "action_id": action_id
            }

    except Exception as e:
        logger.error(f"Failed to complete daily action {action_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete daily action")

@router.get("/earn-actions/today")
async def get_today_earn_actions(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """Get today's earn actions completion status"""
    try:
        user_id = user["sub"]
        # ✅ Fix: Use Malaysia timezone
        today_malaysia = datetime.now(MALAYSIA_TZ).date()
        today_str = today_malaysia.strftime("%Y-%m-%d")
        today_start_myt = datetime.combine(today_malaysia, dt_time.min, tzinfo=MALAYSIA_TZ)
        today_start = today_start_myt.isoformat()

        if not BLOCKCHAIN_INTEGRATION:
            # Return default actions if blockchain not available
            return {
                "success": True,
                "date": today_str,
                "actions": [
                    DailyEarnAction(id="login", label="Login the app", points=5, completed=True)
                ],
                "total_completed": 1,
                "total_available": 1
            }

        # Use SQLAlchemy ORM (same as rest of rewards.py)
        from models import Task, Reminder, UserChallenge
        session = blockchain_db()

        try:
            # Check each earn action
            actions = []

            # 1. Login (always completed if they're making this request)
            actions.append(DailyEarnAction(
                id="login",
                label="Login the app",
                points=5,
                completed=True  # If they can call this API, they're logged in
            ))

            # 2. Add a task (check tasks table for today)
            task_count = session.query(Task).filter(
                Task.user_id == user_id,
                Task.created_at >= today_start
            ).count()

            actions.append(DailyEarnAction(
                id="add_task",
                label="Add a task",
                points=5,
                completed=task_count > 0
            ))

            # 3. Add a reminder (check reminders table for today)
            reminder_count = session.query(Reminder).filter(
                Reminder.user_id == user_id,
                Reminder.created_at >= today_start
            ).count()

            actions.append(DailyEarnAction(
                id="add_reminder",
                label="Add a reminder",
                points=10,
                completed=reminder_count > 0
            ))

            # 4. Complete a daily challenge (check user_challenges for today)
            challenge_count = session.query(UserChallenge).filter(
                UserChallenge.profile_id == user_id,
                UserChallenge.date == today_str,
                UserChallenge.status == "completed"
            ).count()

            actions.append(DailyEarnAction(
                id="complete_1_challenge",
                label="Complete a daily challenge",
                points=5,
                completed=challenge_count >= 1
            ))

            # 5. Complete 3 daily challenges
            actions.append(DailyEarnAction(
                id="complete_3_challenges",
                label="Complete 3 daily challenges",
                points=10,
                completed=challenge_count >= 3
            ))

            # 6. Set mood today (check profiles table for today's mood update)
            profile = session.query(Profile).filter(Profile.id == user_id).first()
            mood_set_today = False

            if profile and profile.updated_at:
                # Convert timestamp to date string for comparison
                if isinstance(profile.updated_at, int):
                    updated_date = datetime.fromtimestamp(profile.updated_at).strftime("%Y-%m-%d")
                else:
                    updated_date = profile.updated_at.strftime("%Y-%m-%d") if hasattr(profile.updated_at, 'strftime') else str(profile.updated_at)[:10]

                mood_set_today = updated_date == today_str and profile.current_mood is not None

            actions.append(DailyEarnAction(
                id="set_mood_today",
                label="Set the mood today",
                points=5,
                completed=mood_set_today
            ))

            logger.info(f"Retrieved earn actions for user {user_id}: {sum(1 for a in actions if a.completed)}/{len(actions)} completed")
            return {
                "success": True,
                "date": today_str,
                "actions": actions,
                "total_completed": sum(1 for a in actions if a.completed),
                "total_available": len(actions)
            }

        finally:
            session.close()

    except Exception as e:
        logger.error(f"Failed to get earn actions: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve earn actions")
