from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


VALID_CONTRIBUTION_SOURCES = {"manual", "capital_call", "migration"}


class LPContributionCreate(BaseModel):
    """수동 납입 이력 생성(기존 데이터 이전 포함)."""

    fund_id: int
    lp_id: int
    due_date: date
    amount: float = Field(gt=0)
    round_no: Optional[int] = None
    actual_paid_date: Optional[date] = None
    memo: Optional[str] = None
    source: str = "manual"

    @field_validator("source")
    @classmethod
    def validate_source(cls, value: str) -> str:
        normalized = (value or "").strip()
        if normalized not in VALID_CONTRIBUTION_SOURCES:
            raise ValueError("source must be one of: manual, capital_call, migration")
        return normalized


class LPContributionUpdate(BaseModel):
    """납입 이력 수정."""

    due_date: Optional[date] = None
    amount: Optional[float] = Field(default=None, gt=0)
    round_no: Optional[int] = None
    actual_paid_date: Optional[date] = None
    memo: Optional[str] = None


class LPContributionResponse(BaseModel):
    """납입 이력 응답."""

    id: int
    fund_id: int
    lp_id: int
    due_date: date
    amount: float
    commitment_ratio: Optional[float] = None
    round_no: Optional[int] = None
    actual_paid_date: Optional[date] = None
    memo: Optional[str] = None
    capital_call_id: Optional[int] = None
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class LPContributionListItem(LPContributionResponse):
    """리스트 표시용 납입 이력."""

    lp_name: str = ""
    cumulative_amount: float = 0


class LPContributionSummary(BaseModel):
    """LP별 납입 요약."""

    lp_id: int
    lp_name: str
    commitment: float
    total_paid_in: float
    paid_ratio: float
    contribution_count: int
    contribution_type: Optional[str] = None
    contributions: list[LPContributionListItem]


class BulkLPContributionCreate(BaseModel):
    """일괄 납입 이력 생성."""

    fund_id: int
    contributions: list[LPContributionCreate]
