from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from services.lp_types import coerce_lp_type, normalize_lp_type


class LPTransferCreate(BaseModel):
    from_lp_id: int
    to_lp_id: Optional[int] = None
    to_lp_name: Optional[str] = None
    to_lp_type: Optional[str] = None
    to_lp_business_number: Optional[str] = None
    to_lp_address: Optional[str] = None
    to_lp_contact: Optional[str] = None
    transfer_amount: int = Field(gt=0)
    transfer_date: Optional[date] = None
    notes: Optional[str] = None

    @field_validator("to_lp_type")
    @classmethod
    def validate_to_lp_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return coerce_lp_type(value)


class LPTransferUpdate(BaseModel):
    status: Optional[str] = None
    transfer_date: Optional[date] = None
    notes: Optional[str] = None


class LPTransferCompleteRequest(BaseModel):
    notes: Optional[str] = None
    transfer_date: Optional[date] = None


class LPTransferResponse(BaseModel):
    id: int
    fund_id: int
    from_lp_id: int
    from_lp_name: Optional[str] = None
    to_lp_id: Optional[int] = None
    to_lp_name: Optional[str] = None
    to_lp_type: Optional[str] = None
    to_lp_business_number: Optional[str] = None
    to_lp_address: Optional[str] = None
    to_lp_contact: Optional[str] = None
    transfer_amount: int
    transfer_date: Optional[date] = None
    status: str
    workflow_instance_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: Optional[date] = None

    @field_validator("to_lp_type")
    @classmethod
    def normalize_to_lp_type(cls, value: Optional[str]) -> Optional[str]:
        return normalize_lp_type(value)

    model_config = {"from_attributes": True}
