"""
Tasks and Reminders router for UniMate backend.
Handles task management, reminders, and calendar functionality.
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict, Any
import logging
from uuid import uuid4

from services.supabase_client import supabase_service
from routers.core_supabase import get_authenticated_user

router = APIRouter(prefix="/tasks", tags=["tasks"])
logger = logging.getLogger("unimate-tasks")

# --- Schemas ---

class TaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    due_date: Optional[datetime] = None
    priority: Optional[str] = Field("medium", pattern="^(low|medium|high)$")
    tags: Optional[List[str]] = []
    completed: bool = False

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    due_date: Optional[datetime] = None
    priority: Optional[str] = Field(None, pattern="^(low|medium|high)$")
    tags: Optional[List[str]] = None
    completed: Optional[bool] = None

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
async def get_tasks(
    completed: Optional[bool] = None,
    priority: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get all tasks for the current user."""
    try:
        user_id = user["sub"]

        # Prepare filters for database query
        filters = {}
        if completed is not None:
            filters["completed"] = completed
        if priority:
            filters["priority"] = priority

        # Get tasks from database
        tasks_data = await supabase_service.get_user_tasks(
            user_id, 
            user.get("token", ""), 
            filters
        )

        # Transform data to match Task model
        tasks = []
        for task_data in tasks_data:
            task = {
                "id": str(task_data.get("id", "")),
                "user_id": task_data.get("user_id", user_id),
                "title": task_data.get("title", ""),
                "description": task_data.get("notes"),
                "due_date": task_data.get("ends_at"),
                "priority": task_data.get("priority", "medium"),
                "tags": task_data.get("tags", []),
                "completed": task_data.get("is_completed", False),
                "created_at": task_data.get("created_at", datetime.utcnow().isoformat()),
                "updated_at": task_data.get("updated_at", datetime.utcnow().isoformat())
            }
            tasks.append(task)

        return tasks

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get tasks: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve tasks")

@router.post("", response_model=Task)
async def create_task(
    task: TaskCreate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Create a new task."""
    try:
        user_id = user["sub"]
        
        # Prepare task data for database
        task_data = {
            "user_id": user_id,
            "title": task.title,
            "notes": task.description,
            "category": "other",  # Default category
            "kind": "event",      # Default kind
            "starts_at": task.due_date.isoformat() if task.due_date else datetime.utcnow().isoformat(),
            "ends_at": task.due_date.isoformat() if task.due_date else datetime.utcnow().isoformat(),
            "priority": task.priority or "medium",
            "is_completed": task.completed,
            "remind_minutes_before": 30  # Default reminder
        }

        # Create task in database
        created_task = await supabase_service.create_task(task_data, user.get("token", ""))

        if created_task:
            # Transform response to match Task model
            result = {
                "id": str(created_task.get("id", "")),
                "user_id": created_task.get("user_id", user_id),
                "title": created_task.get("title", ""),
                "description": created_task.get("notes"),
                "due_date": created_task.get("ends_at"),
                "priority": created_task.get("priority", "medium"),
                "tags": task.tags or [],
                "completed": created_task.get("is_completed", False),
                "created_at": created_task.get("created_at", datetime.utcnow().isoformat()),
                "updated_at": created_task.get("updated_at", datetime.utcnow().isoformat())
            }

            logger.info(f"Created task: {result['title']} for user {user_id}")
            return result
        else:
            raise HTTPException(status_code=500, detail="Failed to create task in database")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create task: {e}")
        raise HTTPException(status_code=500, detail="Failed to create task")

@router.get("/{task_id}", response_model=Task)
async def get_task(
    task_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get a specific task by ID."""
    try:
        user_id = user["sub"]

        # Get task from Supabase
        response = supabase_service.client.table("tasks").select("*").eq("id", task_id).eq("user_id", user_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Task not found")

        task = response.data[0]
        return {
            "id": str(task.get("id", "")),
            "user_id": task.get("user_id"),
            "title": task.get("title"),
            "description": task.get("notes"),
            "due_date": task.get("ends_at"),
            "priority": task.get("priority", "medium"),
            "tags": task.get("tags", []),
            "completed": task.get("is_completed", False),
            "created_at": task.get("created_at"),
            "updated_at": task.get("updated_at")
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve task")

@router.put("/{task_id}", response_model=Task)
async def update_task(
    task_id: str,
    task_update: TaskUpdate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Update an existing task."""
    try:
        user_id = user["sub"]

        # Update task data for database
        update_data = {}
        if task_update.title is not None:
            update_data["title"] = task_update.title
        if task_update.description is not None:
            update_data["notes"] = task_update.description
        if task_update.due_date is not None:
            update_data["ends_at"] = task_update.due_date.isoformat()
            update_data["starts_at"] = task_update.due_date.isoformat()
        if task_update.priority is not None:
            update_data["priority"] = task_update.priority
        if task_update.completed is not None:
            update_data["is_completed"] = task_update.completed

        update_data["updated_at"] = datetime.utcnow().isoformat()

        # Update task in database
        response = supabase_service.client.table("tasks").update(update_data).eq("id", task_id).eq("user_id", user_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Task not found")

        updated_task_data = response.data[0]
        updated_task = {
            "id": str(updated_task_data.get("id", "")),
            "user_id": updated_task_data.get("user_id", user_id),
            "title": updated_task_data.get("title", ""),
            "description": updated_task_data.get("notes"),
            "due_date": updated_task_data.get("ends_at"),
            "priority": updated_task_data.get("priority", "medium"),
            "tags": task_update.tags if task_update.tags is not None else [],
            "completed": updated_task_data.get("is_completed", False),
            "created_at": updated_task_data.get("created_at"),
            "updated_at": updated_task_data.get("updated_at")
        }

        logger.info(f"Updated task {task_id} for user {user_id}")
        return updated_task

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update task")

@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Delete a task."""
    try:
        user_id = user["sub"]

        # Delete task from database
        response = supabase_service.client.table("tasks").delete().eq("id", task_id).eq("user_id", user_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Task not found")

        logger.info(f"Deleted task {task_id} for user {user_id}")
        return {"message": "Task deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete task")

# --- Reminder Endpoints ---

@router.get("/reminders", response_model=List[Reminder])
async def get_reminders(
    active_only: bool = True,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Get all reminders for the current user."""
    try:
        user_id = user["sub"]

        # Get reminders from Supabase
        query = supabase_service.client.table("reminders").select("*").eq("user_id", user_id)

        if active_only:
            query = query.eq("is_active", True)

        response = query.execute()

        reminders = []
        if response.data:
            for reminder in response.data:
                reminders.append({
                    "id": reminder.get("id"),
                    "user_id": reminder.get("user_id"),
                    "title": reminder.get("title"),
                    "description": reminder.get("description"),
                    "reminder_time": reminder.get("reminder_time"),
                    "repeat_type": reminder.get("repeat_type", "once"),
                    "is_active": reminder.get("is_active", True),
                    "created_at": reminder.get("created_at"),
                    "updated_at": reminder.get("updated_at")
                })

        return reminders

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get reminders: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve reminders")

@router.post("/reminders", response_model=Reminder)
async def create_reminder(
    reminder: ReminderCreate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Create a new reminder."""
    try:
        user_id = user["sub"]
        now = datetime.utcnow()

        reminder_data = {
            "user_id": user_id,
            "title": reminder.title,
            "description": reminder.description,
            "reminder_time": reminder.reminder_time.isoformat(),
            "repeat_type": reminder.repeat_type,
            "is_active": reminder.is_active,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }

        # Insert reminder into database
        response = supabase_service.client.table("reminders").insert(reminder_data).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create reminder in database")

        created_reminder = response.data[0]
        new_reminder = {
            "id": str(created_reminder.get("id", "")),
            "user_id": created_reminder.get("user_id", user_id),
            "title": created_reminder.get("title"),
            "description": created_reminder.get("description"),
            "reminder_time": created_reminder.get("reminder_time"),
            "repeat_type": created_reminder.get("repeat_type", "once"),
            "is_active": created_reminder.get("is_active", True),
            "created_at": created_reminder.get("created_at"),
            "updated_at": created_reminder.get("updated_at")
        }

        logger.info(f"Created reminder: {new_reminder['title']} for user {user_id}")
        return new_reminder

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create reminder: {e}")
        raise HTTPException(status_code=500, detail="Failed to create reminder")

@router.put("/reminders/{reminder_id}", response_model=Reminder)
async def update_reminder(
    reminder_id: str,
    reminder_update: ReminderUpdate,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Update an existing reminder."""
    try:
        user_id = user["sub"]

        # Update reminder data for database
        update_data = {}
        if reminder_update.title is not None:
            update_data["title"] = reminder_update.title
        if reminder_update.description is not None:
            update_data["description"] = reminder_update.description
        if reminder_update.reminder_time is not None:
            update_data["reminder_time"] = reminder_update.reminder_time.isoformat()
        if reminder_update.repeat_type is not None:
            update_data["repeat_type"] = reminder_update.repeat_type
        if reminder_update.is_active is not None:
            update_data["is_active"] = reminder_update.is_active

        update_data["updated_at"] = datetime.utcnow().isoformat()

        # Update reminder in database
        response = supabase_service.client.table("reminders").update(update_data).eq("id", reminder_id).eq("user_id", user_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Reminder not found")

        updated_reminder_data = response.data[0]
        updated_reminder = {
            "id": updated_reminder_data.get("id"),
            "user_id": updated_reminder_data.get("user_id"),
            "title": updated_reminder_data.get("title"),
            "description": updated_reminder_data.get("description"),
            "reminder_time": updated_reminder_data.get("reminder_time"),
            "repeat_type": updated_reminder_data.get("repeat_type", "once"),
            "is_active": updated_reminder_data.get("is_active", True),
            "created_at": updated_reminder_data.get("created_at"),
            "updated_at": updated_reminder_data.get("updated_at")
        }

        logger.info(f"Updated reminder {reminder_id} for user {user_id}")
        return updated_reminder

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update reminder {reminder_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update reminder")

@router.delete("/reminders/{reminder_id}")
async def delete_reminder(
    reminder_id: str,
    user: Dict[str, Any] = Depends(get_authenticated_user)
):
    """Delete a reminder."""
    try:
        user_id = user["sub"]

        # Delete reminder from database
        response = supabase_service.client.table("reminders").delete().eq("id", reminder_id).eq("user_id", user_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Reminder not found")

        logger.info(f"Deleted reminder {reminder_id} for user {user_id}")
        return {"message": "Reminder deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete reminder {reminder_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete reminder")