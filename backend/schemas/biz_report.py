from datetime import date, datetime

from pydantic import BaseModel, Field


class BizReportBase(BaseModel):
    fund_id: int
    report_year: int = Field(ge=2000, le=2100)
    status: str = "작성중"
    submission_date: date | None = None

    total_commitment: float | None = None
    total_paid_in: float | None = None
    total_invested: float | None = None
    total_distributed: float | None = None
    fund_nav: float | None = None
    irr: float | None = None
    tvpi: float | None = None
    dpi: float | None = None

    market_overview: str | None = None
    portfolio_summary: str | None = None
    investment_activity: str | None = None
    key_issues: str | None = None
    outlook: str | None = None
    memo: str | None = None


class BizReportCreate(BizReportBase):
    pass


class BizReportUpdate(BaseModel):
    fund_id: int | None = None
    report_year: int | None = Field(default=None, ge=2000, le=2100)
    status: str | None = None
    submission_date: date | None = None

    total_commitment: float | None = None
    total_paid_in: float | None = None
    total_invested: float | None = None
    total_distributed: float | None = None
    fund_nav: float | None = None
    irr: float | None = None
    tvpi: float | None = None
    dpi: float | None = None

    market_overview: str | None = None
    portfolio_summary: str | None = None
    investment_activity: str | None = None
    key_issues: str | None = None
    outlook: str | None = None
    memo: str | None = None


class BizReportResponse(BizReportBase):
    id: int
    created_at: datetime | None = None
    fund_name: str | None = None

    model_config = {"from_attributes": True}
