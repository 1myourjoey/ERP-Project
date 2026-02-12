from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class TaskCreate(BaseModel):
    title: str
    deadline: Optional[datetime] = None
    estimated_time: Optional[str] = None
    quadrant: str = "Q1"
    memo: Optional[str] = None
    delegate_to: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    deadline: Optional[datetime] = None
    estimated_time: Optional[str] = None
    quadrant: Optional[str] = None
    memo: Optional[str] = None
    status: Optional[str] = None
    delegate_to: Optional[str] = None


class TaskComplete(BaseModel):
    actual_time: str


class TaskMove(BaseModel):
    quadrant: str


class TaskResponse(BaseModel):
    id: int
    title: str
    deadline: Optional[datetime] = None
    estimated_time: Optional[str] = None
    quadrant: str
    memo: Optional[str] = None
    status: str
    delegate_to: Optional[str] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    actual_time: Optional[str] = None
    workflow_instance_id: Optional[int] = None
    workflow_step_order: Optional[int] = None

    model_config = {"from_attributes": True}


class TaskBoardResponse(BaseModel):
    Q1: list[TaskResponse]
    Q2: list[TaskResponse]
    Q3: list[TaskResponse]
    Q4: list[TaskResponse]
