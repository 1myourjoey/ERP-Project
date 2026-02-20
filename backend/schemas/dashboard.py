from typing import Optional

from pydantic import BaseModel, Field

from schemas.task import TaskResponse


class DashboardTaskBucket(BaseModel):
    tasks: list[TaskResponse] = Field(default_factory=list)
    total_estimated_time: str


class ActiveWorkflowItem(BaseModel):
    id: int
    name: str
    progress: str
    next_step: Optional[str] = None
    next_step_date: Optional[str] = None
    company_name: Optional[str] = None
    fund_name: Optional[str] = None
    gp_entity_name: Optional[str] = None


class FundSummaryItem(BaseModel):
    id: int
    name: str
    type: str
    status: str
    commitment_total: Optional[float] = None
    aum: Optional[float] = None
    lp_count: int
    investment_count: int


class MissingDocumentItem(BaseModel):
    id: int
    investment_id: int
    document_name: str
    document_type: Optional[str] = None
    status: str
    company_name: str
    fund_name: str
    due_date: Optional[str] = None
    days_remaining: Optional[int] = None


class UpcomingReportItem(BaseModel):
    id: int
    report_target: str
    fund_id: Optional[int] = None
    fund_name: Optional[str] = None
    period: Optional[str] = None
    due_date: Optional[str] = None
    status: str
    days_remaining: Optional[int] = None
    task_id: Optional[int] = None


class DashboardBaseResponse(BaseModel):
    date: str
    day_of_week: str
    monthly_reminder: bool
    today: DashboardTaskBucket
    tomorrow: DashboardTaskBucket
    this_week: list[TaskResponse] = Field(default_factory=list)
    upcoming: list[TaskResponse] = Field(default_factory=list)
    no_deadline: list[TaskResponse] = Field(default_factory=list)


class DashboardWorkflowsResponse(BaseModel):
    active_workflows: list[ActiveWorkflowItem] = Field(default_factory=list)


class DashboardSidebarResponse(BaseModel):
    fund_summary: list[FundSummaryItem] = Field(default_factory=list)
    missing_documents: list[MissingDocumentItem] = Field(default_factory=list)
    upcoming_reports: list[UpcomingReportItem] = Field(default_factory=list)


class DashboardCompletedResponse(BaseModel):
    completed_today: list[TaskResponse] = Field(default_factory=list)
    completed_this_week: list[TaskResponse] = Field(default_factory=list)
    completed_last_week: list[TaskResponse] = Field(default_factory=list)
    completed_today_count: int
    completed_this_week_count: int


class DashboardTodayResponse(BaseModel):
    date: str
    day_of_week: str
    monthly_reminder: bool
    today: DashboardTaskBucket
    tomorrow: DashboardTaskBucket
    this_week: list[TaskResponse] = Field(default_factory=list)
    upcoming: list[TaskResponse] = Field(default_factory=list)
    no_deadline: list[TaskResponse] = Field(default_factory=list)
    active_workflows: list[ActiveWorkflowItem] = Field(default_factory=list)
    fund_summary: list[FundSummaryItem] = Field(default_factory=list)
    missing_documents: list[MissingDocumentItem] = Field(default_factory=list)
    upcoming_reports: list[UpcomingReportItem] = Field(default_factory=list)
    completed_today: list[TaskResponse] = Field(default_factory=list)
    completed_this_week: list[TaskResponse] = Field(default_factory=list)
    completed_last_week: list[TaskResponse] = Field(default_factory=list)
    completed_today_count: int
    completed_this_week_count: int


class UpcomingNoticeItem(BaseModel):
    fund_name: str
    notice_label: str
    deadline: str
    days_remaining: int
    workflow_instance_name: str
    workflow_instance_id: Optional[int] = None
    task_id: Optional[int] = None
