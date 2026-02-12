from pydantic import BaseModel
from datetime import date
from typing import Optional


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
    status: str = "pending"
    note: Optional[str] = None


class InvestmentDocumentUpdate(BaseModel):
    name: Optional[str] = None
    doc_type: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None


class InvestmentDocumentResponse(BaseModel):
    id: int
    investment_id: int
    name: str
    doc_type: Optional[str] = None
    status: str
    note: Optional[str] = None

    model_config = {"from_attributes": True}


class InvestmentCreate(BaseModel):
    fund_id: int
    company_id: int
    investment_date: Optional[date] = None
    amount: Optional[int] = None
    shares: Optional[int] = None
    share_price: Optional[int] = None
    valuation: Optional[int] = None
    contribution_rate: Optional[str] = None
    instrument: Optional[str] = None
    status: str = "active"


class InvestmentUpdate(BaseModel):
    fund_id: Optional[int] = None
    company_id: Optional[int] = None
    investment_date: Optional[date] = None
    amount: Optional[int] = None
    shares: Optional[int] = None
    share_price: Optional[int] = None
    valuation: Optional[int] = None
    contribution_rate: Optional[str] = None
    instrument: Optional[str] = None
    status: Optional[str] = None


class InvestmentListItem(BaseModel):
    id: int
    fund_id: int
    company_id: int
    fund_name: str
    company_name: str
    investment_date: Optional[date] = None
    amount: Optional[int] = None
    instrument: Optional[str] = None
    status: str


class InvestmentResponse(BaseModel):
    id: int
    fund_id: int
    company_id: int
    investment_date: Optional[date] = None
    amount: Optional[int] = None
    shares: Optional[int] = None
    share_price: Optional[int] = None
    valuation: Optional[int] = None
    contribution_rate: Optional[str] = None
    instrument: Optional[str] = None
    status: str
    documents: list[InvestmentDocumentResponse] = []

    model_config = {"from_attributes": True}
