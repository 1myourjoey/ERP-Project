from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class ManagementFeeResponse(BaseModel):
    id: int
    fund_id: int
    year: int
    quarter: int
    fee_basis: str
    fee_rate: float
    basis_amount: float
    fee_amount: float
    status: str
    invoice_date: Optional[date] = None
    payment_date: Optional[date] = None
    memo: Optional[str] = None
    created_at: datetime
    fund_name: Optional[str] = None

    model_config = {"from_attributes": True}


class ManagementFeeCalculateRequest(BaseModel):
    fund_id: int
    year: int
    quarter: int = Field(ge=1, le=4)


class ManagementFeeUpdate(BaseModel):
    status: Optional[str] = None
    invoice_date: Optional[date] = None
    payment_date: Optional[date] = None
    memo: Optional[str] = None


class FeeConfigInput(BaseModel):
    mgmt_fee_rate: float = 0.02
    mgmt_fee_basis: str = "commitment"
    mgmt_fee_period: str = "operating"
    liquidation_fee_rate: Optional[float] = None
    liquidation_fee_basis: Optional[str] = None
    hurdle_rate: float = 0.08
    carry_rate: float = 0.20
    catch_up_rate: Optional[float] = None
    clawback: bool = True


class FeeConfigResponse(FeeConfigInput):
    id: int
    fund_id: int

    model_config = {"from_attributes": True}


class PerformanceFeeSimulateRequest(BaseModel):
    fund_id: int
    simulation_date: date
    scenario: str = "base"


class PerformanceFeeSimulationResponse(BaseModel):
    id: int
    fund_id: int
    simulation_date: date
    scenario: str
    total_paid_in: Optional[float] = None
    total_distributed: Optional[float] = None
    hurdle_amount: Optional[float] = None
    excess_profit: Optional[float] = None
    carry_amount: Optional[float] = None
    lp_net_return: Optional[float] = None
    status: str
    created_at: datetime
    fund_name: Optional[str] = None

    model_config = {"from_attributes": True}


class PerformanceFeeSimulationUpdate(BaseModel):
    status: Optional[str] = None


class WaterfallResponse(BaseModel):
    total_distributed: float
    lp_return_of_capital: float
    lp_hurdle_return: float
    gp_catch_up: float
    gp_carry: float
    lp_residual: float
