from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.investment import Investment, PortfolioCompany
from models.transaction import Transaction
from schemas.transaction import (
    TransactionCreate,
    TransactionLedgerItem,
    TransactionListItem,
    TransactionResponse,
    TransactionSummaryItem,
    TransactionSummaryResponse,
    TransactionUpdate,
)

router = APIRouter(tags=["transactions"])


def _list_transactions(
    db: Session,
    investment_id: int | None = None,
    fund_id: int | None = None,
    company_id: int | None = None,
    type: str | None = None,
    transaction_subtype: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[TransactionListItem]:
    query = db.query(Transaction)
    if investment_id:
        query = query.filter(Transaction.investment_id == investment_id)
    if fund_id:
        query = query.filter(Transaction.fund_id == fund_id)
    if company_id:
        query = query.filter(Transaction.company_id == company_id)
    if type:
        query = query.filter(Transaction.type == type)
    if transaction_subtype:
        query = query.filter(Transaction.transaction_subtype == transaction_subtype)
    if date_from:
        query = query.filter(Transaction.transaction_date >= date_from)
    if date_to:
        query = query.filter(Transaction.transaction_date <= date_to)

    rows = query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).all()
    result: list[TransactionListItem] = []
    for row in rows:
        fund = db.get(Fund, row.fund_id)
        company = db.get(PortfolioCompany, row.company_id)
        result.append(
            TransactionListItem(
                id=row.id,
                investment_id=row.investment_id,
                fund_id=row.fund_id,
                company_id=row.company_id,
                transaction_date=row.transaction_date,
                type=row.type,
                transaction_subtype=row.transaction_subtype,
                counterparty=row.counterparty,
                conversion_detail=row.conversion_detail,
                settlement_date=row.settlement_date,
                amount=row.amount,
                shares_change=row.shares_change,
                balance_before=row.balance_before,
                balance_after=row.balance_after,
                realized_gain=row.realized_gain,
                cumulative_gain=row.cumulative_gain,
                memo=row.memo,
                created_at=row.created_at,
                fund_name=fund.name if fund else "",
                company_name=company.name if company else "",
            )
        )
    return result


def _validate_entities(
    db: Session,
    *,
    investment_id: int,
    fund_id: int,
    company_id: int,
) -> Investment:
    investment = db.get(Investment, investment_id)
    if not investment:
        raise HTTPException(status_code=404, detail="Investment not found")
    if not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="Fund not found")
    if not db.get(PortfolioCompany, company_id):
        raise HTTPException(status_code=404, detail="Company not found")
    if investment.fund_id != fund_id or investment.company_id != company_id:
        raise HTTPException(
            status_code=409,
            detail="Fund/company must match the investment",
        )
    return investment


@router.get("/api/transactions", response_model=list[TransactionListItem])
def list_transactions(
    investment_id: int | None = None,
    fund_id: int | None = None,
    company_id: int | None = None,
    type: str | None = None,
    transaction_subtype: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    return _list_transactions(
        db,
        investment_id=investment_id,
        fund_id=fund_id,
        company_id=company_id,
        type=type,
        transaction_subtype=transaction_subtype,
        date_from=date_from,
        date_to=date_to,
    )


@router.get(
    "/api/investments/{investment_id}/transactions",
    response_model=list[TransactionListItem],
)
def list_transactions_by_investment(investment_id: int, db: Session = Depends(get_db)):
    if not db.get(Investment, investment_id):
        raise HTTPException(status_code=404, detail="Investment not found")
    return _list_transactions(db, investment_id=investment_id)


@router.get("/api/transactions/ledger", response_model=list[TransactionLedgerItem])
def list_transaction_ledger(
    investment_id: int | None = None,
    fund_id: int | None = None,
    company_id: int | None = None,
    type: str | None = None,
    transaction_subtype: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Transaction)
    if investment_id:
        query = query.filter(Transaction.investment_id == investment_id)
    if fund_id:
        query = query.filter(Transaction.fund_id == fund_id)
    if company_id:
        query = query.filter(Transaction.company_id == company_id)
    if type:
        query = query.filter(Transaction.type == type)
    if transaction_subtype:
        query = query.filter(Transaction.transaction_subtype == transaction_subtype)
    if date_from:
        query = query.filter(Transaction.transaction_date >= date_from)
    if date_to:
        query = query.filter(Transaction.transaction_date <= date_to)

    rows = query.order_by(Transaction.transaction_date.asc(), Transaction.id.asc()).all()
    running_balance: float | None = None
    result: list[TransactionLedgerItem] = []
    for row in rows:
        if row.balance_after is not None:
            running_balance = row.balance_after
        elif running_balance is not None:
            running_balance += row.amount
        elif row.balance_before is not None:
            running_balance = row.balance_before + row.amount
        else:
            running_balance = row.amount

        fund = db.get(Fund, row.fund_id)
        company = db.get(PortfolioCompany, row.company_id)
        result.append(
            TransactionLedgerItem(
                id=row.id,
                investment_id=row.investment_id,
                fund_id=row.fund_id,
                company_id=row.company_id,
                transaction_date=row.transaction_date,
                type=row.type,
                transaction_subtype=row.transaction_subtype,
                counterparty=row.counterparty,
                conversion_detail=row.conversion_detail,
                settlement_date=row.settlement_date,
                amount=row.amount,
                shares_change=row.shares_change,
                balance_before=row.balance_before,
                balance_after=row.balance_after,
                realized_gain=row.realized_gain,
                cumulative_gain=row.cumulative_gain,
                memo=row.memo,
                created_at=row.created_at,
                fund_name=fund.name if fund else "",
                company_name=company.name if company else "",
                running_balance=running_balance,
            )
        )
    return result


@router.get("/api/transactions/summary", response_model=TransactionSummaryResponse)
def get_transaction_summary(
    investment_id: int | None = None,
    fund_id: int | None = None,
    company_id: int | None = None,
    type: str | None = None,
    transaction_subtype: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    rows = _list_transactions(
        db,
        investment_id=investment_id,
        fund_id=fund_id,
        company_id=company_id,
        type=type,
        transaction_subtype=transaction_subtype,
        date_from=date_from,
        date_to=date_to,
    )
    grouped: dict[tuple[str, str | None], TransactionSummaryItem] = {}
    for row in rows:
        key = (row.type, row.transaction_subtype)
        current = grouped.get(key)
        if current is None:
            grouped[key] = TransactionSummaryItem(
                type=row.type,
                transaction_subtype=row.transaction_subtype,
                count=1,
                total_amount=float(row.amount or 0),
            )
            continue
        current.count += 1
        current.total_amount += float(row.amount or 0)
    items = sorted(grouped.values(), key=lambda x: (x.type, x.transaction_subtype or ""))
    return TransactionSummaryResponse(
        total_count=sum(item.count for item in items),
        total_amount=sum(item.total_amount for item in items),
        items=items,
    )


@router.get("/api/transactions/{transaction_id}", response_model=TransactionResponse)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    row = db.get(Transaction, transaction_id)
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return row


@router.post("/api/transactions", response_model=TransactionResponse, status_code=201)
def create_transaction(data: TransactionCreate, db: Session = Depends(get_db)):
    investment = _validate_entities(
        db,
        investment_id=data.investment_id,
        fund_id=data.fund_id,
        company_id=data.company_id,
    )

    payload = data.model_dump()
    previous = (
        db.query(Transaction)
        .filter(Transaction.investment_id == data.investment_id)
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .first()
    )
    if payload["balance_before"] is None:
        payload["balance_before"] = (
            previous.balance_after if previous and previous.balance_after is not None else investment.amount
        )
    if payload["balance_after"] is None and payload["balance_before"] is not None:
        payload["balance_after"] = payload["balance_before"] + payload["amount"]
    if payload["cumulative_gain"] is None:
        prev_cumulative_gain = previous.cumulative_gain if previous and previous.cumulative_gain is not None else 0
        if payload["realized_gain"] is not None:
            payload["cumulative_gain"] = prev_cumulative_gain + payload["realized_gain"]
        elif previous and previous.cumulative_gain is not None:
            payload["cumulative_gain"] = previous.cumulative_gain

    row = Transaction(**payload)
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.put("/api/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    data: TransactionUpdate,
    db: Session = Depends(get_db),
):
    row = db.get(Transaction, transaction_id)
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")

    payload = data.model_dump(exclude_unset=True)
    next_investment_id = payload.get("investment_id", row.investment_id)
    next_fund_id = payload.get("fund_id", row.fund_id)
    next_company_id = payload.get("company_id", row.company_id)

    _validate_entities(
        db,
        investment_id=next_investment_id,
        fund_id=next_fund_id,
        company_id=next_company_id,
    )

    for key, value in payload.items():
        setattr(row, key, value)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.delete("/api/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    row = db.get(Transaction, transaction_id)
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
