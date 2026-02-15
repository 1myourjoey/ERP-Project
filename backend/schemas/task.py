import re

from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Literal, Optional

ESTIMATED_TIME_PATTERN = re.compile(r"^(\d+[hdm]|\d+h\s?\d+m)$")


class TaskCreate(BaseModel):
    title: str
    deadline: Optional[datetime] = None
    estimated_time: Optional[str] = None
    quadrant: Literal["Q1", "Q2", "Q3", "Q4"] = "Q1"
    memo: Optional[str] = None
    delegate_to: Optional[str] = None
    category: Optional[str] = None
    fund_id: Optional[int] = None
    investment_id: Optional[int] = None

    @field_validator("estimated_time")
    @classmethod
    def validate_estimated_time_create(cls, value: Optional[str]) -> Optional[str]:
        if value is None or value == "":
            return None
        if not ESTIMATED_TIME_PATTERN.fullmatch(value):
            raise ValueError("estimated_time must be like 2h, 30m, 1d, or 1h 30m")
        return value


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    deadline: Optional[datetime] = None
    estimated_time: Optional[str] = None
    quadrant: Optional[Literal["Q1", "Q2", "Q3", "Q4"]] = None
    memo: Optional[str] = None
    status: Optional[Literal["pending", "in_progress", "completed"]] = None
    delegate_to: Optional[str] = None
    category: Optional[str] = None
    fund_id: Optional[int] = None
    investment_id: Optional[int] = None

    @field_validator("estimated_time")
    @classmethod
    def validate_estimated_time_update(cls, value: Optional[str]) -> Optional[str]:
        if value is None or value == "":
            return None
        if not ESTIMATED_TIME_PATTERN.fullmatch(value):
            raise ValueError("estimated_time must be like 2h, 30m, 1d, or 1h 30m")
        return value


class TaskComplete(BaseModel):
    actual_time: str
    auto_worklog: bool = True
    memo: Optional[str] = None


class TaskMove(BaseModel):
    quadrant: Literal["Q1", "Q2", "Q3", "Q4"]


class TaskResponse(BaseModel):
    id: int
    title: str
    deadline: Optional[datetime] = None
    estimated_time: Optional[str] = None
    quadrant: Literal["Q1", "Q2", "Q3", "Q4"]
    memo: Optional[str] = None
    status: Literal["pending", "in_progress", "completed"]
    delegate_to: Optional[str] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    actual_time: Optional[str] = None
    workflow_instance_id: Optional[int] = None
    workflow_step_order: Optional[int] = None
    category: Optional[str] = None
    fund_id: Optional[int] = None
    investment_id: Optional[int] = None
    fund_name: Optional[str] = None
    company_name: Optional[str] = None

    model_config = {"from_attributes": True}


class TaskBoardResponse(BaseModel):
    Q1: list[TaskResponse]
    Q2: list[TaskResponse]
    Q3: list[TaskResponse]
    Q4: list[TaskResponse]
