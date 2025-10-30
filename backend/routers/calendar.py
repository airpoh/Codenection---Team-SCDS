"""
Calendar and Reminder System - 与前端CalendarScreen完全兼容
集成SQLAlchemy ORM的tasks表

MIGRATED TO SQLALCHEMY for better performance (10-20x faster than REST API)
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
from datetime import datetime, date, timedelta
from collections import defaultdict

from routers.core_supabase import get_authenticated_user
from models import db, Task as TaskModel, Reminder as ReminderModel

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

def task_to_item(task: TaskModel, index: int) -> TaskItem:
    """Convert TaskModel to TaskItem"""
    return TaskItem(
        id=str(task.id),
        title=task.title,
        start=task.starts_at,
        end=task.ends_at,
        colors=get_color_palette(index, False),
        category=task.category or "other",
        notes=task.notes,
        priority=task.priority or "medium",
        is_completed=task.is_completed
    )

# === API Endpoints ===

@router.get("/today", response_model=CalendarDayResponse)
def get_today_schedule(user: Dict[str, Any] = Depends(get_authenticated_user)):
    """获取今日日程"""
    session = db()
    try:
        user_id = user["sub"]
        today = datetime.utcnow().date()
        tomorrow = today + timedelta(days=1)

        # Get tasks for today
        tasks = session.query(TaskModel).filter(
            TaskModel.user_id == user_id,
            TaskModel.starts_at >= datetime.combine(today, datetime.min.time()),
            TaskModel.starts_at < datetime.combine(tomorrow, datetime.min.time())
        ).order_by(TaskModel.starts_at).all()

        task_items = [task_to_item(task, i) for i, task in enumerate(tasks)]

        # Get reminders for today
        reminders = session.query(ReminderModel).filter(
            ReminderModel.user_id == user_id,
            ReminderModel.reminder_time >= datetime.combine(today, datetime.min.time()),
            ReminderModel.reminder_time < datetime.combine(tomorrow, datetime.min.time()),
            ReminderModel.is_active == True
        ).order_by(ReminderModel.reminder_time).all()

        reminder_items = [
            ReminderItem(
                id=str(r.id),
                title=r.title,
                at=r.reminder_time,
                colors=get_color_palette(i, True),
                notes=r.description
            )
            for i, r in enumerate(reminders)
        ]

        return CalendarDayResponse(
            date=today.isoformat(),
            tasks=task_items,
            reminders=reminder_items
        )

    except Exception as e:
        logger.error(f"Failed to get today schedule: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve today's schedule")
    finally:
        session.close()


@router.get("/day/{date}", response_model=CalendarDayResponse)
def get_day_schedule(
    date: str,  # YYYY-MM-DD
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """获取指定日期的日程"""
    session = db()
    try:
        user_id = user["sub"]

        # Parse date
        target_date = datetime.fromisoformat(date).date()
        next_day = target_date + timedelta(days=1)

        # Get tasks for the date
        tasks = session.query(TaskModel).filter(
            TaskModel.user_id == user_id,
            TaskModel.starts_at >= datetime.combine(target_date, datetime.min.time()),
            TaskModel.starts_at < datetime.combine(next_day, datetime.min.time())
        ).order_by(TaskModel.starts_at).all()

        task_items = [task_to_item(task, i) for i, task in enumerate(tasks)]

        # Get reminders for the date
        reminders = session.query(ReminderModel).filter(
            ReminderModel.user_id == user_id,
            ReminderModel.reminder_time >= datetime.combine(target_date, datetime.min.time()),
            ReminderModel.reminder_time < datetime.combine(next_day, datetime.min.time()),
            ReminderModel.is_active == True
        ).order_by(ReminderModel.reminder_time).all()

        reminder_items = [
            ReminderItem(
                id=str(r.id),
                title=r.title,
                at=r.reminder_time,
                colors=get_color_palette(i, True),
                notes=r.description
            )
            for i, r in enumerate(reminders)
        ]

        return CalendarDayResponse(
            date=target_date.isoformat(),
            tasks=task_items,
            reminders=reminder_items
        )

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    except Exception as e:
        logger.error(f"Failed to get day schedule: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve schedule")
    finally:
        session.close()


@router.get("/overview", response_model=CalendarOverviewResponse)
def get_calendar_overview(
    month: Optional[int] = None,
    year: Optional[int] = None,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """获取日历总览（按月）"""
    session = db()
    try:
        user_id = user["sub"]

        # Default to current month
        now = datetime.utcnow()
        target_month = month or now.month
        target_year = year or now.year

        # Get month range
        month_start = datetime(target_year, target_month, 1)
        if target_month == 12:
            month_end = datetime(target_year + 1, 1, 1)
        else:
            month_end = datetime(target_year, target_month + 1, 1)

        # Get all tasks for the month
        tasks = session.query(TaskModel).filter(
            TaskModel.user_id == user_id,
            TaskModel.starts_at >= month_start,
            TaskModel.starts_at < month_end
        ).order_by(TaskModel.starts_at).all()

        # Group tasks by date
        tasks_by_date = defaultdict(list)
        for i, task in enumerate(tasks):
            date_key = format_date_key(task.starts_at)
            tasks_by_date[date_key].append(task_to_item(task, i))

        # Get all reminders for the month
        reminders = session.query(ReminderModel).filter(
            ReminderModel.user_id == user_id,
            ReminderModel.reminder_time >= month_start,
            ReminderModel.reminder_time < month_end,
            ReminderModel.is_active == True
        ).order_by(ReminderModel.reminder_time).all()

        # Group reminders by date
        reminders_by_date = defaultdict(list)
        for i, reminder in enumerate(reminders):
            date_key = format_date_key(reminder.reminder_time)
            reminders_by_date[date_key].append(
                ReminderItem(
                    id=str(reminder.id),
                    title=reminder.title,
                    at=reminder.reminder_time,
                    colors=get_color_palette(i, True),
                    notes=reminder.description
                )
            )

        return CalendarOverviewResponse(
            current_month=target_month,
            tasks_by_date=dict(tasks_by_date),
            reminders_by_date=dict(reminders_by_date)
        )

    except Exception as e:
        logger.error(f"Failed to get calendar overview: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve calendar overview")
    finally:
        session.close()


@router.post("/tasks", response_model=TaskItem)
def create_calendar_task(
    request: CreateTaskRequest,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """创建日历任务"""
    session = db()
    try:
        user_id = user["sub"]
        now = datetime.utcnow()

        new_task = TaskModel(
            user_id=user_id,
            title=request.title,
            notes=request.notes or "",
            category=request.category,
            kind="event",
            starts_at=request.start,
            ends_at=request.end or request.start,
            priority=request.priority,
            is_completed=False,
            remind_minutes_before=request.remind_minutes_before,
            created_at=now,
            updated_at=now
        )

        session.add(new_task)
        session.commit()
        session.refresh(new_task)

        logger.info(f"Created calendar task: {new_task.title}")
        return task_to_item(new_task, 0)

    except Exception as e:
        session.rollback()
        logger.error(f"Failed to create task: {e}")
        raise HTTPException(status_code=500, detail="Failed to create task")
    finally:
        session.close()


@router.post("/reminders", response_model=ReminderItem)
def create_calendar_reminder(
    request: CreateReminderRequest,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """创建日历提醒"""
    session = db()
    try:
        user_id = user["sub"]
        now = datetime.utcnow()

        new_reminder = ReminderModel(
            user_id=user_id,
            title=request.title,
            description=request.notes or "",
            reminder_time=request.at,
            repeat_type="once",
            is_active=True,
            created_at=now,
            updated_at=now
        )

        session.add(new_reminder)
        session.commit()
        session.refresh(new_reminder)

        logger.info(f"Created calendar reminder: {new_reminder.title}")
        return ReminderItem(
            id=str(new_reminder.id),
            title=new_reminder.title,
            at=new_reminder.reminder_time,
            colors=get_color_palette(0, True),
            notes=new_reminder.description
        )

    except Exception as e:
        session.rollback()
        logger.error(f"Failed to create reminder: {e}")
        raise HTTPException(status_code=500, detail="Failed to create reminder")
    finally:
        session.close()


@router.put("/tasks/{task_id}")
def update_calendar_task(
    task_id: int,
    updates: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """更新日历任务"""
    session = db()
    try:
        user_id = user["sub"]

        task = session.query(TaskModel).filter(
            TaskModel.id == task_id,
            TaskModel.user_id == user_id
        ).first()

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        # Update allowed fields
        if "title" in updates:
            task.title = updates["title"]
        if "start" in updates:
            task.starts_at = datetime.fromisoformat(updates["start"])
        if "end" in updates:
            task.ends_at = datetime.fromisoformat(updates["end"]) if updates["end"] else None
        if "notes" in updates:
            task.notes = updates["notes"]
        if "category" in updates:
            task.category = updates["category"]
        if "priority" in updates:
            task.priority = updates["priority"]
        if "is_completed" in updates:
            task.is_completed = updates["is_completed"]

        task.updated_at = datetime.utcnow()
        session.commit()

        logger.info(f"Updated task {task_id}")
        return {"message": "Task updated successfully"}

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to update task: {e}")
        raise HTTPException(status_code=500, detail="Failed to update task")
    finally:
        session.close()


@router.delete("/tasks/{task_id}")
def delete_calendar_task(
    task_id: int,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """删除日历任务"""
    session = db()
    try:
        user_id = user["sub"]

        task = session.query(TaskModel).filter(
            TaskModel.id == task_id,
            TaskModel.user_id == user_id
        ).first()

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        session.delete(task)
        session.commit()

        logger.info(f"Deleted task {task_id}")
        return {"message": "Task deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to delete task: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete task")
    finally:
        session.close()


@router.put("/tasks/{task_id}/complete")
def complete_calendar_task(
    task_id: int,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """标记任务为完成"""
    session = db()
    try:
        user_id = user["sub"]

        task = session.query(TaskModel).filter(
            TaskModel.id == task_id,
            TaskModel.user_id == user_id
        ).first()

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        task.is_completed = True
        task.updated_at = datetime.utcnow()
        session.commit()

        logger.info(f"Completed task {task_id}")
        return {"message": "Task marked as completed", "task_id": task_id}

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to complete task: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete task")
    finally:
        session.close()


@router.get("/events")
def get_calendar_events(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """获取日历事件列表（兼容前端）"""
    session = db()
    try:
        user_id = user["sub"]

        query = session.query(TaskModel).filter(TaskModel.user_id == user_id)

        if start_date:
            query = query.filter(TaskModel.starts_at >= datetime.fromisoformat(start_date))
        if end_date:
            query = query.filter(TaskModel.starts_at <= datetime.fromisoformat(end_date))

        tasks = query.order_by(TaskModel.starts_at).all()
        task_items = [task_to_item(task, i) for i, task in enumerate(tasks)]

        return {
            "events": task_items,
            "total": len(task_items)
        }

    except Exception as e:
        logger.error(f"Failed to get events: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve events")
    finally:
        session.close()
