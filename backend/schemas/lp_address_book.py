from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from services.lp_types import coerce_lp_type, normalize_lp_type


class LPAddressBookBase(BaseModel):
    name: str
    type: str
    contact: Optional[str] = None
    business_number: Optional[str] = None
    address: Optional[str] = None
    memo: Optional[str] = None
    gp_entity_id: Optional[int] = None
    is_active: int = 1

    @field_validator("type")
    @classmethod
    def validate_lp_address_book_type(cls, value: str) -> str:
        return coerce_lp_type(value)


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

    @field_validator("type")
    @classmethod
    def validate_lp_address_book_update_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return coerce_lp_type(value)


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
    total_commitment: float = 0
    total_paid_in: float = 0
    outstanding_balance: float = 0
    paid_in_ratio: float = 0
    related_lps_count: int = 0
    sync_suggestion: bool = False
    message: Optional[str] = None

    @field_validator("type")
    @classmethod
    def normalize_lp_address_book_response_type(cls, value: str) -> str:
        return normalize_lp_type(value) or value

    model_config = {"from_attributes": True}
