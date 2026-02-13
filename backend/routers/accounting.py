from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.accounting import Account, JournalEntry, JournalEntryLine
from models.fund import Fund
from schemas.accounting import (
    AccountCreate,
    AccountUpdate,
    JournalEntryCreate,
    JournalEntryUpdate,
    TrialBalanceItem,
)

router = APIRouter(tags=["accounting"])


def _to_float(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _serialize_account(account: Account) -> dict:
    return {
        "id": account.id,
        "fund_id": account.fund_id,
        "code": account.code,
        "name": account.name,
        "category": account.category,
        "sub_category": account.sub_category,
        "normal_side": account.normal_side,
        "is_active": account.is_active,
        "display_order": account.display_order,
    }


def _serialize_entry(entry: JournalEntry, db: Session) -> dict:
    fund = db.get(Fund, entry.fund_id)
    lines = []
    for line in entry.lines:
        account = db.get(Account, line.account_id)
        lines.append({
            "id": line.id,
            "journal_entry_id": line.journal_entry_id,
            "account_id": line.account_id,
            "debit": _to_float(line.debit),
            "credit": _to_float(line.credit),
            "memo": line.memo,
            "account_name": account.name if account else None,
        })
    return {
        "id": entry.id,
        "fund_id": entry.fund_id,
        "entry_date": entry.entry_date.isoformat() if isinstance(entry.entry_date, (date, datetime)) else str(entry.entry_date),
        "entry_type": entry.entry_type,
        "description": entry.description,
        "status": entry.status,
        "source_type": entry.source_type,
        "source_id": entry.source_id,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "fund_name": fund.name if fund else None,
        "lines": lines,
    }


def _validate_lines(db: Session, lines: list[dict]) -> None:
    if not lines:
        raise HTTPException(status_code=400, detail="전표 라인이 필요합니다")
    debit_total = 0.0
    credit_total = 0.0
    for line in lines:
        account_id = line.get("account_id")
        if not account_id or not db.get(Account, account_id):
            raise HTTPException(status_code=404, detail="계정과목을 찾을 수 없습니다")
        debit_total += float(line.get("debit") or 0)
        credit_total += float(line.get("credit") or 0)
    if round(debit_total, 2) != round(credit_total, 2):
        raise HTTPException(status_code=400, detail="차변/대변 합계가 일치하지 않습니다")


@router.get("/api/accounts")
def list_accounts(
    fund_id: int | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Account)
    if fund_id is not None:
        query = query.filter((Account.fund_id == fund_id) | (Account.fund_id.is_(None)))
    if category:
        query = query.filter(Account.category == category)
    accounts = query.order_by(Account.category.asc(), Account.display_order.asc(), Account.id.asc()).all()
    return [_serialize_account(account) for account in accounts]


@router.post("/api/accounts", status_code=201)
def create_account(data: AccountCreate, db: Session = Depends(get_db)):
    if data.fund_id and not db.get(Fund, data.fund_id):
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
    account = Account(**data.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return _serialize_account(account)


@router.put("/api/accounts/{account_id}")
def update_account(account_id: int, data: AccountUpdate, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="계정과목을 찾을 수 없습니다")
    payload = data.model_dump(exclude_unset=True)
    next_fund_id = payload.get("fund_id", account.fund_id)
    if next_fund_id and not db.get(Fund, next_fund_id):
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
    for key, value in payload.items():
        setattr(account, key, value)
    db.commit()
    db.refresh(account)
    return _serialize_account(account)


@router.delete("/api/accounts/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="계정과목을 찾을 수 없습니다")
    line_count = db.query(JournalEntryLine).filter(JournalEntryLine.account_id == account_id).count()
    if line_count > 0:
        raise HTTPException(status_code=409, detail="사용 중인 계정과목은 삭제할 수 없습니다")
    db.delete(account)
    db.commit()
    return {"ok": True}


@router.get("/api/journal-entries")
def list_journal_entries(
    fund_id: int | None = None,
    entry_date_from: date | None = None,
    entry_date_to: date | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(JournalEntry)
    if fund_id:
        query = query.filter(JournalEntry.fund_id == fund_id)
    if entry_date_from:
        query = query.filter(JournalEntry.entry_date >= entry_date_from)
    if entry_date_to:
        query = query.filter(JournalEntry.entry_date <= entry_date_to)
    if status:
        query = query.filter(JournalEntry.status == status)
    entries = query.order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc()).all()
    return [_serialize_entry(entry, db) for entry in entries]


@router.get("/api/journal-entries/{entry_id}")
def get_journal_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(JournalEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="전표를 찾을 수 없습니다")
    return _serialize_entry(entry, db)


@router.post("/api/journal-entries", status_code=201)
def create_journal_entry(data: JournalEntryCreate, db: Session = Depends(get_db)):
    if not db.get(Fund, data.fund_id):
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
    payload = data.model_dump()
    lines = payload.pop("lines", [])
    _validate_lines(db, lines)

    entry = JournalEntry(**payload)
    db.add(entry)
    db.flush()

    for line in lines:
        db.add(JournalEntryLine(
            journal_entry_id=entry.id,
            account_id=line["account_id"],
            debit=line.get("debit") or 0,
            credit=line.get("credit") or 0,
            memo=line.get("memo"),
        ))

    db.commit()
    db.refresh(entry)
    return _serialize_entry(entry, db)


@router.put("/api/journal-entries/{entry_id}")
def update_journal_entry(entry_id: int, data: JournalEntryUpdate, db: Session = Depends(get_db)):
    entry = db.get(JournalEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="전표를 찾을 수 없습니다")

    payload = data.model_dump(exclude_unset=True)
    lines = payload.pop("lines", None)
    next_fund_id = payload.get("fund_id", entry.fund_id)
    if next_fund_id and not db.get(Fund, next_fund_id):
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")

    if lines is not None:
        _validate_lines(db, lines)
        for old_line in list(entry.lines):
            db.delete(old_line)
        db.flush()
        for line in lines:
            db.add(JournalEntryLine(
                journal_entry_id=entry.id,
                account_id=line["account_id"],
                debit=line.get("debit") or 0,
                credit=line.get("credit") or 0,
                memo=line.get("memo"),
            ))

    for key, value in payload.items():
        setattr(entry, key, value)

    db.commit()
    db.refresh(entry)
    return _serialize_entry(entry, db)


@router.delete("/api/journal-entries/{entry_id}")
def delete_journal_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(JournalEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="전표를 찾을 수 없습니다")
    db.delete(entry)
    db.commit()
    return {"ok": True}


@router.get("/api/accounts/trial-balance")
def trial_balance(
    fund_id: int,
    as_of_date: date | None = None,
    db: Session = Depends(get_db),
):
    if not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
    as_of = as_of_date or date.today()
    accounts = (
        db.query(Account)
        .filter((Account.fund_id == fund_id) | (Account.fund_id.is_(None)))
        .order_by(Account.category.asc(), Account.display_order.asc(), Account.id.asc())
        .all()
    )

    items: list[TrialBalanceItem] = []
    for account in accounts:
        debit_total = (
            db.query(func.coalesce(func.sum(JournalEntryLine.debit), 0))
            .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
            .filter(
                JournalEntryLine.account_id == account.id,
                JournalEntry.fund_id == fund_id,
                JournalEntry.entry_date <= as_of,
            )
            .scalar()
        )
        credit_total = (
            db.query(func.coalesce(func.sum(JournalEntryLine.credit), 0))
            .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
            .filter(
                JournalEntryLine.account_id == account.id,
                JournalEntry.fund_id == fund_id,
                JournalEntry.entry_date <= as_of,
            )
            .scalar()
        )
        debit_value = _to_float(debit_total)
        credit_value = _to_float(credit_total)
        if account.normal_side == "대변":
            balance = credit_value - debit_value
        else:
            balance = debit_value - credit_value

        items.append({
            "account_id": account.id,
            "code": account.code,
            "name": account.name,
            "category": account.category,
            "sub_category": account.sub_category,
            "debit_total": debit_value,
            "credit_total": credit_value,
            "balance": balance,
        })

    return items
