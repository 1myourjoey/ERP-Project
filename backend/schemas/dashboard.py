from typing import Literal, Optional

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
    compliance_overdue: int = 0
    doc_collection_progress: Optional[str] = None


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
    source_label: Optional[str] = None


class DashboardComplianceWidget(BaseModel):
    overdue_count: int = 0
    due_this_week: int = 0
    due_this_month: int = 0


class DashboardDocCollectionWidget(BaseModel):
    current_quarter: str
    completion_pct: float = 0.0
    pending_companies: int = 0


class DashboardUrgentAlertItem(BaseModel):
    type: str
    message: str
    due_date: Optional[str] = None


class PrioritizedTaskWorkflowInfo(BaseModel):
    name: str
    step: str
    step_name: str


class PrioritizedTaskItem(BaseModel):
    task: TaskResponse
    urgency: Literal["overdue", "today", "tomorrow", "this_week", "upcoming"]
    d_day: Optional[int] = None
    workflow_info: Optional[PrioritizedTaskWorkflowInfo] = None
    source: Literal["manual", "workflow", "compliance"] = "manual"


class DashboardBaseResponse(BaseModel):
    date: str
    day_of_week: str
    monthly_reminder: bool
    investment_review_active_count: int = 0
    total_nav: float = 0
    unpaid_lp_count: int = 0
    pending_fee_count: int = 0
    biz_report_in_progress_count: int = 0
    today: DashboardTaskBucket
    tomorrow: DashboardTaskBucket
    this_week: list[TaskResponse] = Field(default_factory=list)
    upcoming: list[TaskResponse] = Field(default_factory=list)
    no_deadline: list[TaskResponse] = Field(default_factory=list)
    prioritized_tasks: list[PrioritizedTaskItem] = Field(default_factory=list)
    compliance: DashboardComplianceWidget = Field(default_factory=DashboardComplianceWidget)
    doc_collection: DashboardDocCollectionWidget = Field(
        default_factory=lambda: DashboardDocCollectionWidget(current_quarter="-", completion_pct=0.0, pending_companies=0)
    )
    urgent_alerts: list[DashboardUrgentAlertItem] = Field(default_factory=list)


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
    investment_review_active_count: int = 0
    total_nav: float = 0
    unpaid_lp_count: int = 0
    pending_fee_count: int = 0
    biz_report_in_progress_count: int = 0
    today: DashboardTaskBucket
    tomorrow: DashboardTaskBucket
    this_week: list[TaskResponse] = Field(default_factory=list)
    upcoming: list[TaskResponse] = Field(default_factory=list)
    no_deadline: list[TaskResponse] = Field(default_factory=list)
    prioritized_tasks: list[PrioritizedTaskItem] = Field(default_factory=list)
    active_workflows: list[ActiveWorkflowItem] = Field(default_factory=list)
    fund_summary: list[FundSummaryItem] = Field(default_factory=list)
    missing_documents: list[MissingDocumentItem] = Field(default_factory=list)
    upcoming_reports: list[UpcomingReportItem] = Field(default_factory=list)
    completed_today: list[TaskResponse] = Field(default_factory=list)
    completed_this_week: list[TaskResponse] = Field(default_factory=list)
    completed_last_week: list[TaskResponse] = Field(default_factory=list)
    completed_today_count: int
    completed_this_week_count: int
    compliance: DashboardComplianceWidget = Field(default_factory=DashboardComplianceWidget)
    doc_collection: DashboardDocCollectionWidget = Field(
        default_factory=lambda: DashboardDocCollectionWidget(current_quarter="-", completion_pct=0.0, pending_companies=0)
    )
    urgent_alerts: list[DashboardUrgentAlertItem] = Field(default_factory=list)


class UpcomingNoticeItem(BaseModel):
    fund_name: str
    notice_label: str
    deadline: str
    days_remaining: int
    workflow_instance_name: str
    workflow_instance_id: Optional[int] = None
    task_id: Optional[int] = None
    source_label: Optional[str] = None
