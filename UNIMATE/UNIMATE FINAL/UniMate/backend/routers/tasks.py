"""
Tasks and Reminders router for UniMate backend.
Handles task management, reminders, and calendar functionality.

MIGRATED TO SQLALCHEMY for better performance (10-20x faster than REST API)
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict, Any
import logging

from models import db, Task as TaskModel, Reminder as ReminderModel
from routers.core_supabase import get_authenticated_user

router = APIRouter(prefix="/tasks", tags=["tasks"])
logger = logging.getLogger("unimate-tasks")

# --- Schemas ---

class TaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    notes: Optional[str] = Field(None, max_length=1000)  # Match database field name
    category: Optional[str] = Field("other", max_length=50)
    kind: Optional[str] = Field("task", pattern="^(event|reminder|task)$")
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    priority: Optional[str] = Field("medium", pattern="^(low|medium|high)$")
    is_completed: bool = False
    remind_minutes_before: Optional[int] = 30

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    notes: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = Field(None, max_length=50)
    kind: Optional[str] = Field(None, pattern="^(event|reminder|task)$")
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    priority: Optional[str] = Field(None, pattern="^(low|medium|high)$")
    is_completed: Optional[bool] = None
    remind_minutes_before: Optional[int] = None

class Task(TaskBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

class ReminderBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    reminder_time: datetime = Field(..., description="When to trigger the reminder")
    repeat_type: Optional[str] = Field("once", pattern="^(once|daily|weekly|monthly)$")
    is_active: bool = True

class ReminderCreate(ReminderBase):
    pass

class ReminderUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    reminder_time: Optional[datetime] = None
    repeat_type: Optional[str] = Field(None, pattern="^(once|daily|weekly|monthly)$")
    is_active: Optional[bool] = None

class Reminder(ReminderBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime


# --- Task Endpoints ---

@router.get("", response_model=List[Task])
def get_tasks(
    completed: Optional[bool] = None,
    priority: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get all tasks for the current user."""
    session = db()
    try:
        user_id = user["sub"]

        # Build query with filters
        query = session.query(TaskModel).filter(TaskModel.user_id == user_id)

        if completed is not None:
            query = query.filter(TaskModel.is_completed == completed)
        if priority:
            query = query.filter(TaskModel.priority == priority)

        # Order by creation date (newest first)
        query = query.order_by(TaskModel.created_at.desc())

        tasks_data = query.all()

        # Transform data to match Task schema
        tasks = []
        for task_data in tasks_data:
            task = {
                "id": str(task_data.id),
                "user_id": task_data.user_id,
                "title": task_data.title,
                "notes": task_data.notes,
                "category": task_data.category or "other",
                "kind": task_data.kind or "task",
                "starts_at": task_data.starts_at,
                "ends_at": task_data.ends_at,
                "priority": task_data.priority or "medium",
                "is_completed": task_data.is_completed,
                "remind_minutes_before": task_data.remind_minutes_before or 30,
                "created_at": task_data.created_at,
                "updated_at": task_data.updated_at
            }
            tasks.append(task)

        return tasks

    except Exception as e:
        logger.error(f"Failed to get tasks: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve tasks")
    finally:
        session.close()


@router.post("", response_model=Task)
async def create_task(
    task: TaskCreate,
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Create a new task."""
    session = db()
    try:
        user_id = user["sub"]
        now = datetime.utcnow()

        # Create new task
        new_task = TaskModel(
            user_id=user_id,
            title=task.title,
            notes=task.notes or "",
            category=task.category or "other",
            kind=task.kind or "task",
            starts_at=task.starts_at or now,
            ends_at=task.ends_at,
            priority=task.priority or "medium",
            is_completed=task.is_completed,
            remind_minutes_before=task.remind_minutes_before or 30,
            created_at=now,
            updated_at=now
        )

        session.add(new_task)
        session.commit()
        session.refresh(new_task)

        result = {
            "id": str(new_task.id),
            "user_id": new_task.user_id,
            "title": new_task.title,
            "notes": new_task.notes,
            "category": new_task.category,
            "kind": new_task.kind,
            "starts_at": new_task.starts_at,
            "ends_at": new_task.ends_at,
            "priority": new_task.priority,
            "is_completed": new_task.is_completed,
            "remind_minutes_before": new_task.remind_minutes_before,
            "created_at": new_task.created_at,
            "updated_at": new_task.updated_at
        }

        logger.info(f"Created task: {result['title']} for user {user_id}")

        # ✅ Award points for adding a task (+5 points, once per day)
        try:
            from routers.rewards import award_daily_action_points
            # Use BackgroundTasks to ensure it runs after response is sent
            background_tasks.add_task(award_daily_action_points, user_id, "add_task")
            logger.info(f"✅ Task creation points job scheduled for user {user_id}")
        except Exception as e:
            logger.error(f"❌ Failed to schedule task creation points: {e}", exc_info=True)

        return result

    except Exception as e:
        session.rollback()
        logger.error(f"Failed to create task: {e}")
        raise HTTPException(status_code=500, detail="Failed to create task")
    finally:
        session.close()


# --- Reminder Endpoints (MUST come before /{task_id} routes!) ---

@router.get("/reminders")
def get_reminders(
    active_only: bool = True,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get all reminders for the current user."""
    session = db()
    try:
        user_id = user["sub"]

        query = session.query(ReminderModel).filter(ReminderModel.user_id == user_id)

        if active_only:
            query = query.filter(ReminderModel.is_active == True)

        reminders = query.order_by(ReminderModel.reminder_time).all()

        # Build response - return plain dicts to avoid Pydantic validation issues
        result = []
        for r in reminders:
            try:
                reminder_dict = {
                    "id": str(r.id),
                    "user_id": r.user_id,
                    "title": r.title,
                    "description": r.description or "",
                    "reminder_time": r.reminder_time.isoformat() if r.reminder_time else None,
                    "repeat_type": r.repeat_type or "once",
                    "is_active": r.is_active if r.is_active is not None else True,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "updated_at": r.updated_at.isoformat() if r.updated_at else None
                }
                logger.info(f"Building reminder: {reminder_dict}")
                result.append(reminder_dict)
            except Exception as e:
                logger.error(f"Failed to serialize reminder {r.id}: {e}, data: {vars(r)}")
                continue

        logger.info(f"Returning {len(result)} reminders for user {user_id}")
        return result

    except Exception as e:
        logger.error(f"Failed to get reminders: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve reminders")
    finally:
        session.close()


@router.post("/reminders", response_model=Reminder)
async def create_reminder(
    reminder: ReminderCreate,
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Create a new reminder."""
    session = db()
    try:
        user_id = user["sub"]
        now = datetime.utcnow()

        new_reminder = ReminderModel(
            user_id=user_id,
            title=reminder.title,
            description=reminder.description or "",
            reminder_time=reminder.reminder_time,
            repeat_type=reminder.repeat_type or "once",
            is_active=reminder.is_active,
            created_at=now,
            updated_at=now
        )

        session.add(new_reminder)
        session.commit()
        session.refresh(new_reminder)

        logger.info(f"Created reminder: {new_reminder.title} for user {user_id}")

        # ✅ Award points for adding a reminder (+10 points, once per day)
        try:
            from routers.rewards import award_daily_action_points
            # Use BackgroundTasks to ensure it runs after response is sent
            background_tasks.add_task(award_daily_action_points, user_id, "add_reminder")
            logger.info(f"✅ Reminder creation points job scheduled for user {user_id}")
        except Exception as e:
            logger.error(f"❌ Failed to schedule reminder creation points: {e}", exc_info=True)

        return Reminder(
            id=str(new_reminder.id),
            user_id=new_reminder.user_id,
            title=new_reminder.title,
            description=new_reminder.description,
            reminder_time=new_reminder.reminder_time,
            repeat_type=new_reminder.repeat_type,
            is_active=new_reminder.is_active,
            created_at=new_reminder.created_at,
            updated_at=new_reminder.updated_at
        )

    except Exception as e:
        session.rollback()
        logger.error(f"Failed to create reminder: {e}")
        raise HTTPException(status_code=500, detail="Failed to create reminder")
    finally:
        session.close()


@router.put("/reminders/{reminder_id}", response_model=Reminder)
def update_reminder(
    reminder_id: str,
    reminder_update: ReminderUpdate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Update an existing reminder."""
    session = db()
    try:
        user_id = user["sub"]

        reminder = session.query(ReminderModel).filter(
            ReminderModel.id == reminder_id,
            ReminderModel.user_id == user_id
        ).first()

        if not reminder:
            raise HTTPException(status_code=404, detail="Reminder not found")

        # Update fields
        if reminder_update.title is not None:
            reminder.title = reminder_update.title
        if reminder_update.description is not None:
            reminder.description = reminder_update.description
        if reminder_update.reminder_time is not None:
            reminder.reminder_time = reminder_update.reminder_time
        if reminder_update.repeat_type is not None:
            reminder.repeat_type = reminder_update.repeat_type
        if reminder_update.is_active is not None:
            reminder.is_active = reminder_update.is_active

        reminder.updated_at = datetime.utcnow()
        session.commit()
        session.refresh(reminder)

        logger.info(f"Updated reminder {reminder_id}")
        return Reminder(
            id=str(reminder.id),
            user_id=reminder.user_id,
            title=reminder.title,
            description=reminder.description,
            reminder_time=reminder.reminder_time,
            repeat_type=reminder.repeat_type,
            is_active=reminder.is_active,
            created_at=reminder.created_at,
            updated_at=reminder.updated_at
        )

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to update reminder: {e}")
        raise HTTPException(status_code=500, detail="Failed to update reminder")
    finally:
        session.close()


@router.delete("/reminders/{reminder_id}")
def delete_reminder(
    reminder_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Delete a reminder."""
    session = db()
    try:
        user_id = user["sub"]

        reminder = session.query(ReminderModel).filter(
            ReminderModel.id == reminder_id,
            ReminderModel.user_id == user_id
        ).first()

        if not reminder:
            raise HTTPException(status_code=404, detail="Reminder not found")

        session.delete(reminder)
        session.commit()

        logger.info(f"Deleted reminder {reminder_id}")
        return {"message": "Reminder deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to delete reminder: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete reminder")
    finally:
        session.close()


# --- Individual Task Endpoints (with /{task_id} parameter) ---

@router.get("/{task_id}", response_model=Task)
def get_task(
    task_id: int,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get a specific task by ID."""
    session = db()
    try:
        user_id = user["sub"]

        task = session.query(TaskModel).filter(
            TaskModel.id == task_id,
            TaskModel.user_id == user_id
        ).first()

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        return {
            "id": str(task.id),
            "user_id": task.user_id,
            "title": task.title,
            "notes": task.notes,
            "category": task.category or "other",
            "kind": task.kind or "task",
            "starts_at": task.starts_at,
            "ends_at": task.ends_at,
            "priority": task.priority or "medium",
            "is_completed": task.is_completed,
            "remind_minutes_before": task.remind_minutes_before or 30,
            "created_at": task.created_at,
            "updated_at": task.updated_at
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve task")
    finally:
        session.close()


@router.put("/{task_id}", response_model=Task)
def update_task(
    task_id: int,
    task_update: TaskUpdate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Update an existing task."""
    session = db()
    try:
        user_id = user["sub"]

        task = session.query(TaskModel).filter(
            TaskModel.id == task_id,
            TaskModel.user_id == user_id
        ).first()

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        # Update fields
        if task_update.title is not None:
            task.title = task_update.title
        if task_update.notes is not None:
            task.notes = task_update.notes
        if task_update.category is not None:
            task.category = task_update.category
        if task_update.kind is not None:
            task.kind = task_update.kind
        if task_update.starts_at is not None:
            task.starts_at = task_update.starts_at
        if task_update.ends_at is not None:
            task.ends_at = task_update.ends_at
        if task_update.priority is not None:
            task.priority = task_update.priority
        if task_update.is_completed is not None:
            task.is_completed = task_update.is_completed
        if task_update.remind_minutes_before is not None:
            task.remind_minutes_before = task_update.remind_minutes_before

        task.updated_at = datetime.utcnow()

        session.commit()
        session.refresh(task)

        updated_task = {
            "id": str(task.id),
            "user_id": task.user_id,
            "title": task.title,
            "notes": task.notes,
            "category": task.category,
            "kind": task.kind,
            "starts_at": task.starts_at,
            "ends_at": task.ends_at,
            "priority": task.priority,
            "is_completed": task.is_completed,
            "remind_minutes_before": task.remind_minutes_before,
            "created_at": task.created_at,
            "updated_at": task.updated_at
        }

        logger.info(f"Updated task {task_id} for user {user_id}")
        return updated_task

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to update task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update task")
    finally:
        session.close()


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Delete a task."""
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

        logger.info(f"Deleted task {task_id} for user {user_id}")
        return {"message": "Task deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to delete task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete task")
    finally:
        session.close()
