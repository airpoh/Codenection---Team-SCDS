"""
Calendar and Reminder System - 与前端CalendarScreen完全兼容
集成Supabase数据库的tasks表
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
from datetime import datetime, timezone
import time

from routers.core_supabase import get_authenticated_user
from services.supabase_client import get_supabase_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/calendar", tags=["calendar"])

# === Models ===

class TaskItem(BaseModel):
    """任务项 - 与前端TaskItem兼容"""
    id: str
    title: str
    start: datetime
    end: Optional[datetime] = None
    colors: Optional[List[str]] = None
    category: Optional[str] = "other"
    notes: Optional[str] = None
    priority: Optional[str] = "medium"
    is_completed: bool = False

class ReminderItem(BaseModel):
    """提醒项 - 与前端Reminder兼容"""
    id: str
    title: str
    at: datetime  # 提醒时间
    colors: Optional[List[str]] = None
    notes: Optional[str] = None

class CreateTaskRequest(BaseModel):
    """创建任务请求"""
    title: str
    start: datetime
    end: Optional[datetime] = None
    category: str = "other"
    notes: Optional[str] = None
    priority: str = "medium"
    remind_minutes_before: int = 30

class CreateReminderRequest(BaseModel):
    """创建提醒请求"""
    title: str
    at: datetime  # 提醒时间
    notes: Optional[str] = None

class CalendarDayResponse(BaseModel):
    """日历日期响应 - 与前端兼容"""
    date: str  # YYYY-MM-DD
    tasks: List[TaskItem]
    reminders: List[ReminderItem]

class CalendarOverviewResponse(BaseModel):
    """日历总览响应"""
    current_month: int
    tasks_by_date: Dict[str, List[TaskItem]]  # date -> tasks
    reminders_by_date: Dict[str, List[ReminderItem]]  # date -> reminders

# === 默认颜色调色板 - 与前端保持一致 ===
TASK_PALETTES = [
    ["#DCD2F4", "#D1E1FF"],
    ["#F5E1B6", "#FFE0B2"],
    ["#CDEDF6", "#E1F5FE"],
    ["#E0F2F1", "#D6F5E5"],
    ["#FFD6E8", "#FEE0F1"],
    ["#FCE5D2", "#FFE9C7"],
    ["#E8F0FE", "#DDE7FF"],
]

REMINDER_PALETTES = [
    ["#EDE7F6", "#FFF3E0"],
    ["#E0F2F1", "#E3F2FD"],
    ["#FFF0F3", "#FDEBD0"],
]

# === Helper Functions ===

def get_color_palette(index: int, is_reminder: bool = False) -> List[str]:
    """获取颜色调色板"""
    palettes = REMINDER_PALETTES if is_reminder else TASK_PALETTES
    return palettes[index % len(palettes)]

def format_date_key(dt: datetime) -> str:
    """格式化日期键"""
    return dt.strftime("%Y-%m-%d")

# === API Endpoints ===

@router.get("/today", response_model=CalendarDayResponse)
async def get_today_schedule(
    timezone_str: str = "Asia/Kuala_Lumpur",
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """获取今日日程 - 与前端Today视图兼容"""
    try:
        user_id = user["sub"]
        today = datetime.now().strftime("%Y-%m-%d")
        
        supabase_service = get_supabase_service()
        
        # 获取今日任务
        tasks_data = await supabase_service.get_user_tasks(
            user_id=user_id,
            access_token=user.get("token", ""),
            date_filter=today
        )
        
        # 转换为前端格式
        tasks = []
        for i, task_data in enumerate(tasks_data):
            task = TaskItem(
                id=str(task_data.get("id", f"task_{i}")),
                title=task_data.get("title", "Untitled Task"),
                start=datetime.fromisoformat(task_data.get("starts_at", datetime.now().isoformat())),
                end=datetime.fromisoformat(task_data.get("ends_at")) if task_data.get("ends_at") else None,
                colors=get_color_palette(i, False),
                category=task_data.get("category", "other"),
                notes=task_data.get("notes"),
                priority=task_data.get("priority", "medium"),
                is_completed=task_data.get("is_completed", False)
            )
            tasks.append(task)
        
        # 获取今日提醒（从任务中筛选kind='reminder'的项目）
        reminder_tasks = await supabase_service.get_user_tasks(
            user_id=user_id,
            access_token=user.get("token", ""),
            date_filter=today,
            kind_filter="reminder"
        )
        
        reminders = []
        for i, reminder_data in enumerate(reminder_tasks):
            reminder = ReminderItem(
                id=str(reminder_data.get("id", f"reminder_{i}")),
                title=reminder_data.get("title", "Untitled Reminder"),
                at=datetime.fromisoformat(reminder_data.get("starts_at", datetime.now().isoformat())),
                colors=get_color_palette(i, True),
                notes=reminder_data.get("notes")
            )
            reminders.append(reminder)
        
        return CalendarDayResponse(
            date=today,
            tasks=tasks,
            reminders=reminders
        )
        
    except Exception as e:
        logger.error(f"Failed to get today schedule: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve today's schedule")

@router.get("/day/{date}", response_model=CalendarDayResponse)
async def get_day_schedule(
    date: str,  # YYYY-MM-DD format
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """获取指定日期的日程"""
    try:
        user_id = user["sub"]
        
        # 验证日期格式
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        supabase_service = get_supabase_service()
        
        # 获取指定日期的任务
        tasks_data = await supabase_service.get_user_tasks(
            user_id=user_id,
            access_token=user.get("token", ""),
            date_filter=date
        )
        
        tasks = []
        for i, task_data in enumerate(tasks_data):
            task = TaskItem(
                id=str(task_data.get("id", f"task_{i}")),
                title=task_data.get("title", "Untitled Task"),
                start=datetime.fromisoformat(task_data.get("starts_at", datetime.now().isoformat())),
                end=datetime.fromisoformat(task_data.get("ends_at")) if task_data.get("ends_at") else None,
                colors=get_color_palette(i, False),
                category=task_data.get("category", "other"),
                notes=task_data.get("notes"),
                priority=task_data.get("priority", "medium"),
                is_completed=task_data.get("is_completed", False)
            )
            tasks.append(task)
        
        # 获取指定日期的提醒
        reminder_tasks = await supabase_service.get_user_tasks(
            user_id=user_id,
            access_token=user.get("token", ""),
            date_filter=date,
            kind_filter="reminder"
        )
        
        reminders = []
        for i, reminder_data in enumerate(reminder_tasks):
            reminder = ReminderItem(
                id=str(reminder_data.get("id", f"reminder_{i}")),
                title=reminder_data.get("title", "Untitled Reminder"),
                at=datetime.fromisoformat(reminder_data.get("starts_at", datetime.now().isoformat())),
                colors=get_color_palette(i, True),
                notes=reminder_data.get("notes")
            )
            reminders.append(reminder)
        
        return CalendarDayResponse(
            date=date,
            tasks=tasks,
            reminders=reminders
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get day schedule for {date}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve schedule")

@router.get("/overview", response_model=CalendarOverviewResponse)
async def get_calendar_overview(
    month: Optional[int] = None,  # 1-12, 默认当前月
    year: Optional[int] = None,   # 默认当前年
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """获取日历月视图总览 - 与前端CalendarOverview兼容"""
    try:
        user_id = user["sub"]
        
        # 默认为当前月年
        now = datetime.now()
        target_month = month or now.month
        target_year = year or now.year
        
        # 获取整个月的数据
        month_start = datetime(target_year, target_month, 1)
        if target_month == 12:
            month_end = datetime(target_year + 1, 1, 1)
        else:
            month_end = datetime(target_year, target_month + 1, 1)
        
        supabase_service = get_supabase_service()
        
        # 获取月份内的所有任务
        tasks_data = await supabase_service.get_user_tasks(
            user_id=user_id,
            access_token=user.get("token", ""),
            start_date=month_start.strftime("%Y-%m-%d"),
            end_date=month_end.strftime("%Y-%m-%d")
        )
        
        # 按日期分组任务
        tasks_by_date = {}
        for i, task_data in enumerate(tasks_data):
            task_start = datetime.fromisoformat(task_data.get("starts_at", datetime.now().isoformat()))
            date_key = format_date_key(task_start)
            
            task = TaskItem(
                id=str(task_data.get("id", f"task_{i}")),
                title=task_data.get("title", "Untitled Task"),
                start=task_start,
                end=datetime.fromisoformat(task_data.get("ends_at")) if task_data.get("ends_at") else None,
                colors=get_color_palette(i, False),
                category=task_data.get("category", "other"),
                notes=task_data.get("notes"),
                priority=task_data.get("priority", "medium"),
                is_completed=task_data.get("is_completed", False)
            )
            
            if date_key not in tasks_by_date:
                tasks_by_date[date_key] = []
            tasks_by_date[date_key].append(task)
        
        # 获取月份内的所有提醒
        reminder_tasks = await supabase_service.get_user_tasks(
            user_id=user_id,
            access_token=user.get("token", ""),
            start_date=month_start.strftime("%Y-%m-%d"),
            end_date=month_end.strftime("%Y-%m-%d"),
            kind_filter="reminder"
        )
        
        # 按日期分组提醒
        reminders_by_date = {}
        for i, reminder_data in enumerate(reminder_tasks):
            reminder_start = datetime.fromisoformat(reminder_data.get("starts_at", datetime.now().isoformat()))
            date_key = format_date_key(reminder_start)
            
            reminder = ReminderItem(
                id=str(reminder_data.get("id", f"reminder_{i}")),
                title=reminder_data.get("title", "Untitled Reminder"),
                at=reminder_start,
                colors=get_color_palette(i, True),
                notes=reminder_data.get("notes")
            )
            
            if date_key not in reminders_by_date:
                reminders_by_date[date_key] = []
            reminders_by_date[date_key].append(reminder)
        
        return CalendarOverviewResponse(
            current_month=target_month,
            tasks_by_date=tasks_by_date,
            reminders_by_date=reminders_by_date
        )
        
    except Exception as e:
        logger.error(f"Failed to get calendar overview: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve calendar overview")

@router.post("/tasks", response_model=TaskItem)
async def create_task(
    request: CreateTaskRequest,
    user: Dict[str, Any] = Depends(get_authenticated_user),
    http_request: Request = None
):
    """创建新任务 - 与前端addItem(task)兼容"""
    try:
        user_id = user["sub"]
        supabase_service = get_supabase_service()
        
        # 创建任务数据
        task_data = {
            "title": request.title,
            "starts_at": request.start.isoformat(),
            "ends_at": request.end.isoformat() if request.end else None,
            "category": request.category,
            "kind": "event",  # 任务类型
            "notes": request.notes,
            "priority": request.priority,
            "remind_minutes_before": request.remind_minutes_before,
            "is_completed": False
        }
        
        # 保存到数据库
        created_task = await supabase_service.create_task(
            user_id=user_id,
            access_token=user.get("token", ""),
            task_data=task_data
        )
        
        if not created_task:
            raise HTTPException(status_code=500, detail="Failed to create task")
        
        # 奖励积分 - 与前端awardEarnOncePerDay("add_task", 5)兼容
        try:
            from routers.rewards import earn_points
            await earn_points(
                source="task_completion",  # 使用有效的source
                amount=5,
                description="Added a new task",
                user=user,
                request=http_request
            )
        except Exception as reward_error:
            logger.warning(f"Failed to award points for task creation: {reward_error}")
        
        # 返回创建的任务
        task = TaskItem(
            id=str(created_task.get("id")),
            title=created_task.get("title"),
            start=datetime.fromisoformat(created_task.get("starts_at")),
            end=datetime.fromisoformat(created_task.get("ends_at")) if created_task.get("ends_at") else None,
            colors=get_color_palette(0, False),  # 默认颜色
            category=created_task.get("category"),
            notes=created_task.get("notes"),
            priority=created_task.get("priority"),
            is_completed=created_task.get("is_completed", False)
        )
        
        return task
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create task: {e}")
        raise HTTPException(status_code=500, detail="Failed to create task")

@router.post("/reminders", response_model=ReminderItem)
async def create_reminder(
    request: CreateReminderRequest,
    user: Dict[str, Any] = Depends(get_authenticated_user),
    http_request: Request = None
):
    """创建新提醒 - 与前端addItem(reminder)兼容"""
    try:
        user_id = user["sub"]
        supabase_service = get_supabase_service()
        
        # 创建提醒数据（作为特殊类型的任务存储）
        reminder_data = {
            "title": request.title,
            "starts_at": request.at.isoformat(),
            "ends_at": None,  # 提醒不需要结束时间
            "category": "reminder",
            "kind": "reminder",  # 提醒类型
            "notes": request.notes,
            "priority": "medium",
            "remind_minutes_before": 0,  # 提醒本身就是提醒
            "is_completed": False
        }
        
        # 保存到数据库
        created_reminder = await supabase_service.create_task(
            user_id=user_id,
            access_token=user.get("token", ""),
            task_data=reminder_data
        )
        
        if not created_reminder:
            raise HTTPException(status_code=500, detail="Failed to create reminder")
        
        # 奖励积分 - 与前端awardEarnOncePerDay("add_reminder", 10)兼容
        try:
            from routers.rewards import earn_points
            await earn_points(
                source="task_completion",  # 使用有效的source
                amount=10,
                description="Added a new reminder",
                user=user,
                request=http_request
            )
        except Exception as reward_error:
            logger.warning(f"Failed to award points for reminder creation: {reward_error}")
        
        # 返回创建的提醒
        reminder = ReminderItem(
            id=str(created_reminder.get("id")),
            title=created_reminder.get("title"),
            at=datetime.fromisoformat(created_reminder.get("starts_at")),
            colors=get_color_palette(0, True),  # 默认提醒颜色
            notes=created_reminder.get("notes")
        )
        
        return reminder
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create reminder: {e}")
        raise HTTPException(status_code=500, detail="Failed to create reminder")

@router.put("/tasks/{task_id}")
async def update_task(
    task_id: str,
    request: CreateTaskRequest,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """更新任务"""
    try:
        user_id = user["sub"]
        supabase_service = get_supabase_service()
        
        # 更新任务数据
        task_data = {
            "title": request.title,
            "starts_at": request.start.isoformat(),
            "ends_at": request.end.isoformat() if request.end else None,
            "category": request.category,
            "notes": request.notes,
            "priority": request.priority,
            "remind_minutes_before": request.remind_minutes_before
        }
        
        updated_task = await supabase_service.update_task(
            user_id=user_id,
            task_id=int(task_id),
            access_token=user.get("token", ""),
            task_data=task_data
        )
        
        if not updated_task:
            raise HTTPException(status_code=404, detail="Task not found or update failed")
        
        return {"success": True, "message": "Task updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update task")

@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """删除任务"""
    try:
        user_id = user["sub"]
        supabase_service = get_supabase_service()
        
        success = await supabase_service.delete_task(
            user_id=user_id,
            task_id=int(task_id),
            access_token=user.get("token", "")
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Task not found or delete failed")
        
        return {"success": True, "message": "Task deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete task")

@router.put("/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user),
    http_request: Request = None
):
    """标记任务为完成"""
    try:
        user_id = user["sub"]
        supabase_service = get_supabase_service()
        
        # 更新任务完成状态
        updated_task = await supabase_service.update_task(
            user_id=user_id,
            task_id=int(task_id),
            access_token=user.get("token", ""),
            task_data={"is_completed": True}
        )
        
        if not updated_task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        # 奖励完成任务的积分
        try:
            from routers.rewards import earn_points
            await earn_points(
                source="task_completion",
                amount=10,
                description=f"Completed task: {updated_task.get('title', 'Task')}",
                user=user,
                request=http_request
            )
        except Exception as reward_error:
            logger.warning(f"Failed to award points for task completion: {reward_error}")
        
        return {
            "success": True,
            "message": "Task completed successfully",
            "points_earned": 10
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to complete task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete task")
