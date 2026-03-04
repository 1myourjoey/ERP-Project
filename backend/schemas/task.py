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
    gp_entity_id: Optional[int] = None
    is_notice: bool = False
    is_report: bool = False

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
    gp_entity_id: Optional[int] = None
    is_notice: Optional[bool] = None
    is_report: Optional[bool] = None

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
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    actual_time: Optional[str] = None
    workflow_instance_id: Optional[int] = None
    workflow_step_order: Optional[int] = None
    category: Optional[str] = None
    fund_id: Optional[int] = None
    investment_id: Optional[int] = None
    gp_entity_id: Optional[int] = None
    obligation_id: Optional[int] = None
    auto_generated: bool = False
    source: Optional[str] = None
    is_notice: bool = False
    is_report: bool = False
    fund_name: Optional[str] = None
    gp_entity_name: Optional[str] = None
    company_name: Optional[str] = None
    workflow_name: Optional[str] = None
    stale_days: Optional[int] = None
    attachment_count: int = 0

    model_config = {"from_attributes": True}


class TaskBoardSummary(BaseModel):
    overdue_count: int = 0
    today_count: int = 0
    this_week_count: int = 0
    completed_today_count: int = 0
    total_pending_count: int = 0
    total_estimated_minutes: int = 0
    completed_estimated_minutes: int = 0
    stale_count: int = 0
    work_score: int = 0
    progress_count_pct: int = 0
    progress_time_pct: int = 0


class TaskBoardResponse(BaseModel):
    summary: TaskBoardSummary
    Q1: list[TaskResponse]
    Q2: list[TaskResponse]
    Q3: list[TaskResponse]
    Q4: list[TaskResponse]
