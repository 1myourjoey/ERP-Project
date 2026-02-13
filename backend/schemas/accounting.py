from datetime import date, datetime

from pydantic import BaseModel


class AccountCreate(BaseModel):
    fund_id: int | None = None
    code: str
    name: str
    category: str
    sub_category: str | None = None
    normal_side: str | None = None
    is_active: str | None = "true"
    display_order: int | None = 0


class AccountUpdate(BaseModel):
    fund_id: int | None = None
    code: str | None = None
    name: str | None = None
    category: str | None = None
    sub_category: str | None = None
    normal_side: str | None = None
    is_active: str | None = None
    display_order: int | None = None


class AccountResponse(BaseModel):
    id: int
    fund_id: int | None
    code: str
    name: str
    category: str
    sub_category: str | None
    normal_side: str | None
    is_active: str
    display_order: int

    model_config = {"from_attributes": True}


class JournalEntryLineInput(BaseModel):
    account_id: int
    debit: float | None = 0
    credit: float | None = 0
    memo: str | None = None


class JournalEntryCreate(BaseModel):
    fund_id: int
    entry_date: date
    entry_type: str | None = "일반분개"
    description: str | None = None
    status: str | None = "미결재"
    source_type: str | None = None
    source_id: int | None = None
    lines: list[JournalEntryLineInput]


class JournalEntryUpdate(BaseModel):
    fund_id: int | None = None
    entry_date: date | None = None
    entry_type: str | None = None
    description: str | None = None
    status: str | None = None
    source_type: str | None = None
    source_id: int | None = None
    lines: list[JournalEntryLineInput] | None = None


class JournalEntryLineResponse(BaseModel):
    id: int
    journal_entry_id: int
    account_id: int
    debit: float
    credit: float
    memo: str | None
    account_name: str | None = None


class JournalEntryResponse(BaseModel):
    id: int
    fund_id: int
    entry_date: date
    entry_type: str
    description: str | None
    status: str
    source_type: str | None
    source_id: int | None
    created_at: datetime | None
    fund_name: str | None = None
    lines: list[JournalEntryLineResponse] = []

    model_config = {"from_attributes": True}


class TrialBalanceItem(BaseModel):
    account_id: int
    code: str
    name: str
    category: str
    sub_category: str | None
    debit_total: float
    credit_total: float
    balance: float
