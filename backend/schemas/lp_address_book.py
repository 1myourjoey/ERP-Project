from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LPAddressBookBase(BaseModel):
    name: str
    type: str
    contact: Optional[str] = None
    business_number: Optional[str] = None
    address: Optional[str] = None
    memo: Optional[str] = None
    gp_entity_id: Optional[int] = None
    is_active: int = 1


class LPAddressBookCreate(LPAddressBookBase):
    pass


class LPAddressBookUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    contact: Optional[str] = None
    business_number: Optional[str] = None
    address: Optional[str] = None
    memo: Optional[str] = None
    gp_entity_id: Optional[int] = None
    is_active: Optional[int] = None


class LPAddressBookRelatedFund(BaseModel):
    fund_id: int
    fund_name: str


class LPAddressBookResponse(BaseModel):
    id: int
    name: str
    type: str
    contact: Optional[str] = None
    business_number: Optional[str] = None
    address: Optional[str] = None
    memo: Optional[str] = None
    gp_entity_id: Optional[int] = None
    is_active: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    related_funds_count: int = 0
    related_funds: list[LPAddressBookRelatedFund] = Field(default_factory=list)

    model_config = {"from_attributes": True}
