from pydantic import BaseModel, Field, field_validator
from datetime import date
from typing import Optional


class LPCreate(BaseModel):
    name: str
    type: str
    commitment: Optional[float] = Field(default=None, ge=0)
    paid_in: Optional[float] = Field(default=None, ge=0)
    contact: Optional[str] = None
    business_number: Optional[str] = None
    address: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_lp_create_type(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("type must not be empty")
        return value


class LPUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    commitment: Optional[float] = Field(default=None, ge=0)
    paid_in: Optional[float] = Field(default=None, ge=0)
    contact: Optional[str] = None
    business_number: Optional[str] = None
    address: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_lp_update_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("type must not be empty")
        return value


class LPResponse(BaseModel):
    id: int
    fund_id: int
    name: str
    type: str
    commitment: Optional[float] = Field(default=None, ge=0)
    paid_in: Optional[float] = Field(default=None, ge=0)
    contact: Optional[str] = None
    business_number: Optional[str] = None
    address: Optional[str] = None

    model_config = {"from_attributes": True}


class FundNoticePeriodCreate(BaseModel):
    notice_type: str
    label: str
    business_days: int = Field(ge=0)
    memo: Optional[str] = None


class FundNoticePeriodResponse(BaseModel):
    id: int
    fund_id: int
    notice_type: str
    label: str
    business_days: int
    memo: Optional[str] = None

    model_config = {"from_attributes": True}


class FundKeyTermCreate(BaseModel):
    category: str
    label: str
    value: str
    article_ref: Optional[str] = None


class FundKeyTermResponse(BaseModel):
    id: int
    fund_id: int
    category: str
    label: str
    value: str
    article_ref: Optional[str] = None

    model_config = {"from_attributes": True}


class FundCreate(BaseModel):
    name: str
    type: str
    formation_date: Optional[date] = None
    registration_number: Optional[str] = None
    registration_date: Optional[date] = None
    status: str = "active"
    gp: Optional[str] = None
    fund_manager: Optional[str] = None
    co_gp: Optional[str] = None
    trustee: Optional[str] = None
    commitment_total: Optional[float] = Field(default=None, ge=0)
    gp_commitment: Optional[float] = Field(default=None, ge=0)
    contribution_type: Optional[str] = None
    aum: Optional[float] = Field(default=None, ge=0)
    investment_period_end: Optional[date] = None
    maturity_date: Optional[date] = None
    dissolution_date: Optional[date] = None
    mgmt_fee_rate: Optional[float] = Field(default=None, ge=0)
    performance_fee_rate: Optional[float] = Field(default=None, ge=0)
    hurdle_rate: Optional[float] = Field(default=None, ge=0)
    account_number: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_fund_create_type(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("type must not be empty")
        return value


class FundUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    formation_date: Optional[date] = None
    registration_number: Optional[str] = None
    registration_date: Optional[date] = None
    status: Optional[str] = None
    gp: Optional[str] = None
    fund_manager: Optional[str] = None
    co_gp: Optional[str] = None
    trustee: Optional[str] = None
    commitment_total: Optional[float] = Field(default=None, ge=0)
    gp_commitment: Optional[float] = Field(default=None, ge=0)
    contribution_type: Optional[str] = None
    aum: Optional[float] = Field(default=None, ge=0)
    investment_period_end: Optional[date] = None
    maturity_date: Optional[date] = None
    dissolution_date: Optional[date] = None
    mgmt_fee_rate: Optional[float] = Field(default=None, ge=0)
    performance_fee_rate: Optional[float] = Field(default=None, ge=0)
    hurdle_rate: Optional[float] = Field(default=None, ge=0)
    account_number: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_fund_update_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("type must not be empty")
        return value


class FundListItem(BaseModel):
    id: int
    name: str
    type: str
    status: str
    formation_date: Optional[date] = None
    registration_number: Optional[str] = None
    registration_date: Optional[date] = None
    maturity_date: Optional[date] = None
    dissolution_date: Optional[date] = None
    commitment_total: Optional[float] = Field(default=None, ge=0)
    aum: Optional[float] = Field(default=None, ge=0)
    paid_in_total: Optional[float] = Field(default=None, ge=0)
    lp_count: int = 0
    investment_count: int = 0

    model_config = {"from_attributes": True}


class FundOverviewItem(BaseModel):
    no: int
    id: int
    name: str
    fund_type: str
    fund_manager: Optional[str] = None
    formation_date: Optional[str] = None
    registration_date: Optional[str] = None
    investment_period_end: Optional[str] = None
    investment_period_progress: Optional[float] = None
    maturity_date: Optional[str] = None
    commitment_total: Optional[float] = Field(default=None, ge=0)
    total_paid_in: Optional[float] = Field(default=None, ge=0)
    paid_in_ratio: Optional[float] = None
    gp_commitment: Optional[float] = Field(default=None, ge=0)
    total_invested: Optional[float] = Field(default=None, ge=0)
    uninvested: Optional[float] = None
    investment_assets: Optional[float] = Field(default=None, ge=0)
    company_count: int = 0
    hurdle_rate: Optional[float] = None
    remaining_period: Optional[str] = None


class FundOverviewTotals(BaseModel):
    commitment_total: float = 0
    total_paid_in: float = 0
    gp_commitment: float = 0
    total_invested: float = 0
    uninvested: float = 0
    investment_assets: float = 0
    company_count: int = 0


class FundOverviewResponse(BaseModel):
    reference_date: str
    funds: list[FundOverviewItem]
    totals: FundOverviewTotals


class FundResponse(BaseModel):
    id: int
    name: str
    type: str
    formation_date: Optional[date] = None
    registration_number: Optional[str] = None
    registration_date: Optional[date] = None
    status: str
    gp: Optional[str] = None
    fund_manager: Optional[str] = None
    co_gp: Optional[str] = None
    trustee: Optional[str] = None
    commitment_total: Optional[float] = Field(default=None, ge=0)
    gp_commitment: Optional[float] = Field(default=None, ge=0)
    contribution_type: Optional[str] = None
    aum: Optional[float] = Field(default=None, ge=0)
    investment_period_end: Optional[date] = None
    maturity_date: Optional[date] = None
    dissolution_date: Optional[date] = None
    mgmt_fee_rate: Optional[float] = Field(default=None, ge=0)
    performance_fee_rate: Optional[float] = Field(default=None, ge=0)
    hurdle_rate: Optional[float] = Field(default=None, ge=0)
    account_number: Optional[str] = None
    lps: list[LPResponse] = []
    notice_periods: list[FundNoticePeriodResponse] = []
    key_terms: list[FundKeyTermResponse] = []

    model_config = {"from_attributes": True}
