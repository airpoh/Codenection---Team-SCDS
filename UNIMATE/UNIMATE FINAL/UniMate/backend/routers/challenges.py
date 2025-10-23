"""
Daily Challenge System - 集成blockchain.py的积分系统
与前端ChallengeGymScreen和ChallengeRunScreen完全兼容
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
from datetime import datetime
import time
from sqlalchemy.exc import IntegrityError

from routers.core_supabase import get_authenticated_user
from services.supabase_client import supabase_service
from services.redis_service import get_redis_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/challenges", tags=["challenges"])

# Import from unified models.py (SQLAlchemy - 10-20x faster than REST API)
try:
    from models import (
        db as blockchain_db,
        Challenge as BlockchainChallenge,
        UserChallenge as BlockchainUserChallenge,
        Profile as BlockchainUser  # Using Profile model for user data
    )
    from routers.blockchain import get_current_timestamp, get_today_date
    BLOCKCHAIN_INTEGRATION = True
    logger.info("✅ Blockchain integration enabled for challenges")
except ImportError as e:
    logger.warning(f"Blockchain integration not available for challenges: {e}")
    BLOCKCHAIN_INTEGRATION = False

# === Models ===

class ChallengeInfo(BaseModel):
    """前端兼容的Challenge信息"""
    id: str
    title: str
    subtitle: str
    duration_minutes: int
    points_reward: int
    character_src: Optional[str] = None
    background_src: Optional[str] = None
    is_active: bool = True

class UserChallengeStatus(BaseModel):
    """用户挑战状态"""
    challenge_id: str
    status: str  # not_started, in_progress, completed, failed
    started_at: Optional[int] = None
    completed_at: Optional[int] = None
    points_earned: int = 0

class DailyChallengeResponse(BaseModel):
    """今日挑战总览"""
    date: str
    challenges: List[ChallengeInfo]
    user_progress: List[UserChallengeStatus]
    completed_today: int
    total_challenges: int
    progress_percentage: int

class StartChallengeRequest(BaseModel):
    challenge_id: str

class CompleteChallengeRequest(BaseModel):
    challenge_id: str
    duration_sec: int  # 实际完成时间

# === 默认的5个Daily Challenges ===
DEFAULT_CHALLENGES = [
    {
        "id": "breathing_exercise",
        "title": "Breathing Exercise",
        "subtitle": "30 seconds of mindful breathing",
        "duration_minutes": 1,  # 30秒向上取整
        "points_reward": 100,
        "character_src": "breathing_character.png",
        "background_src": "breathing_bg.png"
    },
    {
        "id": "study_session",
        "title": "Study Session", 
        "subtitle": "Focus on studying for 30 minutes",
        "duration_minutes": 30,
        "points_reward": 300,
        "character_src": "study_character.png",
        "background_src": "study_bg.png"
    },
    {
        "id": "stay_hydrated",
        "title": "Stay Hydrated",
        "subtitle": "Drink water regularly for 8 hours",
        "duration_minutes": 480,  # 8小时
        "points_reward": 200,
        "character_src": "water_character.png", 
        "background_src": "water_bg.png"
    },
    {
        "id": "rest_break",
        "title": "Rest Break",
        "subtitle": "Take a mindful rest for 30 minutes",
        "duration_minutes": 30,
        "points_reward": 150,
        "character_src": "rest_character.png",
        "background_src": "rest_bg.png"
    },
    {
        "id": "quality_sleep",
        "title": "Quality Sleep",
        "subtitle": "Get 8 hours of quality sleep",
        "duration_minutes": 480,  # 8小时
        "points_reward": 250,
        "character_src": "sleep_character.png",
        "background_src": "sleep_bg.png"
    }
]

# === Helper Functions ===

def get_today_key() -> str:
    """获取今天的日期键 (YYYY-MM-DD)"""
    return datetime.now().strftime("%Y-%m-%d")

async def init_default_challenges():
    """初始化默认挑战到数据库"""
    if not BLOCKCHAIN_INTEGRATION:
        return
        
    session = blockchain_db()
    try:
        # 检查是否已经有挑战
        existing_count = session.query(BlockchainChallenge).count()
        if existing_count > 0:
            return
            
        # 创建默认挑战
        for challenge_data in DEFAULT_CHALLENGES:
            challenge = BlockchainChallenge(
                name=challenge_data["title"],
                description=challenge_data["subtitle"],
                duration_minutes=challenge_data["duration_minutes"],
                points_reward=challenge_data["points_reward"],
                is_active=True,
                created_at=int(time.time())
            )
            session.add(challenge)
            
        session.commit()
        logger.info("Default challenges initialized successfully")
        
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to initialize default challenges: {e}")
    finally:
        session.close()

# 在模块加载时初始化挑战 - 延迟到第一次API调用时执行
# 避免在模块导入时创建异步任务

# === API Endpoints ===

@router.get("/daily", response_model=DailyChallengeResponse)
async def get_daily_challenges(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """获取今日挑战 - 与前端ChallengeGymScreen兼容"""
    try:
        today = get_today_key()
        user_id = user["sub"]
        
        if not BLOCKCHAIN_INTEGRATION:
            # 返回默认挑战（无数据库集成）
            challenges = [ChallengeInfo(**c) for c in DEFAULT_CHALLENGES]
            return DailyChallengeResponse(
                date=today,
                challenges=challenges,
                user_progress=[],
                completed_today=0,
                total_challenges=len(challenges),
                progress_percentage=0
            )
        
        session = blockchain_db()
        try:
            # 获取所有活跃挑战
            db_challenges = session.query(BlockchainChallenge).filter(
                BlockchainChallenge.is_active == True
            ).all()
            
            if not db_challenges:
                # 如果数据库中没有挑战，初始化默认挑战
                session.close()  # 关闭当前session
                await init_default_challenges()
                session = blockchain_db()  # 重新打开session
                db_challenges = session.query(BlockchainChallenge).filter(
                    BlockchainChallenge.is_active == True
                ).all()
            
            # 转换为前端格式
            challenges = []
            for db_challenge in db_challenges:
                # 匹配默认挑战以获取额外信息
                default_info = next(
                    (c for c in DEFAULT_CHALLENGES if c["title"] == db_challenge.name),
                    {}
                )
                
                challenge_info = ChallengeInfo(
                    id=str(db_challenge.id),
                    title=db_challenge.name,
                    subtitle=db_challenge.description,
                    duration_minutes=db_challenge.duration_minutes,
                    points_reward=db_challenge.points_reward,
                    character_src=default_info.get("character_src"),
                    background_src=default_info.get("background_src"),
                    is_active=db_challenge.is_active
                )
                challenges.append(challenge_info)
            
            # 获取用户今日进度
            # 首先确保用户存在于blockchain系统中
            blockchain_user = session.query(BlockchainUser).filter(
                BlockchainUser.id == user_id
            ).first()
            
            user_progress = []
            completed_today = 0
            
            if blockchain_user:
                # 获取用户今日挑战记录
                today_challenges = session.query(BlockchainUserChallenge).filter(
                    BlockchainUserChallenge.profile_id == blockchain_user.id,
                    BlockchainUserChallenge.date == today
                ).all()
                
                # 创建挑战ID到用户记录的映射
                user_challenge_map = {
                    str(uc.challenge_id): uc for uc in today_challenges
                }
                
                for challenge in challenges:
                    user_challenge = user_challenge_map.get(challenge.id)
                    
                    if user_challenge:
                        status_info = UserChallengeStatus(
                            challenge_id=challenge.id,
                            status=user_challenge.status,
                            started_at=user_challenge.started_at,
                            completed_at=user_challenge.completed_at,
                            points_earned=challenge.points_reward if user_challenge.status == "completed" else 0
                        )
                        
                        if user_challenge.status == "completed":
                            completed_today += 1
                    else:
                        status_info = UserChallengeStatus(
                            challenge_id=challenge.id,
                            status="not_started"
                        )
                    
                    user_progress.append(status_info)
            else:
                # 用户还没有blockchain记录，所有挑战都是not_started
                for challenge in challenges:
                    user_progress.append(UserChallengeStatus(
                        challenge_id=challenge.id,
                        status="not_started"
                    ))
            
            total_challenges = len(challenges)
            progress_percentage = int((completed_today / total_challenges * 100)) if total_challenges > 0 else 0
            
            return DailyChallengeResponse(
                date=today,
                challenges=challenges,
                user_progress=user_progress,
                completed_today=completed_today,
                total_challenges=total_challenges,
                progress_percentage=progress_percentage
            )
            
        finally:
            session.close()
            
    except Exception as e:
        logger.error(f"Failed to get daily challenges: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve daily challenges")

@router.post("/start")
async def start_challenge(
    request: StartChallengeRequest,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """开始挑战 - 与前端ChallengeRunScreen兼容"""
    try:
        user_id = user["sub"]
        today = get_today_key()
        current_time = int(time.time())

        if not BLOCKCHAIN_INTEGRATION:
            # Fallback: Return mock data if blockchain not available
            challenge_info = next(
                (c for c in DEFAULT_CHALLENGES if c["id"] == request.challenge_id),
                None
            )

            if not challenge_info:
                raise HTTPException(status_code=404, detail="Challenge not found")

            return {
                "success": True,
                "challenge": challenge_info,
                "started_at": current_time
            }

        session = blockchain_db()
        try:
            # 验证挑战是否存在
            # Handle both string IDs (c1, c2, c3) and integer IDs
            try:
                challenge_db_id = int(request.challenge_id)
            except ValueError:
                # Frontend sends "c1", "c2", etc. - extract number
                if request.challenge_id.startswith('c'):
                    challenge_db_id = int(request.challenge_id[1:])
                else:
                    raise HTTPException(status_code=400, detail="Invalid challenge ID format")

            challenge = session.query(BlockchainChallenge).filter(
                BlockchainChallenge.id == challenge_db_id,
                BlockchainChallenge.is_active == True
            ).first()
            
            if not challenge:
                raise HTTPException(status_code=404, detail="Challenge not found")
            
            # 获取或创建blockchain用户
            blockchain_user = session.query(BlockchainUser).filter(
                BlockchainUser.id == user_id
            ).first()
            
            if not blockchain_user:
                blockchain_user = BlockchainUser(
                    id=user_id,
                    email=user.get("email", f"user_{user_id}@unimate.app"),
                    created_at=current_time,
                    updated_at=current_time
                )
                session.add(blockchain_user)
                session.flush()  # 获取ID
            
            # 检查今日是否已经有这个挑战的记录
            existing_challenge = session.query(BlockchainUserChallenge).filter(
                BlockchainUserChallenge.profile_id == blockchain_user.id,
                BlockchainUserChallenge.challenge_id == challenge.id,
                BlockchainUserChallenge.date == today
            ).first()
            
            if existing_challenge:
                if existing_challenge.status == "completed":
                    raise HTTPException(status_code=400, detail="Challenge already completed today")
                elif existing_challenge.status == "in_progress":
                    raise HTTPException(status_code=400, detail="Challenge already in progress")
                else:
                    # 重新开始
                    existing_challenge.status = "in_progress"
                    existing_challenge.started_at = current_time
            else:
                # 创建新记录
                user_challenge = BlockchainUserChallenge(
                    profile_id=blockchain_user.id,
                    challenge_id=challenge.id,
                    date=today,
                    status="in_progress",
                    started_at=current_time
                )
                session.add(user_challenge)

            try:
                session.commit()
            except IntegrityError as e:
                session.rollback()
                # Handle race condition where another request created the same record
                logger.warning(f"Integrity error starting challenge (likely duplicate): {e}")
                raise HTTPException(status_code=400, detail="Challenge already started or completed today")
            
            # Return full challenge object as expected by frontend
            challenge_info = ChallengeInfo(
                id=str(challenge.id),
                title=challenge.name,
                subtitle=challenge.description,
                duration_minutes=challenge.duration_minutes,
                points_reward=challenge.points_reward,
                is_active=challenge.is_active
            )

            return {
                "success": True,
                "challenge": challenge_info.dict(),
                "started_at": current_time
            }
            
        finally:
            session.close()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start challenge: {e}")
        raise HTTPException(status_code=500, detail="Failed to start challenge")

@router.post("/complete")
async def complete_challenge(
    request: CompleteChallengeRequest,
    user: Dict[str, Any] = Depends(get_authenticated_user),
    http_request: Request = None
):
    """完成挑战并获得积分 - 集成blockchain.py的gasless mint系统"""
    try:
        user_id = user["sub"]
        today = get_today_key()
        current_time = int(time.time())

        if not BLOCKCHAIN_INTEGRATION:
            # Fallback: Return mock data if blockchain not available
            challenge_info = next(
                (c for c in DEFAULT_CHALLENGES if c["id"] == request.challenge_id),
                None
            )

            if not challenge_info:
                raise HTTPException(status_code=404, detail="Challenge not found")

            return {
                "success": True,
                "challenge": challenge_info,
                "points_earned": challenge_info["points_reward"],
                "completed_at": current_time,
                "total_points": challenge_info["points_reward"]
            }

        # ✅ CRITICAL FIX: Acquire distributed lock to prevent race conditions
        # Lock key format: complete_challenge:{user_id}:{challenge_id}
        redis_client = get_redis_client()
        lock_key = f"complete_challenge:{user_id}:{request.challenge_id}"

        # Try to acquire lock with 15 second TTL (enough time for blockchain tx)
        lock_acquired = redis_client.acquire_lock(lock_key, ttl=15)

        if not lock_acquired:
            # Another request is already processing this challenge completion
            logger.warning(f"⏳ Duplicate claim attempt blocked for user {user_id}, challenge {request.challenge_id}")
            raise HTTPException(
                status_code=409,
                detail="Challenge completion already in progress. Please wait."
            )

        session = blockchain_db()
        try:
            # Handle challenge ID conversion (c1 -> 1)
            try:
                challenge_db_id = int(request.challenge_id)
            except ValueError:
                if request.challenge_id.startswith('c'):
                    challenge_db_id = int(request.challenge_id[1:])
                else:
                    raise HTTPException(status_code=400, detail="Invalid challenge ID format")

            # 获取用户挑战记录
            blockchain_user = session.query(BlockchainUser).filter(
                BlockchainUser.id == user_id
            ).first()

            if not blockchain_user:
                raise HTTPException(status_code=404, detail="User not found")

            user_challenge = session.query(BlockchainUserChallenge).filter(
                BlockchainUserChallenge.profile_id == blockchain_user.id,
                BlockchainUserChallenge.challenge_id == challenge_db_id,
                BlockchainUserChallenge.date == today
            ).first()
            
            if not user_challenge:
                raise HTTPException(status_code=404, detail="Challenge not started today")
            
            if user_challenge.status == "completed":
                raise HTTPException(status_code=400, detail="Challenge already completed")
            
            if user_challenge.status != "in_progress":
                raise HTTPException(status_code=400, detail="Challenge must be started first")
            
            # 获取挑战信息
            challenge = session.query(BlockchainChallenge).filter(
                BlockchainChallenge.id == challenge_db_id
            ).first()
            
            if not challenge:
                raise HTTPException(status_code=404, detail="Challenge not found")
            
            # 验证时长（可选 - 前端已经处理了计时）
            if user_challenge.started_at:
                elapsed_seconds = current_time - user_challenge.started_at
                required_seconds = challenge.duration_minutes * 60
                
                # 允许一定的时间容差
                if elapsed_seconds < (required_seconds * 0.8):  # 80%的时间即可
                    logger.warning(f"Challenge {request.challenge_id} completed too quickly: {elapsed_seconds}s < {required_seconds}s")
            
            # 标记为完成
            user_challenge.status = "completed"
            user_challenge.completed_at = current_time

            # ✅ CRITICAL: Flush to make the status change visible to subsequent queries
            session.flush()

            # 使用rewards.py的积分系统来获得积分
            try:
                from routers.rewards import earn_points, award_daily_action_points

                # 调用积分系统（这会自动处理blockchain mint）
                points_result = await earn_points(
                    source="challenge_completion",
                    amount=challenge.points_reward,
                    description=f"Completed challenge: {challenge.name}",
                    user=user,
                    request=http_request
                )

                # ✅ ISLAND ACTION BONUS: Check and award island action bonuses (once per day)
                # Count challenges completed today AFTER this completion
                challenges_completed_today = session.query(BlockchainUserChallenge).filter(
                    BlockchainUserChallenge.profile_id == blockchain_user.id,
                    BlockchainUserChallenge.date == today,
                    BlockchainUserChallenge.status == "completed"
                ).count()

                island_action_bonus = 0

                # Award "Complete 1 daily challenge" bonus (5 points) - only on first challenge
                if challenges_completed_today == 1:
                    awarded = award_daily_action_points(user_id, "complete_1_challenge")
                    if awarded:
                        island_action_bonus += 5
                        logger.info(f"🏝️ Island action awarded: Complete 1 challenge +5 points")

                # Award "Complete 3 daily challenges" bonus (10 points) - only when reaching 3
                if challenges_completed_today == 3:
                    awarded = award_daily_action_points(user_id, "complete_3_challenges")
                    if awarded:
                        island_action_bonus += 10
                        logger.info(f"🏝️ Island action awarded: Complete 3 challenges +10 points")

                session.commit()

                # Return full challenge object as expected by frontend
                challenge_info = ChallengeInfo(
                    id=str(challenge.id),
                    title=challenge.name,
                    subtitle=challenge.description,
                    duration_minutes=challenge.duration_minutes,
                    points_reward=challenge.points_reward,
                    is_active=challenge.is_active
                )

                return {
                    "success": True,
                    "challenge": challenge_info.dict(),
                    "points_earned": challenge.points_reward,
                    "completed_at": current_time,
                    "total_points": points_result.get("new_total", 0),
                    "blockchain_tx": points_result.get("blockchain_tx")
                }
                
            except Exception as points_error:
                # 即使积分系统失败，仍然标记挑战为完成
                logger.error(f"Failed to award points for challenge completion: {points_error}")
                session.commit()

                # Return full challenge object even if points fail
                challenge_info = ChallengeInfo(
                    id=str(challenge.id),
                    title=challenge.name,
                    subtitle=challenge.description,
                    duration_minutes=challenge.duration_minutes,
                    points_reward=challenge.points_reward,
                    is_active=challenge.is_active
                )

                return {
                    "success": True,
                    "challenge": challenge_info.dict(),
                    "points_earned": challenge.points_reward,
                    "completed_at": current_time,
                    "note": "Points will be awarded later"
                }
            
        finally:
            session.close()
            # ✅ Always release the lock when done (success or failure)
            if lock_acquired:
                redis_client.release_lock(lock_key)
                logger.debug(f"🔓 Released lock for challenge completion: {lock_key}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to complete challenge: {e}")
        # ✅ Release lock on error too
        if 'lock_acquired' in locals() and lock_acquired:
            redis_client.release_lock(lock_key)
        raise HTTPException(status_code=500, detail="Failed to complete challenge")

@router.get("/progress")
async def get_challenge_progress(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """获取用户挑战进度统计"""
    try:
        user_id = user["sub"]
        today = get_today_key()
        
        if not BLOCKCHAIN_INTEGRATION:
            return {
                "today": {"completed": 0, "total": 5, "percentage": 0},
                "all_time": {"completed": 0, "total": 5}
            }
        
        session = blockchain_db()
        try:
            blockchain_user = session.query(BlockchainUser).filter(
                BlockchainUser.id == user_id
            ).first()
            
            if not blockchain_user:
                return {
                    "today": {"completed": 0, "total": 5, "percentage": 0},
                    "all_time": {"completed": 0, "total": 5}
                }
            
            # 今日完成数
            today_completed = session.query(BlockchainUserChallenge).filter(
                BlockchainUserChallenge.profile_id == blockchain_user.id,
                BlockchainUserChallenge.date == today,
                BlockchainUserChallenge.status == "completed"
            ).count()
            
            # 总挑战数
            total_challenges = session.query(BlockchainChallenge).filter(
                BlockchainChallenge.is_active == True
            ).count()
            
            # 历史总完成数
            all_time_completed = session.query(BlockchainUserChallenge).filter(
                BlockchainUserChallenge.profile_id == blockchain_user.id,
                BlockchainUserChallenge.status == "completed"
            ).count()
            
            today_percentage = int((today_completed / total_challenges * 100)) if total_challenges > 0 else 0
            
            return {
                "today": {
                    "completed": today_completed,
                    "total": total_challenges,
                    "percentage": today_percentage
                },
                "all_time": {
                    "completed": all_time_completed,
                    "total": total_challenges
                }
            }
            
        finally:
            session.close()

    except Exception as e:
        logger.error(f"Failed to get challenge progress: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve progress")

# === Frontend API Compatibility Endpoints ===

@router.get("", response_model=DailyChallengeResponse)
async def get_challenges(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """Get challenges - Frontend getChallenges() compatibility (redirects to daily challenges)"""
    # Redirect to daily challenges endpoint
    return await get_daily_challenges(user)
