from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class GPFinancialCreate(BaseModel):
    gp_entity_id: int
    fiscal_year_end: date
    total_assets: Optional[float] = Field(default=None, ge=0)
    current_assets: Optional[float] = Field(default=None, ge=0)
    total_liabilities: Optional[float] = Field(default=None, ge=0)
    current_liabilities: Optional[float] = Field(default=None, ge=0)
    total_equity: Optional[float] = Field(default=None, ge=0)
    paid_in_capital: Optional[float] = Field(default=None, ge=0)
    revenue: Optional[float] = None
    operating_income: Optional[float] = None
    net_income: Optional[float] = None


class GPFinancialUpdate(BaseModel):
    fiscal_year_end: Optional[date] = None
    total_assets: Optional[float] = Field(default=None, ge=0)
    current_assets: Optional[float] = Field(default=None, ge=0)
    total_liabilities: Optional[float] = Field(default=None, ge=0)
    current_liabilities: Optional[float] = Field(default=None, ge=0)
    total_equity: Optional[float] = Field(default=None, ge=0)
    paid_in_capital: Optional[float] = Field(default=None, ge=0)
    revenue: Optional[float] = None
    operating_income: Optional[float] = None
    net_income: Optional[float] = None


class GPFinancialResponse(GPFinancialCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GPShareholderCreate(BaseModel):
    gp_entity_id: int
    snapshot_date: date
    name: str
    shares: Optional[int] = Field(default=None, ge=0)
    acquisition_amount: Optional[float] = Field(default=None, ge=0)
    ownership_pct: Optional[float] = Field(default=None, ge=0)
    is_largest: bool = False
    relationship: Optional[str] = None
    memo: Optional[str] = None


class GPShareholderUpdate(BaseModel):
    snapshot_date: Optional[date] = None
    name: Optional[str] = None
    shares: Optional[int] = Field(default=None, ge=0)
    acquisition_amount: Optional[float] = Field(default=None, ge=0)
    ownership_pct: Optional[float] = Field(default=None, ge=0)
    is_largest: Optional[bool] = None
    relationship: Optional[str] = None
    memo: Optional[str] = None


class GPShareholderResponse(GPShareholderCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FundManagerCreate(BaseModel):
    gp_entity_id: Optional[int] = None
    name: str
    birth_date: Optional[date] = None
    nationality: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    join_date: Optional[date] = None
    resign_date: Optional[date] = None
    is_core: bool = False
    is_representative: bool = False


class FundManagerUpdate(BaseModel):
    gp_entity_id: Optional[int] = None
    name: Optional[str] = None
    birth_date: Optional[date] = None
    nationality: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    join_date: Optional[date] = None
    resign_date: Optional[date] = None
    is_core: Optional[bool] = None
    is_representative: Optional[bool] = None


class FundManagerResponse(FundManagerCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ManagerCareerCreate(BaseModel):
    fund_manager_id: int
    company_name: str
    company_type: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    main_task: Optional[str] = None
    is_investment_exp: bool = False
    employment_type: Optional[str] = None


class ManagerCareerUpdate(BaseModel):
    company_name: Optional[str] = None
    company_type: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    main_task: Optional[str] = None
    is_investment_exp: Optional[bool] = None
    employment_type: Optional[str] = None


class ManagerCareerResponse(ManagerCareerCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ManagerEducationCreate(BaseModel):
    fund_manager_id: int
    school_name: str
    major: Optional[str] = None
    degree: Optional[str] = None
    admission_date: Optional[date] = None
    graduation_date: Optional[date] = None
    country: Optional[str] = None


class ManagerEducationUpdate(BaseModel):
    school_name: Optional[str] = None
    major: Optional[str] = None
    degree: Optional[str] = None
    admission_date: Optional[date] = None
    graduation_date: Optional[date] = None
    country: Optional[str] = None


class ManagerEducationResponse(ManagerEducationCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ManagerAwardCreate(BaseModel):
    fund_manager_id: int
    award_date: Optional[date] = None
    award_name: str
    organization: Optional[str] = None
    memo: Optional[str] = None


class ManagerAwardUpdate(BaseModel):
    award_date: Optional[date] = None
    award_name: Optional[str] = None
    organization: Optional[str] = None
    memo: Optional[str] = None


class ManagerAwardResponse(ManagerAwardCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ManagerInvestmentCreate(BaseModel):
    fund_manager_id: int
    investment_id: Optional[int] = None
    fund_id: Optional[int] = None
    source_company_name: Optional[str] = None
    fund_name: Optional[str] = None
    company_name: Optional[str] = None
    investment_date: Optional[date] = None
    instrument: Optional[str] = None
    amount: Optional[float] = Field(default=None, ge=0)
    exit_date: Optional[date] = None
    exit_amount: Optional[float] = Field(default=None, ge=0)
    role: Optional[str] = None
    discovery_contrib: Optional[float] = Field(default=None, ge=0)
    review_contrib: Optional[float] = Field(default=None, ge=0)
    contrib_rate: Optional[float] = Field(default=None, ge=0)
    is_current_company: bool = False


class ManagerInvestmentUpdate(BaseModel):
    investment_id: Optional[int] = None
    fund_id: Optional[int] = None
    source_company_name: Optional[str] = None
    fund_name: Optional[str] = None
    company_name: Optional[str] = None
    investment_date: Optional[date] = None
    instrument: Optional[str] = None
    amount: Optional[float] = Field(default=None, ge=0)
    exit_date: Optional[date] = None
    exit_amount: Optional[float] = Field(default=None, ge=0)
    role: Optional[str] = None
    discovery_contrib: Optional[float] = Field(default=None, ge=0)
    review_contrib: Optional[float] = Field(default=None, ge=0)
    contrib_rate: Optional[float] = Field(default=None, ge=0)
    is_current_company: Optional[bool] = None


class ManagerInvestmentResponse(ManagerInvestmentCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FundSubscriptionCreate(BaseModel):
    fund_id: int
    subscription_type: str
    subscription_date: date
    result: Optional[str] = None
    target_irr: Optional[float] = Field(default=None, ge=0)
    target_commitment: Optional[float] = Field(default=None, ge=0)
    actual_commitment: Optional[float] = Field(default=None, ge=0)
    memo: Optional[str] = None


class FundSubscriptionUpdate(BaseModel):
    subscription_type: Optional[str] = None
    subscription_date: Optional[date] = None
    result: Optional[str] = None
    target_irr: Optional[float] = Field(default=None, ge=0)
    target_commitment: Optional[float] = Field(default=None, ge=0)
    actual_commitment: Optional[float] = Field(default=None, ge=0)
    memo: Optional[str] = None


class FundSubscriptionResponse(FundSubscriptionCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FundManagerHistoryCreate(BaseModel):
    fund_id: int
    fund_manager_id: int
    change_date: date
    change_type: str
    role_before: Optional[str] = None
    role_after: Optional[str] = None
    memo: Optional[str] = None


class FundManagerHistoryUpdate(BaseModel):
    change_date: Optional[date] = None
    change_type: Optional[str] = None
    role_before: Optional[str] = None
    role_after: Optional[str] = None
    memo: Optional[str] = None


class FundManagerHistoryResponse(FundManagerHistoryCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ProposalVersionCreate(BaseModel):
    template_type: str
    gp_entity_id: Optional[int] = None
    fund_ids: list[int] = Field(default_factory=list)
    as_of_date: date


class ProposalVersionResponse(BaseModel):
    id: int
    template_type: str
    gp_entity_id: Optional[int] = None
    fund_ids: list[int] = Field(default_factory=list)
    as_of_date: date
    status: str
    render_snapshot_json: Optional[str] = None
    generated_filename: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class ProposalExportRequest(BaseModel):
    template_type: str
    gp_entity_id: Optional[int] = None
    fund_ids: list[int] = Field(default_factory=list)
    as_of_date: date
    version_id: Optional[int] = None


class ProposalWorkspaceMetric(BaseModel):
    label: str
    value: str
    hint: Optional[str] = None


class ProposalWorkspaceSummary(BaseModel):
    selected_fund_count: int
    selected_manager_count: int
    total_commitment: float = 0
    total_paid_in: float = 0
    total_invested: float = 0
    total_exit_amount: float = 0


class ProposalWorkspaceGPEntity(BaseModel):
    id: int
    name: str
    entity_type: str
    business_number: Optional[str] = None
    registration_number: Optional[str] = None
    representative: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    founding_date: Optional[date] = None
    license_date: Optional[date] = None
    capital: Optional[float] = None
    total_employees: Optional[int] = None
    fund_manager_count: Optional[int] = None
    paid_in_capital: Optional[float] = None
    notes: Optional[str] = None
    is_primary: int

    model_config = {"from_attributes": True}


class ProposalWorkspaceFund(BaseModel):
    id: int
    name: str
    type: str
    status: str
    gp_entity_id: Optional[int] = None
    gp: Optional[str] = None
    fund_manager: Optional[str] = None
    formation_date: Optional[date] = None
    investment_period_end: Optional[date] = None
    maturity_date: Optional[date] = None
    commitment_total: Optional[float] = None
    paid_in_total: float = 0
    invested_total: float = 0
    exit_total: float = 0
    nav_total: float = 0


class ProposalReadinessResponse(BaseModel):
    as_of_date: date
    template_type: str
    is_ready: bool
    missing_items: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ProposalWorkspaceResponse(BaseModel):
    template_type: str
    as_of_date: date
    gp_entities: list[ProposalWorkspaceGPEntity] = Field(default_factory=list)
    available_funds: list[ProposalWorkspaceFund] = Field(default_factory=list)
    funds: list[ProposalWorkspaceFund] = Field(default_factory=list)
    selected_gp_entity: Optional[ProposalWorkspaceGPEntity] = None
    selected_fund_ids: list[int] = Field(default_factory=list)
    summary: ProposalWorkspaceSummary
    metrics: list[ProposalWorkspaceMetric] = Field(default_factory=list)
    gp_financials: list[GPFinancialResponse] = Field(default_factory=list)
    gp_shareholders: list[GPShareholderResponse] = Field(default_factory=list)
    fund_managers: list[FundManagerResponse] = Field(default_factory=list)
    manager_careers: list[ManagerCareerResponse] = Field(default_factory=list)
    manager_educations: list[ManagerEducationResponse] = Field(default_factory=list)
    manager_awards: list[ManagerAwardResponse] = Field(default_factory=list)
    manager_investments: list[ManagerInvestmentResponse] = Field(default_factory=list)
    fund_manager_histories: list[FundManagerHistoryResponse] = Field(default_factory=list)
    fund_subscriptions: list[FundSubscriptionResponse] = Field(default_factory=list)
    readiness: ProposalReadinessResponse
    version: Optional[ProposalVersionResponse] = None
    render_snapshot: Optional[dict[str, Any]] = None


class ProposalApplicationCreate(BaseModel):
    title: str
    template_type: str
    institution_type: Optional[str] = None
    gp_entity_id: Optional[int] = None
    as_of_date: date
    fund_ids: list[int] = Field(default_factory=list)


class ProposalApplicationUpdate(BaseModel):
    title: Optional[str] = None
    template_type: Optional[str] = None
    institution_type: Optional[str] = None
    gp_entity_id: Optional[int] = None
    as_of_date: Optional[date] = None
    status: Optional[str] = None
    fund_ids: Optional[list[int]] = None


class ProposalApplicationResponse(BaseModel):
    id: int
    title: str
    template_type: str
    institution_type: Optional[str] = None
    gp_entity_id: Optional[int] = None
    gp_entity_name: Optional[str] = None
    as_of_date: date
    status: str
    submitted_at: Optional[datetime] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    fund_ids: list[int] = Field(default_factory=list)
    fund_count: int = 0


class ProposalApplicationDetailResponse(ProposalApplicationResponse):
    readiness: ProposalReadinessResponse


class ProposalSheetColumn(BaseModel):
    key: str
    label: str


class ProposalSheetDescriptor(BaseModel):
    code: str
    title: str
    kind: str
    description: Optional[str] = None
    row_count: int = 0
    field_count: int = 0
    has_overrides: bool = False
    empty_value_count: int = 0


class ProposalSheetField(BaseModel):
    key: str
    label: str
    default_value: Any = None
    final_value: Any = None
    source: str
    is_overridden: bool = False


class ProposalSheetRow(BaseModel):
    row_key: str
    default_cells: dict[str, Any] = Field(default_factory=dict)
    final_cells: dict[str, Any] = Field(default_factory=dict)
    source: str
    is_manual: bool = False
    is_overridden: bool = False


class ProposalSheetView(BaseModel):
    application_id: int
    sheet_code: str
    title: str
    kind: str
    description: Optional[str] = None
    columns: list[ProposalSheetColumn] = Field(default_factory=list)
    fields: list[ProposalSheetField] = Field(default_factory=list)
    rows: list[ProposalSheetRow] = Field(default_factory=list)
    copy_text: str
    download_filename: str
    is_frozen: bool = False


class ProposalFieldOverrideInput(BaseModel):
    field_key: str
    value: Any = None
    source_note: Optional[str] = None


class ProposalFieldOverrideBulkInput(BaseModel):
    sheet_code: str
    overrides: list[ProposalFieldOverrideInput] = Field(default_factory=list)


class ProposalRowOverrideInput(BaseModel):
    row_key: str
    row_mode: str = "override"
    row_payload: dict[str, Any] = Field(default_factory=dict)
    source_note: Optional[str] = None


class ProposalRowOverrideBulkInput(BaseModel):
    sheet_code: str
    overrides: list[ProposalRowOverrideInput] = Field(default_factory=list)
