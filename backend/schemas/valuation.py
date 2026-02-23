from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class ValuationCreate(BaseModel):
    investment_id: int
    fund_id: int
    company_id: int
    as_of_date: date
    evaluator: Optional[str] = None
    method: Optional[str] = None
    instrument: Optional[str] = None
    value: float
    prev_value: Optional[float] = None
    change_amount: Optional[float] = None
    change_pct: Optional[float] = None
    basis: Optional[str] = None

    valuation_method: Optional[str] = None
    instrument_type: Optional[str] = None
    conversion_price: Optional[float] = None
    exercise_price: Optional[float] = None
    liquidation_pref: Optional[float] = None
    participation_cap: Optional[float] = None
    fair_value_per_share: Optional[float] = None
    total_fair_value: Optional[float] = None
    book_value: Optional[float] = None
    unrealized_gain_loss: Optional[float] = None
    valuation_date: Optional[date] = None


class ValuationUpdate(BaseModel):
    investment_id: Optional[int] = None
    fund_id: Optional[int] = None
    company_id: Optional[int] = None
    as_of_date: Optional[date] = None
    evaluator: Optional[str] = None
    method: Optional[str] = None
    instrument: Optional[str] = None
    value: Optional[float] = None
    prev_value: Optional[float] = None
    change_amount: Optional[float] = None
    change_pct: Optional[float] = None
    basis: Optional[str] = None

    valuation_method: Optional[str] = None
    instrument_type: Optional[str] = None
    conversion_price: Optional[float] = None
    exercise_price: Optional[float] = None
    liquidation_pref: Optional[float] = None
    participation_cap: Optional[float] = None
    fair_value_per_share: Optional[float] = None
    total_fair_value: Optional[float] = None
    book_value: Optional[float] = None
    unrealized_gain_loss: Optional[float] = None
    valuation_date: Optional[date] = None


class ValuationResponse(BaseModel):
    id: int
    investment_id: int
    fund_id: int
    company_id: int
    as_of_date: date
    evaluator: Optional[str] = None
    method: Optional[str] = None
    instrument: Optional[str] = None
    value: float
    prev_value: Optional[float] = None
    change_amount: Optional[float] = None
    change_pct: Optional[float] = None
    basis: Optional[str] = None
    valuation_method: Optional[str] = None
    instrument_type: Optional[str] = None
    conversion_price: Optional[float] = None
    exercise_price: Optional[float] = None
    liquidation_pref: Optional[float] = None
    participation_cap: Optional[float] = None
    fair_value_per_share: Optional[float] = None
    total_fair_value: Optional[float] = None
    book_value: Optional[float] = None
    unrealized_gain_loss: Optional[float] = None
    valuation_date: Optional[date] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ValuationListItem(ValuationResponse):
    fund_name: str = ""
    company_name: str = ""


class ValuationNavSummaryItem(BaseModel):
    fund_id: int
    fund_name: str
    total_nav: float
    total_unrealized_gain_loss: float
    valuation_count: int


class ValuationHistoryPoint(BaseModel):
    id: int
    as_of_date: date
    valuation_date: Optional[date] = None
    total_fair_value: Optional[float] = None
    book_value: Optional[float] = None
    unrealized_gain_loss: Optional[float] = None
    method: Optional[str] = None
    valuation_method: Optional[str] = None


class ValuationBulkItemCreate(BaseModel):
    investment_id: int
    fund_id: int
    company_id: int
    value: float
    book_value: Optional[float] = None
    total_fair_value: Optional[float] = None
    unrealized_gain_loss: Optional[float] = None
    method: Optional[str] = None
    valuation_method: Optional[str] = None
    instrument: Optional[str] = None
    instrument_type: Optional[str] = None
    basis: Optional[str] = None


class ValuationBulkCreate(BaseModel):
    as_of_date: date
    valuation_date: Optional[date] = None
    evaluator: Optional[str] = None
    items: list[ValuationBulkItemCreate] = Field(default_factory=list)


class ValuationDashboardItem(BaseModel):
    investment_id: int
    company_name: str
    instrument: Optional[str] = None
    instrument_type: Optional[str] = None
    book_value: Optional[float] = None
    total_fair_value: Optional[float] = None
    unrealized_gain_loss: Optional[float] = None
    valuation_date: Optional[date] = None
    method: Optional[str] = None
    valuation_method: Optional[str] = None


class ValuationDashboardResponse(BaseModel):
    total_nav: float
    total_unrealized_gain_loss: float
    valuation_count: int
    unvalued_count: int
    items: list[ValuationDashboardItem] = Field(default_factory=list)
