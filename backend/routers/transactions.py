from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.investment import Investment, PortfolioCompany
from models.transaction import Transaction
from schemas.transaction import (
    TransactionCreate,
    TransactionListItem,
    TransactionResponse,
    TransactionUpdate,
)

router = APIRouter(tags=["transactions"])


def _list_transactions(
    db: Session,
    investment_id: int | None = None,
    fund_id: int | None = None,
    company_id: int | None = None,
    type: str | None = None,
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

    rows = (
        query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .all()
    )
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
        raise HTTPException(status_code=404, detail="투자를 찾을 수 없습니다")
    if not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
    if not db.get(PortfolioCompany, company_id):
        raise HTTPException(status_code=404, detail="회사를 찾을 수 없습니다")
    if investment.fund_id != fund_id or investment.company_id != company_id:
        raise HTTPException(
            status_code=409,
            detail="거래의 조합/회사가 투자 건과 일치하지 않습니다",
        )
    return investment


@router.get("/api/transactions", response_model=list[TransactionListItem])
def list_transactions(
    investment_id: int | None = None,
    fund_id: int | None = None,
    company_id: int | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
):
    return _list_transactions(
        db,
        investment_id=investment_id,
        fund_id=fund_id,
        company_id=company_id,
        type=type,
    )


@router.get(
    "/api/investments/{investment_id}/transactions",
    response_model=list[TransactionListItem],
)
def list_transactions_by_investment(investment_id: int, db: Session = Depends(get_db)):
    if not db.get(Investment, investment_id):
        raise HTTPException(status_code=404, detail="투자를 찾을 수 없습니다")
    return _list_transactions(db, investment_id=investment_id)


@router.get("/api/transactions/{transaction_id}", response_model=TransactionResponse)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    row = db.get(Transaction, transaction_id)
    if not row:
        raise HTTPException(status_code=404, detail="거래를 찾을 수 없습니다")
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
        prev_cumulative_gain = (
            previous.cumulative_gain if previous and previous.cumulative_gain is not None else 0
        )
        if payload["realized_gain"] is not None:
            payload["cumulative_gain"] = prev_cumulative_gain + payload["realized_gain"]
        elif previous and previous.cumulative_gain is not None:
            payload["cumulative_gain"] = previous.cumulative_gain

    row = Transaction(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int, data: TransactionUpdate, db: Session = Depends(get_db)
):
    row = db.get(Transaction, transaction_id)
    if not row:
        raise HTTPException(status_code=404, detail="거래를 찾을 수 없습니다")

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

    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    row = db.get(Transaction, transaction_id)
    if not row:
        raise HTTPException(status_code=404, detail="거래를 찾을 수 없습니다")

    db.delete(row)
    db.commit()
