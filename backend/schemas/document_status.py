from datetime import date

from pydantic import BaseModel
from typing import Optional


class DocumentStatusItem(BaseModel):
    id: int
    investment_id: int
    document_name: str
    document_type: Optional[str] = None
    status: str
    note: Optional[str] = None
    due_date: Optional[date] = None
    days_remaining: Optional[int] = None
    fund_id: int
    fund_name: str
    company_id: int
    company_name: str
