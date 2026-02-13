from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class BizReportCreate(BaseModel):
    company_id: int
    fund_id: int | None = None
    report_type: Literal["분기보고", "월보고", "일반보고"]
    period: str
    status: str | None = "요청전"
    requested_date: date | None = None
    received_date: date | None = None
    reviewed_date: date | None = None
    analyst_comment: str | None = None
    revenue: float | None = None
    operating_income: float | None = None
    net_income: float | None = None
    total_assets: float | None = None
    total_liabilities: float | None = None
    employees: int | None = None
    memo: str | None = None


class BizReportUpdate(BaseModel):
    fund_id: int | None = None
    report_type: str | None = None
    period: str | None = None
    status: str | None = None
    requested_date: date | None = None
    received_date: date | None = None
    reviewed_date: date | None = None
    analyst_comment: str | None = None
    revenue: float | None = None
    operating_income: float | None = None
    net_income: float | None = None
    total_assets: float | None = None
    total_liabilities: float | None = None
    employees: int | None = None
    memo: str | None = None


class BizReportResponse(BaseModel):
    id: int
    company_id: int
    fund_id: int | None
    report_type: str
    period: str
    status: str
    requested_date: date | None
    received_date: date | None
    reviewed_date: date | None
    analyst_comment: str | None
    revenue: float | None
    operating_income: float | None
    net_income: float | None
    total_assets: float | None
    total_liabilities: float | None
    employees: int | None
    memo: str | None
    created_at: datetime | None
    company_name: str | None = None
    fund_name: str | None = None

    model_config = {"from_attributes": True}
