from datetime import date
from typing import Optional

from pydantic import BaseModel


class GPEntityCreate(BaseModel):
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
    notes: Optional[str] = None
    is_primary: int = 1


class GPEntityUpdate(BaseModel):
    name: Optional[str] = None
    entity_type: Optional[str] = None
    business_number: Optional[str] = None
    registration_number: Optional[str] = None
    representative: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    founding_date: Optional[date] = None
    license_date: Optional[date] = None
    capital: Optional[float] = None
    notes: Optional[str] = None
    is_primary: Optional[int] = None


class GPEntityResponse(BaseModel):
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
    notes: Optional[str] = None
    is_primary: int

    model_config = {"from_attributes": True}
