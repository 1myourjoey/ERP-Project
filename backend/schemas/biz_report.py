from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class BizReportBase(BaseModel):
    fund_id: int
    report_year: int = Field(ge=2000, le=2100)
    status: str = "작성중"
    submission_date: Optional[date] = None

    total_commitment: Optional[float] = None
    total_paid_in: Optional[float] = None
    total_invested: Optional[float] = None
    total_distributed: Optional[float] = None
    fund_nav: Optional[float] = None
    irr: Optional[float] = None
    tvpi: Optional[float] = None
    dpi: Optional[float] = None

    market_overview: Optional[str] = None
    portfolio_summary: Optional[str] = None
    investment_activity: Optional[str] = None
    key_issues: Optional[str] = None
    outlook: Optional[str] = None
    memo: Optional[str] = None


class BizReportCreate(BizReportBase):
    pass


class BizReportUpdate(BaseModel):
    fund_id: Optional[int] = None
    report_year: Optional[int] = Field(default=None, ge=2000, le=2100)
    status: Optional[str] = None
    submission_date: Optional[date] = None

    total_commitment: Optional[float] = None
    total_paid_in: Optional[float] = None
    total_invested: Optional[float] = None
    total_distributed: Optional[float] = None
    fund_nav: Optional[float] = None
    irr: Optional[float] = None
    tvpi: Optional[float] = None
    dpi: Optional[float] = None

    market_overview: Optional[str] = None
    portfolio_summary: Optional[str] = None
    investment_activity: Optional[str] = None
    key_issues: Optional[str] = None
    outlook: Optional[str] = None
    memo: Optional[str] = None


class BizReportResponse(BizReportBase):
    id: int
    created_at: Optional[datetime] = None
    fund_name: Optional[str] = None

    model_config = {"from_attributes": True}


class BizReportTemplateCreate(BaseModel):
    name: str
    report_type: str
    required_fields: Optional[str] = None
    template_file_id: Optional[int] = None
    instructions: Optional[str] = None


class BizReportTemplateResponse(BizReportTemplateCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class BizReportRequestCreate(BaseModel):
    investment_id: int
    request_date: Optional[date] = None
    deadline: Optional[date] = None
    status: str = "미요청"
    revenue: Optional[float] = None
    operating_income: Optional[float] = None
    net_income: Optional[float] = None
    total_assets: Optional[float] = None
    total_equity: Optional[float] = None
    cash: Optional[float] = None
    employees: Optional[int] = None
    prev_revenue: Optional[float] = None
    prev_operating_income: Optional[float] = None
    prev_net_income: Optional[float] = None
    comment: Optional[str] = None
    reviewer_comment: Optional[str] = None
    risk_flag: Optional[str] = None


class BizReportRequestUpdate(BaseModel):
    request_date: Optional[date] = None
    deadline: Optional[date] = None
    status: Optional[str] = None
    revenue: Optional[float] = None
    operating_income: Optional[float] = None
    net_income: Optional[float] = None
    total_assets: Optional[float] = None
    total_equity: Optional[float] = None
    cash: Optional[float] = None
    employees: Optional[int] = None
    prev_revenue: Optional[float] = None
    prev_operating_income: Optional[float] = None
    prev_net_income: Optional[float] = None
    comment: Optional[str] = None
    reviewer_comment: Optional[str] = None
    risk_flag: Optional[str] = None


class BizReportRequestResponse(BaseModel):
    id: int
    biz_report_id: int
    investment_id: int
    investment_name: Optional[str] = None
    request_date: Optional[date] = None
    deadline: Optional[date] = None
    status: str
    revenue: Optional[float] = None
    operating_income: Optional[float] = None
    net_income: Optional[float] = None
    total_assets: Optional[float] = None
    total_equity: Optional[float] = None
    cash: Optional[float] = None
    employees: Optional[int] = None
    prev_revenue: Optional[float] = None
    prev_operating_income: Optional[float] = None
    prev_net_income: Optional[float] = None
    comment: Optional[str] = None
    reviewer_comment: Optional[str] = None
    risk_flag: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BizReportAnomalyResponse(BaseModel):
    id: int
    request_id: int
    anomaly_type: str
    severity: str
    detail: Optional[str] = None
    acknowledged: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class BizReportCommentDiffResponse(BaseModel):
    current_comment: Optional[str] = None
    previous_comment: Optional[str] = None
    changed: bool


class BizReportMatrixCell(BaseModel):
    quarter: str
    status: str
    report_id: Optional[int] = None


class BizReportMatrixRow(BaseModel):
    fund_id: int
    fund_name: str
    cells: list[BizReportMatrixCell]


class BizReportMatrixResponse(BaseModel):
    rows: list[BizReportMatrixRow]


class BizReportGenerationResponse(BaseModel):
    filename: str
    content_type: str
    base64_data: str
