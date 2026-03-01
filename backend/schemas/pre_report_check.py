from datetime import datetime

from pydantic import BaseModel, Field


class PreReportFinding(BaseModel):
    type: str
    severity: str
    title: str
    detail: str
    reference: str | None = None
    rule_code: str | None = None
    difference: float | None = None
    source: str | None = None

    model_config = {"extra": "allow"}


class PreReportCheckResponse(BaseModel):
    id: int
    report_id: int
    fund_id: int
    checked_at: datetime | None = None
    overall_status: str

    legal_check: list[PreReportFinding] = Field(default_factory=list)
    cross_check: list[PreReportFinding] = Field(default_factory=list)
    guideline_check: list[PreReportFinding] = Field(default_factory=list)
    contract_check: list[PreReportFinding] = Field(default_factory=list)

    total_errors: int = 0
    total_warnings: int = 0
    total_info: int = 0
    tasks_created: int = 0
    created_by: int | None = None
