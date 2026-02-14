from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class TransactionCreate(BaseModel):
    investment_id: int
    fund_id: int
    company_id: int
    transaction_date: date
    type: str
    amount: float
    shares_change: Optional[int] = None
    balance_before: Optional[float] = None
    balance_after: Optional[float] = None
    realized_gain: Optional[float] = None
    cumulative_gain: Optional[float] = None
    memo: Optional[str] = None


class TransactionUpdate(BaseModel):
    investment_id: Optional[int] = None
    fund_id: Optional[int] = None
    company_id: Optional[int] = None
    transaction_date: Optional[date] = None
    type: Optional[str] = None
    amount: Optional[float] = None
    shares_change: Optional[int] = None
    balance_before: Optional[float] = None
    balance_after: Optional[float] = None
    realized_gain: Optional[float] = None
    cumulative_gain: Optional[float] = None
    memo: Optional[str] = None


class TransactionResponse(BaseModel):
    id: int
    investment_id: int
    fund_id: int
    company_id: int
    transaction_date: date
    type: str
    amount: float
    shares_change: Optional[int] = None
    balance_before: Optional[float] = None
    balance_after: Optional[float] = None
    realized_gain: Optional[float] = None
    cumulative_gain: Optional[float] = None
    memo: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionListItem(TransactionResponse):
    fund_name: str = ""
    company_name: str = ""
