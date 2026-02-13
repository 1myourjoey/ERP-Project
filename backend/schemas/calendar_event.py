from pydantic import BaseModel, Field
from datetime import date, time
from typing import Literal, Optional


class CalendarEventCreate(BaseModel):
    title: str
    date: date
    time: Optional[time] = None
    duration: Optional[int] = Field(default=None, ge=0)
    description: Optional[str] = None
    status: Literal["pending", "completed"] = "pending"
    task_id: Optional[int] = None


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[date] = None
    time: Optional[time] = None
    duration: Optional[int] = Field(default=None, ge=0)
    description: Optional[str] = None
    status: Optional[Literal["pending", "completed"]] = None
    task_id: Optional[int] = None


class CalendarEventResponse(BaseModel):
    id: int
    title: str
    date: date
    time: Optional[time] = None
    duration: Optional[int] = Field(default=None, ge=0)
    description: Optional[str] = None
    status: Literal["pending", "completed"]
    task_id: Optional[int] = None

    model_config = {"from_attributes": True}
