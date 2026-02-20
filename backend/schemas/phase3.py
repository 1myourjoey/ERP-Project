from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class CapitalCallCreate(BaseModel):
    fund_id: int
    call_date: date
    call_type: str
    total_amount: float = Field(default=0, ge=0)
    request_percent: Optional[float] = None
    memo: Optional[str] = None


class CapitalCallUpdate(BaseModel):
    fund_id: Optional[int] = None
    call_date: Optional[date] = None
    call_type: Optional[str] = None
    total_amount: Optional[float] = Field(default=None, ge=0)
    request_percent: Optional[float] = None
    memo: Optional[str] = None


class CapitalCallResponse(BaseModel):
    id: int
    fund_id: int
    linked_workflow_instance_id: Optional[int] = None
    linked_workflow_name: Optional[str] = None
    linked_workflow_status: Optional[str] = None
    call_date: date
    call_type: str
    total_amount: float
    request_percent: Optional[float] = None
    memo: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CapitalCallListItem(CapitalCallResponse):
    fund_name: str = ""


class CapitalCallItemCreate(BaseModel):
    lp_id: int
    amount: int = Field(gt=0)
    paid: bool = False
    paid_date: Optional[date] = None
    memo: Optional[str] = None


class CapitalCallBatchCreate(BaseModel):
    fund_id: int
    call_date: date
    call_type: str
    total_amount: float = Field(default=0, ge=0)
    request_percent: Optional[float] = None
    memo: Optional[str] = None
    create_workflow: bool = True
    items: list[CapitalCallItemCreate]

    @field_validator("items")
    @classmethod
    def validate_items_not_empty(cls, value: list[CapitalCallItemCreate]) -> list[CapitalCallItemCreate]:
        if not value:
            raise ValueError("items must not be empty")
        return value


class CapitalCallItemUpdate(BaseModel):
    lp_id: Optional[int] = None
    amount: Optional[int] = Field(default=None, gt=0)
    paid: Optional[bool] = None
    paid_date: Optional[date] = None
    memo: Optional[str] = None
    sync_workflow: Optional[bool] = False


class CapitalCallItemResponse(BaseModel):
    id: int
    capital_call_id: int
    lp_id: int
    amount: int
    paid: bool
    paid_date: Optional[date] = None
    memo: Optional[str] = None

    model_config = {"from_attributes": True}


class CapitalCallItemListItem(CapitalCallItemResponse):
    lp_name: str = ""


class CapitalCallSummaryCall(BaseModel):
    id: int
    round: int
    call_date: Optional[str] = None
    call_type: str
    total_amount: float
    request_percent: Optional[float] = None
    paid_count: int
    total_count: int
    paid_amount: float
    latest_paid_date: Optional[str] = None
    is_fully_paid: bool
    paid_on_time: bool
    is_due: bool
    is_overdue_unpaid: bool
    commitment_ratio: float
    memo: Optional[str] = None


class CapitalCallSummaryResponse(BaseModel):
    fund_id: int
    commitment_total: float
    total_paid_in: float
    calls: list[CapitalCallSummaryCall]


class DistributionCreate(BaseModel):
    fund_id: int
    dist_date: date
    dist_type: str
    principal_total: float = 0
    profit_total: float = 0
    performance_fee: int = 0
    memo: Optional[str] = None


class DistributionUpdate(BaseModel):
    fund_id: Optional[int] = None
    dist_date: Optional[date] = None
    dist_type: Optional[str] = None
    principal_total: Optional[float] = None
    profit_total: Optional[float] = None
    performance_fee: Optional[int] = None
    memo: Optional[str] = None


class DistributionResponse(BaseModel):
    id: int
    fund_id: int
    dist_date: date
    dist_type: str
    principal_total: float
    profit_total: float
    performance_fee: int
    memo: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DistributionListItem(DistributionResponse):
    fund_name: str = ""


class DistributionItemCreate(BaseModel):
    lp_id: int
    principal: int = 0
    profit: int = 0


class DistributionItemUpdate(BaseModel):
    lp_id: Optional[int] = None
    principal: Optional[int] = None
    profit: Optional[int] = None


class DistributionItemResponse(BaseModel):
    id: int
    distribution_id: int
    lp_id: int
    principal: int
    profit: int

    model_config = {"from_attributes": True}


class DistributionItemListItem(DistributionItemResponse):
    lp_name: str = ""


class AssemblyCreate(BaseModel):
    fund_id: int
    type: str
    date: date
    agenda: Optional[str] = None
    status: str = "planned"
    minutes_completed: bool = False
    memo: Optional[str] = None


class AssemblyUpdate(BaseModel):
    fund_id: Optional[int] = None
    type: Optional[str] = None
    date: Optional[date] = None
    agenda: Optional[str] = None
    status: Optional[str] = None
    minutes_completed: Optional[bool] = None
    memo: Optional[str] = None


class AssemblyResponse(BaseModel):
    id: int
    fund_id: int
    type: str
    date: date
    agenda: Optional[str] = None
    status: str
    minutes_completed: bool
    memo: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AssemblyListItem(AssemblyResponse):
    fund_name: str = ""


class ExitCommitteeCreate(BaseModel):
    company_id: int
    status: str = "scheduled"
    meeting_date: date
    location: Optional[str] = None
    agenda: Optional[str] = None
    exit_strategy: Optional[str] = None
    analyst_opinion: Optional[str] = None
    vote_result: Optional[str] = None
    performance_fee: Optional[float] = None
    memo: Optional[str] = None


class ExitCommitteeUpdate(BaseModel):
    company_id: Optional[int] = None
    status: Optional[str] = None
    meeting_date: Optional[date] = None
    location: Optional[str] = None
    agenda: Optional[str] = None
    exit_strategy: Optional[str] = None
    analyst_opinion: Optional[str] = None
    vote_result: Optional[str] = None
    performance_fee: Optional[float] = None
    memo: Optional[str] = None


class ExitCommitteeResponse(BaseModel):
    id: int
    company_id: int
    status: str
    meeting_date: date
    location: Optional[str] = None
    agenda: Optional[str] = None
    exit_strategy: Optional[str] = None
    analyst_opinion: Optional[str] = None
    vote_result: Optional[str] = None
    performance_fee: Optional[float] = None
    memo: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExitCommitteeListItem(ExitCommitteeResponse):
    company_name: str = ""


class ExitCommitteeFundCreate(BaseModel):
    fund_id: int
    investment_id: int


class ExitCommitteeFundUpdate(BaseModel):
    fund_id: Optional[int] = None
    investment_id: Optional[int] = None


class ExitCommitteeFundResponse(BaseModel):
    id: int
    exit_committee_id: int
    fund_id: int
    investment_id: int

    model_config = {"from_attributes": True}


class ExitCommitteeFundListItem(ExitCommitteeFundResponse):
    fund_name: str = ""


class ExitTradeCreate(BaseModel):
    exit_committee_id: Optional[int] = None
    investment_id: int
    fund_id: int
    company_id: int
    exit_type: str
    trade_date: date
    amount: int = 0
    shares_sold: Optional[int] = None
    price_per_share: Optional[int] = None
    fees: int = 0
    net_amount: Optional[int] = None
    realized_gain: Optional[int] = None
    memo: Optional[str] = None


class ExitTradeUpdate(BaseModel):
    exit_committee_id: Optional[int] = None
    investment_id: Optional[int] = None
    fund_id: Optional[int] = None
    company_id: Optional[int] = None
    exit_type: Optional[str] = None
    trade_date: Optional[date] = None
    amount: Optional[int] = None
    shares_sold: Optional[int] = None
    price_per_share: Optional[int] = None
    fees: Optional[int] = None
    net_amount: Optional[int] = None
    realized_gain: Optional[int] = None
    memo: Optional[str] = None


class ExitTradeResponse(BaseModel):
    id: int
    exit_committee_id: Optional[int] = None
    investment_id: int
    fund_id: int
    company_id: int
    exit_type: str
    trade_date: date
    amount: int
    shares_sold: Optional[int] = None
    price_per_share: Optional[int] = None
    fees: int
    net_amount: Optional[int] = None
    realized_gain: Optional[int] = None
    memo: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExitTradeListItem(ExitTradeResponse):
    fund_name: str = ""
    company_name: str = ""


class FundPerformanceResponse(BaseModel):
    fund_id: int
    fund_name: str
    paid_in_total: float
    total_invested: float
    total_distributed: float
    residual_value: float
    total_value: float
    irr: Optional[float] = None
    tvpi: Optional[float] = None
    dpi: Optional[float] = None
    rvpi: Optional[float] = None
