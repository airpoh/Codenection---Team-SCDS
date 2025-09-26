"""
User-friendly rewards and points system
Integrates with existing blockchain.py gasless infrastructure
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
from datetime import datetime
import time
import secrets

from routers.core_supabase import get_authenticated_user
from services.supabase_client import get_supabase_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rewards", tags=["rewards"])

# Import blockchain functions from existing blockchain.py
try:
    from routers.blockchain import (
        db as blockchain_db,
        verify_sig,
        API_SECRET,
        UserPoints as BlockchainUserPoints,
        User as BlockchainUser,
        Voucher as BlockchainVoucher
    )
    BLOCKCHAIN_INTEGRATION = True
except ImportError:
    logger.warning("Blockchain integration not available")
    BLOCKCHAIN_INTEGRATION = False

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
                from datetime import date
                today_str = date.today().isoformat()

                today_response = supabase_service.client.table("user_challenges").select("points_earned").eq("user_id", user_id).gte("completed_at", today_str).execute()

                earned_today = sum([challenge.get("points_earned", 0) for challenge in (today_response.data or [])])

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
            # 获取用户的区块链记录
            blockchain_user = session.query(BlockchainUser).filter(
                BlockchainUser.id == user_id
            ).first()
            
            if not blockchain_user:
                # 用户还没有区块链积分记录
                return UserPoints(
                    total_points=0,
                    available_points=0,
                    earned_today=0,
                    earned_this_week=0
                )
            
            # 获取用户积分记录
            user_points = session.query(BlockchainUserPoints).filter(
                BlockchainUserPoints.user_id == blockchain_user.id
            ).first()
            
            if user_points:
                # 计算本周积分 (简化实现)
                today = datetime.now().strftime("%Y-%m-%d")
                earned_this_week = user_points.earned_today * 7  # 简化计算
                
                return UserPoints(
                    total_points=user_points.total_points,
                    available_points=user_points.total_points,  # 假设所有积分都可用
                    earned_today=user_points.earned_today,
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
        
        # 3. 使用blockchain.py的gasless redemption系统
        try:
            # 调用blockchain.py的redeem endpoint逻辑
            import httpx
            from config import API_SECRET
            
            # 获取用户的Smart Account地址
            session = blockchain_db()
            blockchain_user = session.query(BlockchainUser).filter(
                BlockchainUser.id == user_id
            ).first()
            session.close()
            
            if not blockchain_user:
                raise HTTPException(status_code=400, detail="User blockchain account not found")
            
            # 准备gasless redemption请求
            current_time = int(time.time())
            amount_in_tokens = voucher.points_required / 100  # 转换积分为代币 (1 token = 100 points)
            
            # 创建HMAC签名 (与blockchain.py兼容)
            raw_message = f"{blockchain_user.email}|{amount_in_tokens}|{voucher_id}|{current_time}"
            import hmac, hashlib
            signature = hmac.new(
                API_SECRET.encode(), 
                raw_message.encode(), 
                hashlib.sha256
            ).hexdigest()
            
            # 调用内部blockchain.py的redeem函数
            from routers.blockchain import redeem, RedeemBody
            
            redeem_request = RedeemBody(
                from_addr=blockchain_user.email,  # 使用email作为标识
                amount=amount_in_tokens,
                rewardId=voucher_id,
                ts=current_time,
                sig=signature
            )
            
            # 执行gasless redemption
            redeem_result = redeem(redeem_request, request)
            
            logger.info(f"Gasless redemption successful for user {user_id}: {redeem_result}")
            
        except Exception as blockchain_error:
            logger.error(f"Blockchain redemption failed: {blockchain_error}")
            raise HTTPException(status_code=500, detail=f"Redemption failed: {str(blockchain_error)}")
        
        # 4. 生成兑换码
        redemption_code = f"UNI-{voucher_id.upper()}-{secrets.token_hex(4).upper()}"
        
        # 5. 更新用户积分
        session = blockchain_db()
        try:
            blockchain_user = session.query(BlockchainUser).filter(
                BlockchainUser.id == user_id
            ).first()
            
            if blockchain_user:
                user_points_record = session.query(BlockchainUserPoints).filter(
                    BlockchainUserPoints.user_id == blockchain_user.id
                ).first()
                
                if user_points_record:
                    user_points_record.total_points -= voucher.points_required
                    user_points_record.last_updated = current_time
                    session.commit()
                    
        except Exception as db_error:
            session.rollback()
            logger.error(f"Failed to update user points: {db_error}")
        finally:
            session.close()
        
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
            "blockchain_tx": redeem_result.get("redeem_tx") if isinstance(redeem_result, dict) else None,
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
            blockchain_user = session.query(BlockchainUser).filter(
                BlockchainUser.id == user_id
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
            "profile_completion", "daily_login", "weekly_goal", "challenge_completion"
        ]
        
        if source not in valid_sources:
            raise HTTPException(status_code=400, detail="Invalid points source")
        
        # 2. 获取或创建用户的区块链记录
        session = blockchain_db()
        try:
            blockchain_user = session.query(BlockchainUser).filter(
                BlockchainUser.id == user_id
            ).first()
            
            if not blockchain_user:
                # 创建新的区块链用户记录
                blockchain_user = BlockchainUser(
                    id=user_id,
                    email=user.get("email", f"user_{user_id}@unimate.app"),
                    created_at=int(time.time()),
                    updated_at=int(time.time())
                )
                session.add(blockchain_user)
                session.commit()
                logger.info(f"Created blockchain user record for {user_id}")
            
            # 3. 使用blockchain.py的gasless mint系统
            try:
                from routers.blockchain import mint_tokens, MintBody
                from config import API_SECRET
                import hmac, hashlib
                
                # 转换积分为代币 (1 token = 100 points)
                token_amount = amount / 100.0
                current_time = int(time.time())
                
                # 创建HMAC签名
                raw_message = f"{blockchain_user.email}|{token_amount}|{current_time}"
                signature = hmac.new(
                    API_SECRET.encode(),
                    raw_message.encode(),
                    hashlib.sha256
                ).hexdigest()
                
                # 创建mint请求
                mint_request = MintBody(
                    to=blockchain_user.email,  # 使用email作为标识
                    amount=token_amount,
                    ts=current_time,
                    sig=signature
                )
                
                # 执行gasless mint
                mint_result = mint_tokens(mint_request, request)
                logger.info(f"Gasless mint successful for user {user_id}: {mint_result}")
                
            except Exception as blockchain_error:
                logger.error(f"Failed to mint tokens: {blockchain_error}")
                # 不要因为区块链错误而失败，可以后续补发
                mint_result = None
            
            # 4. 更新用户积分记录
            user_points = session.query(BlockchainUserPoints).filter(
                BlockchainUserPoints.user_id == blockchain_user.id
            ).first()
            
            if user_points:
                user_points.total_points += amount
                user_points.earned_today += amount
                user_points.last_updated = int(time.time())
            else:
                # 创建新的积分记录
                today = datetime.now().strftime("%Y-%m-%d")
                user_points = BlockchainUserPoints(
                    user_id=blockchain_user.id,
                    total_points=amount,
                    earned_today=amount,
                    last_updated=int(time.time()),
                    last_daily_reset=today
                )
                session.add(user_points)
            
            session.commit()
            
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
