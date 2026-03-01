from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class RecurringViolationItem(BaseModel):
    rule_id: int
    rule_code: str | None = None
    rule_name: str | None = None
    violation_count: int = 0
    months_violated: list[str] = Field(default_factory=list)
    severity: str | None = None
    pattern: str
    recommendation: str


class TrendAreaItem(BaseModel):
    rule_id: int
    rule_code: str | None = None
    rule_name: str | None = None
    early_period_violations: int = 0
    recent_period_violations: int = 0
    delta: int = 0
    trend: str


class ViolationPatternsResponse(BaseModel):
    fund_id: int
    months: int
    since: str
    recurring_violations: list[RecurringViolationItem] = Field(default_factory=list)
    improving_areas: list[TrendAreaItem] = Field(default_factory=list)
    worsening_areas: list[TrendAreaItem] = Field(default_factory=list)


class RuleAdjustmentSuggestion(BaseModel):
    rule_id: int
    fund_id: int | None = None
    rule_code: str | None = None
    rule_name: str | None = None
    current_level: str | None = None
    current_severity: str | None = None
    suggestion: str
    detail: str
    recommended_severity: str | None = None
    violation_count: int | None = None


class OverdueRemediationTask(BaseModel):
    task_id: int
    task_title: str | None = None
    days_open: int
    deadline: str | None = None
    rule_id: int | None = None
    rule_name: str | None = None
    fund_id: int | None = None
    checked_at: str | None = None


class RemediationStatsResponse(BaseModel):
    fund_id: int | None = None
    total_tasks: int = 0
    completed: int = 0
    pending: int = 0
    completion_rate: float = 0.0
    avg_resolution_days: float = 0.0
    overdue_tasks: list[OverdueRemediationTask] = Field(default_factory=list)


class MonthlyReportSummary(BaseModel):
    total_checks: int = 0
    pass_count: int = Field(default=0, alias="pass")
    fail: int = 0
    warning: int = 0

    model_config = {
        "populate_by_name": True,
    }


class MonthlyReportViolationItem(BaseModel):
    check_id: int
    rule_id: int | None = None
    rule_code: str | None = None
    rule_name: str | None = None
    result: str | None = None
    detail: str | None = None
    checked_at: str | None = None


class MonthlyTrendSummary(BaseModel):
    period: str
    previous_period: str
    improved: int = 0
    worsened: int = 0
    unchanged: int = 0


class MonthlyReportResponse(BaseModel):
    fund_id: int
    fund_name: str
    period: str
    generated_at: str
    summary: MonthlyReportSummary
    violations: list[MonthlyReportViolationItem] = Field(default_factory=list)
    recurring_patterns: list[RecurringViolationItem] = Field(default_factory=list)
    remediation_status: RemediationStatsResponse
    recommendations: list[RuleAdjustmentSuggestion] = Field(default_factory=list)
    trend_vs_last_month: MonthlyTrendSummary


class MonthlyReportDownloadPayload(BaseModel):
    filename: str
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
