from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


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
    created_at: datetime

    model_config = {"from_attributes": True}


class ValuationListItem(ValuationResponse):
    fund_name: str = ""
    company_name: str = ""
