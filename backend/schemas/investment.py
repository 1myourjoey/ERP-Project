from pydantic import BaseModel, Field
from datetime import date
from typing import Literal, Optional


class PortfolioCompanyCreate(BaseModel):
    name: str
    business_number: Optional[str] = None
    ceo: Optional[str] = None
    address: Optional[str] = None
    industry: Optional[str] = None
    vics_registered: bool = False


class PortfolioCompanyUpdate(BaseModel):
    name: Optional[str] = None
    business_number: Optional[str] = None
    ceo: Optional[str] = None
    address: Optional[str] = None
    industry: Optional[str] = None
    vics_registered: Optional[bool] = None


class PortfolioCompanyResponse(BaseModel):
    id: int
    name: str
    business_number: Optional[str] = None
    ceo: Optional[str] = None
    address: Optional[str] = None
    industry: Optional[str] = None
    vics_registered: bool

    model_config = {"from_attributes": True}


class InvestmentDocumentCreate(BaseModel):
    name: str
    doc_type: Optional[str] = None
    status: Literal["pending", "requested", "reviewing", "collected"] = "pending"
    note: Optional[str] = None
    due_date: Optional[date] = None


class InvestmentDocumentUpdate(BaseModel):
    name: Optional[str] = None
    doc_type: Optional[str] = None
    status: Optional[Literal["pending", "requested", "reviewing", "collected"]] = None
    note: Optional[str] = None
    due_date: Optional[date] = None


class InvestmentDocumentResponse(BaseModel):
    id: int
    investment_id: int
    name: str
    doc_type: Optional[str] = None
    status: Literal["pending", "requested", "reviewing", "collected"]
    note: Optional[str] = None
    due_date: Optional[date] = None

    model_config = {"from_attributes": True}


class InvestmentCreate(BaseModel):
    fund_id: int
    company_id: int
    investment_date: Optional[date] = None
    amount: Optional[float] = Field(default=None, ge=0)
    shares: Optional[int] = Field(default=None, ge=0)
    share_price: Optional[float] = Field(default=None, ge=0)
    valuation: Optional[float] = Field(default=None, ge=0)
    contribution_rate: Optional[str] = None
    instrument: Optional[str] = None
    status: Literal["active", "exited", "written_off"] = "active"


class InvestmentUpdate(BaseModel):
    fund_id: Optional[int] = None
    company_id: Optional[int] = None
    investment_date: Optional[date] = None
    amount: Optional[float] = Field(default=None, ge=0)
    shares: Optional[int] = Field(default=None, ge=0)
    share_price: Optional[float] = Field(default=None, ge=0)
    valuation: Optional[float] = Field(default=None, ge=0)
    contribution_rate: Optional[str] = None
    instrument: Optional[str] = None
    status: Optional[Literal["active", "exited", "written_off"]] = None


class InvestmentListItem(BaseModel):
    id: int
    fund_id: int
    company_id: int
    fund_name: str
    company_name: str
    investment_date: Optional[date] = None
    amount: Optional[float] = Field(default=None, ge=0)
    instrument: Optional[str] = None
    status: Literal["active", "exited", "written_off"]


class InvestmentResponse(BaseModel):
    id: int
    fund_id: int
    company_id: int
    investment_date: Optional[date] = None
    amount: Optional[float] = Field(default=None, ge=0)
    shares: Optional[int] = Field(default=None, ge=0)
    share_price: Optional[float] = Field(default=None, ge=0)
    valuation: Optional[float] = Field(default=None, ge=0)
    contribution_rate: Optional[str] = None
    instrument: Optional[str] = None
    status: Literal["active", "exited", "written_off"]
    documents: list[InvestmentDocumentResponse] = []

    model_config = {"from_attributes": True}
