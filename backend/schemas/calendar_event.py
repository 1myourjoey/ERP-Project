from pydantic import BaseModel
from datetime import date, time
from typing import Optional


class CalendarEventCreate(BaseModel):
    title: str
    date: date
    time: Optional[time] = None
    duration: Optional[int] = None
    description: Optional[str] = None
    status: str = "pending"
    task_id: Optional[int] = None


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[date] = None
    time: Optional[time] = None
    duration: Optional[int] = None
    description: Optional[str] = None
    status: Optional[str] = None
    task_id: Optional[int] = None


class CalendarEventResponse(BaseModel):
    id: int
    title: str
    date: date
    time: Optional[time] = None
    duration: Optional[int] = None
    description: Optional[str] = None
    status: str
    task_id: Optional[int] = None

    model_config = {"from_attributes": True}
