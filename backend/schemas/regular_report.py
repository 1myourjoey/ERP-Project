from datetime import date, datetime

from pydantic import BaseModel


class RegularReportCreate(BaseModel):
    report_target: str
    fund_id: int | None = None
    period: str
    due_date: date | None = None
    status: str | None = "예정"
    submitted_date: date | None = None
    task_id: int | None = None
    memo: str | None = None


class RegularReportUpdate(BaseModel):
    report_target: str | None = None
    fund_id: int | None = None
    period: str | None = None
    due_date: date | None = None
    status: str | None = None
    submitted_date: date | None = None
    task_id: int | None = None
    memo: str | None = None


class RegularReportResponse(BaseModel):
    id: int
    report_target: str
    fund_id: int | None
    period: str
    due_date: date | None
    status: str
    submitted_date: date | None
    task_id: int | None
    memo: str | None
    created_at: datetime | None
    fund_name: str | None = None
    days_remaining: int | None = None

    model_config = {"from_attributes": True}
