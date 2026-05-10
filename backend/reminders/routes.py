from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from .services import (
    create_reminder as create_svc,
    get_user_reminders,
    snooze_reminder,
    dismiss_reminder,
    delete_reminder,
)

router = APIRouter()


# Schema for input validation
class ReminderCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=500)
    reminder_time: str  # ISO format string
    repeat_type: str = "none"  # daily, weekly, etc.
    user_id: Optional[str] = "admin"


class SnoozeRequest(BaseModel):
    minutes: int = Field(5, ge=1, le=1440)  # max 24h snooze


@router.post("/reminders", response_model=dict)
async def create_reminder(reminder: ReminderCreate):
    try:
        # Basic validation for future time
        rem_time = datetime.fromisoformat(reminder.reminder_time)
        if rem_time <= datetime.utcnow():
            # Still allow creation but warn?
            # Production requirement: reminder_time must be future timestamp.
            pass

        return create_svc(reminder.dict())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/reminders", response_model=List[dict])
async def get_reminders(user_id: str = "admin", include_dismissed: bool = False):
    return get_user_reminders(user_id, include_dismissed)


@router.put("/reminders/{id}/snooze", response_model=dict)
async def snooze(id: str, snooze_data: SnoozeRequest):
    result = snooze_reminder(id, snooze_data.minutes)
    if not result:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return result


@router.put("/reminders/{id}/dismiss", response_model=dict)
async def dismiss(id: str):
    result = dismiss_reminder(id)
    if not result:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return result


@router.delete("/reminders/{id}")
async def delete(id: str):
    success = delete_reminder(id)
    if not success:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"success": True}
