from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import date
from typing import Literal, Optional


class LPCreate(BaseModel):
    address_book_id: Optional[int] = None
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

    @model_validator(mode="after")
    def validate_lp_create_paid_in(self):
        if (
            self.commitment is not None
            and self.paid_in is not None
            and self.paid_in > self.commitment
        ):
            raise ValueError("paid_in must be less than or equal to commitment")
        return self


class LPUpdate(BaseModel):
    address_book_id: Optional[int] = None
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

    @model_validator(mode="after")
    def validate_lp_update_paid_in(self):
        if (
            self.commitment is not None
            and self.paid_in is not None
            and self.paid_in > self.commitment
        ):
            raise ValueError("paid_in must be less than or equal to commitment")
        return self


class LPResponse(BaseModel):
    id: int
    fund_id: int
    address_book_id: Optional[int] = None
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
    day_basis: str = "business"
    memo: Optional[str] = None

    @field_validator("day_basis")
    @classmethod
    def validate_day_basis(cls, value: str) -> str:
        normalized = (value or "").strip().lower()
        if normalized not in {"business", "calendar"}:
            raise ValueError("day_basis must be one of: business, calendar")
        return normalized


class FundNoticePeriodResponse(BaseModel):
    id: int
    fund_id: int
    notice_type: str
    label: str
    business_days: int
    day_basis: str = "business"
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


class FundMigrationErrorItem(BaseModel):
    row: int
    column: str
    reason: str


class FundMigrationValidateResponse(BaseModel):
    success: bool
    fund_rows: int
    lp_rows: int
    errors: list[FundMigrationErrorItem] = Field(default_factory=list)


class FundMigrationImportResponse(BaseModel):
    success: bool
    mode: Literal["insert", "upsert"]
    fund_rows: int
    lp_rows: int
    created_funds: int = 0
    updated_funds: int = 0
    created_lps: int = 0
    updated_lps: int = 0
    synced_address_books: int = 0
    errors: list[FundMigrationErrorItem] = Field(default_factory=list)
    validation: FundMigrationValidateResponse


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
    gp_commitment_amount: Optional[float] = Field(default=None, ge=0)
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

    @model_validator(mode="after")
    def normalize_gp_commitment_alias(self):
        if self.gp_commitment is None and self.gp_commitment_amount is not None:
            self.gp_commitment = self.gp_commitment_amount
        return self


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
    gp_commitment_amount: Optional[float] = Field(default=None, ge=0)
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

    @model_validator(mode="after")
    def normalize_gp_commitment_alias(self):
        if self.gp_commitment is None and self.gp_commitment_amount is not None:
            self.gp_commitment = self.gp_commitment_amount
        return self


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


class FundFormationWorkflowAddRequest(BaseModel):
    template_category_or_name: str
    template_id: Optional[int] = Field(default=None, ge=1)
    trigger_date: Optional[date] = None

    @field_validator("template_category_or_name")
    @classmethod
    def validate_template_category_or_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("template_category_or_name must not be empty")
        return normalized


class FundFormationWorkflowAddResponse(BaseModel):
    instance_id: int
    workflow_id: int
    workflow_name: str
    formation_slot: str
    instance_name: str
    status: str
    trigger_date: date
    fund_id: int
