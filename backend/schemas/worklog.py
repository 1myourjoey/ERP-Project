from pydantic import BaseModel
from datetime import date, datetime
from typing import Literal, Optional


class WorkLogDetailItem(BaseModel):
    content: str
    order: int = 0


class WorkLogLessonItem(BaseModel):
    content: str
    order: int = 0


class WorkLogFollowUpItem(BaseModel):
    content: str
    target_date: Optional[date] = None
    order: int = 0


class WorkLogCreate(BaseModel):
    date: date
    category: str
    title: str
    content: Optional[str] = None
    status: str = "완료"
    estimated_time: Optional[str] = None
    actual_time: Optional[str] = None
    time_diff: Optional[str] = None
    task_id: Optional[int] = None
    details: list[WorkLogDetailItem] = []
    lessons: list[WorkLogLessonItem] = []
    follow_ups: list[WorkLogFollowUpItem] = []


class WorkLogUpdate(BaseModel):
    date: Optional[date] = None
    category: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    estimated_time: Optional[str] = None
    actual_time: Optional[str] = None
    time_diff: Optional[str] = None
    task_id: Optional[int] = None
    details: Optional[list[WorkLogDetailItem]] = None
    lessons: Optional[list[WorkLogLessonItem]] = None
    follow_ups: Optional[list[WorkLogFollowUpItem]] = None


class WorkLogDetailResponse(BaseModel):
    id: int
    worklog_id: int
    content: str
    order: int
    model_config = {"from_attributes": True}


class WorkLogLessonResponse(BaseModel):
    id: int
    worklog_id: int
    content: str
    order: int
    model_config = {"from_attributes": True}


class WorkLogFollowUpResponse(BaseModel):
    id: int
    worklog_id: int
    content: str
    target_date: Optional[date] = None
    order: int
    model_config = {"from_attributes": True}


class WorkLogResponse(BaseModel):
    id: int
    date: date
    category: str
    title: str
    content: Optional[str] = None
    status: str
    estimated_time: Optional[str] = None
    actual_time: Optional[str] = None
    time_diff: Optional[str] = None
    created_at: Optional[datetime] = None
    task_id: Optional[int] = None
    details: list[WorkLogDetailResponse] = []
    lessons: list[WorkLogLessonResponse] = []
    follow_ups: list[WorkLogFollowUpResponse] = []

    model_config = {"from_attributes": True}


class WorkLogStatsResponse(BaseModel):
    total: int
    completed: int
    in_progress: int
    by_category: dict[str, int]


class WorkLogTimeAccuracy(BaseModel):
    over: int
    under: int
    accurate: int


class WorkLogStatusCounts(BaseModel):
    completed: int
    in_progress: int


class WorkLogFollowUpRate(BaseModel):
    total: int
    completed: int


class WorkLogInsightsResponse(BaseModel):
    period: Literal["week", "month", "quarter"]
    total_logs: int
    time_by_category: dict[str, int]
    time_accuracy: WorkLogTimeAccuracy
    daily_counts: dict[str, int]
    category_counts: dict[str, int]
    status_counts: WorkLogStatusCounts
    weekday_counts: dict[int, int]
    recent_lessons: list[str]
    follow_up_rate: WorkLogFollowUpRate
    category_avg_time: dict[str, int]


WORKLOG_CATEGORIES = [
    "투심위", "투자계약", "투자계약 후속", "투자 후 등록",
    "조합감사", "내부보고회", "연말정산", "총무",
    "바이블 목록 제작", "LP바인더", "체크리스트",
    "시스템 설정", "정기 업무",
]
