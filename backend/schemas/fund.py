from pydantic import BaseModel, Field, field_validator
from datetime import date
from typing import Optional


class LPCreate(BaseModel):
    name: str
    type: str
    commitment: Optional[float] = Field(default=None, ge=0)
    paid_in: Optional[float] = Field(default=None, ge=0)
    contact: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("type must not be empty")
        return value


class LPUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    commitment: Optional[float] = Field(default=None, ge=0)
    paid_in: Optional[float] = Field(default=None, ge=0)
    contact: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("type must not be empty")
        return value


class LPResponse(BaseModel):
    id: int
    fund_id: int
    name: str
    type: str
    commitment: Optional[float] = Field(default=None, ge=0)
    paid_in: Optional[float] = Field(default=None, ge=0)
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
    commitment_total: Optional[float] = Field(default=None, ge=0)
    aum: Optional[float] = Field(default=None, ge=0)

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("type must not be empty")
        return value


class FundUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    formation_date: Optional[date] = None
    status: Optional[str] = None
    gp: Optional[str] = None
    co_gp: Optional[str] = None
    trustee: Optional[str] = None
    commitment_total: Optional[float] = Field(default=None, ge=0)
    aum: Optional[float] = Field(default=None, ge=0)

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("type must not be empty")
        return value


class FundListItem(BaseModel):
    id: int
    name: str
    type: str
    status: str
    commitment_total: Optional[float] = Field(default=None, ge=0)
    aum: Optional[float] = Field(default=None, ge=0)
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
    commitment_total: Optional[float] = Field(default=None, ge=0)
    aum: Optional[float] = Field(default=None, ge=0)
    lps: list[LPResponse] = []

    model_config = {"from_attributes": True}
