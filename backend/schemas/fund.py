from pydantic import BaseModel
from datetime import date
from typing import Optional


class LPCreate(BaseModel):
    name: str
    type: str
    commitment: Optional[int] = None
    paid_in: Optional[int] = None
    contact: Optional[str] = None


class LPUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    commitment: Optional[int] = None
    paid_in: Optional[int] = None
    contact: Optional[str] = None


class LPResponse(BaseModel):
    id: int
    fund_id: int
    name: str
    type: str
    commitment: Optional[int] = None
    paid_in: Optional[int] = None
    contact: Optional[str] = None

    model_config = {"from_attributes": True}


class FundCreate(BaseModel):
    name: str
    type: str
    formation_date: Optional[date] = None
    status: str = "active"
    gp: Optional[str] = None
    co_gp: Optional[str] = None
    trustee: Optional[str] = None
    commitment_total: Optional[int] = None
    aum: Optional[int] = None


class FundUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    formation_date: Optional[date] = None
    status: Optional[str] = None
    gp: Optional[str] = None
    co_gp: Optional[str] = None
    trustee: Optional[str] = None
    commitment_total: Optional[int] = None
    aum: Optional[int] = None


class FundListItem(BaseModel):
    id: int
    name: str
    type: str
    status: str
    commitment_total: Optional[int] = None
    aum: Optional[int] = None
    lp_count: int = 0

    model_config = {"from_attributes": True}


class FundResponse(BaseModel):
    id: int
    name: str
    type: str
    formation_date: Optional[date] = None
    status: str
    gp: Optional[str] = None
    co_gp: Optional[str] = None
    trustee: Optional[str] = None
    commitment_total: Optional[int] = None
    aum: Optional[int] = None
    lps: list[LPResponse] = []

    model_config = {"from_attributes": True}
