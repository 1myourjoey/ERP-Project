from datetime import date as dt_date, datetime

from pydantic import BaseModel


class VoteRecordCreate(BaseModel):
    company_id: int
    investment_id: int | None = None
    vote_type: str
    date: dt_date
    agenda: str | None = None
    decision: str | None = None
    memo: str | None = None


class VoteRecordUpdate(BaseModel):
    company_id: int | None = None
    investment_id: int | None = None
    vote_type: str | None = None
    date: dt_date | None = None
    agenda: str | None = None
    decision: str | None = None
    memo: str | None = None


class VoteRecordResponse(BaseModel):
    id: int
    company_id: int
    investment_id: int | None
    vote_type: str
    date: dt_date
    agenda: str | None
    decision: str | None
    memo: str | None
    created_at: datetime | None
    company_name: str | None = None
    investment_name: str | None = None

    model_config = {"from_attributes": True}
