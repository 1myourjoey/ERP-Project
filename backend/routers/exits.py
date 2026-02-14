from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.investment import Investment, PortfolioCompany
from models.phase3 import ExitCommittee, ExitCommitteeFund, ExitTrade
from models.transaction import Transaction
from schemas.phase3 import (
    ExitCommitteeCreate,
    ExitCommitteeFundCreate,
    ExitCommitteeFundListItem,
    ExitCommitteeFundResponse,
    ExitCommitteeFundUpdate,
    ExitCommitteeListItem,
    ExitCommitteeResponse,
    ExitCommitteeUpdate,
    ExitTradeCreate,
    ExitTradeListItem,
    ExitTradeResponse,
    ExitTradeUpdate,
)

router = APIRouter(tags=["exits"])


def _ensure_company(db: Session, company_id: int) -> PortfolioCompany:
    company = db.get(PortfolioCompany, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def _ensure_fund(db: Session, fund_id: int) -> Fund:
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")
    return fund


def _ensure_investment(db: Session, investment_id: int) -> Investment:
    investment = db.get(Investment, investment_id)
    if not investment:
        raise HTTPException(status_code=404, detail="Investment not found")
    return investment


def _ensure_investment_links(
    *,
    investment: Investment,
    fund_id: int,
    company_id: int,
) -> None:
    if investment.fund_id != fund_id or investment.company_id != company_id:
        raise HTTPException(
            status_code=409,
            detail="Fund/company must match the investment",
        )


def _find_exit_trade_transactions(db: Session, exit_trade_id: int) -> list[Transaction]:
    marker = f"[exit_trade:{exit_trade_id}]%"
    return (
        db.query(Transaction)
        .filter(Transaction.type == "exit", Transaction.memo.like(marker))
        .order_by(Transaction.id.desc())
        .all()
    )


def _sync_exit_trade_transaction(db: Session, row: ExitTrade) -> None:
    if row.net_amount is None:
        row.net_amount = row.amount - row.fees

    related = _find_exit_trade_transactions(db, row.id)
    tx = related[0] if related else None
    for extra in related[1:]:
        db.delete(extra)

    marker = f"[exit_trade:{row.id}]"
    memo = f"{marker} {row.memo}".strip() if row.memo else marker
    shares_change = -row.shares_sold if row.shares_sold is not None else None

    if tx is None:
        tx = Transaction(
            investment_id=row.investment_id,
            fund_id=row.fund_id,
            company_id=row.company_id,
            transaction_date=row.trade_date,
            type="exit",
            amount=row.net_amount,
            shares_change=shares_change,
            realized_gain=row.realized_gain,
            memo=memo,
        )
        db.add(tx)
    else:
        tx.investment_id = row.investment_id
        tx.fund_id = row.fund_id
        tx.company_id = row.company_id
        tx.transaction_date = row.trade_date
        tx.amount = row.net_amount
        tx.shares_change = shares_change
        tx.realized_gain = row.realized_gain
        tx.memo = memo


@router.get("/api/exit-committees", response_model=list[ExitCommitteeListItem])
def list_exit_committees(
    company_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(ExitCommittee)
    if company_id:
        query = query.filter(ExitCommittee.company_id == company_id)
    if status:
        query = query.filter(ExitCommittee.status == status)
    rows = query.order_by(ExitCommittee.meeting_date.desc(), ExitCommittee.id.desc()).all()

    result: list[ExitCommitteeListItem] = []
    for row in rows:
        company = db.get(PortfolioCompany, row.company_id)
        result.append(
            ExitCommitteeListItem(
                id=row.id,
                company_id=row.company_id,
                status=row.status,
                meeting_date=row.meeting_date,
                location=row.location,
                agenda=row.agenda,
                exit_strategy=row.exit_strategy,
                analyst_opinion=row.analyst_opinion,
                vote_result=row.vote_result,
                memo=row.memo,
                created_at=row.created_at,
                company_name=company.name if company else "",
            )
        )
    return result


@router.get("/api/exit-committees/{committee_id}", response_model=ExitCommitteeResponse)
def get_exit_committee(committee_id: int, db: Session = Depends(get_db)):
    row = db.get(ExitCommittee, committee_id)
    if not row:
        raise HTTPException(status_code=404, detail="Exit committee not found")
    return row


@router.post("/api/exit-committees", response_model=ExitCommitteeResponse, status_code=201)
def create_exit_committee(data: ExitCommitteeCreate, db: Session = Depends(get_db)):
    _ensure_company(db, data.company_id)
    row = ExitCommittee(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/exit-committees/{committee_id}", response_model=ExitCommitteeResponse)
def update_exit_committee(committee_id: int, data: ExitCommitteeUpdate, db: Session = Depends(get_db)):
    row = db.get(ExitCommittee, committee_id)
    if not row:
        raise HTTPException(status_code=404, detail="Exit committee not found")
    payload = data.model_dump(exclude_unset=True)
    next_company_id = payload.get("company_id", row.company_id)
    _ensure_company(db, next_company_id)
    for key, value in payload.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/exit-committees/{committee_id}", status_code=204)
def delete_exit_committee(committee_id: int, db: Session = Depends(get_db)):
    row = db.get(ExitCommittee, committee_id)
    if not row:
        raise HTTPException(status_code=404, detail="Exit committee not found")
    db.delete(row)
    db.commit()


@router.get(
    "/api/exit-committees/{committee_id}/funds",
    response_model=list[ExitCommitteeFundListItem],
)
def list_exit_committee_funds(committee_id: int, db: Session = Depends(get_db)):
    committee = db.get(ExitCommittee, committee_id)
    if not committee:
        raise HTTPException(status_code=404, detail="Exit committee not found")

    rows = (
        db.query(ExitCommitteeFund)
        .filter(ExitCommitteeFund.exit_committee_id == committee_id)
        .order_by(ExitCommitteeFund.id.desc())
        .all()
    )
    result: list[ExitCommitteeFundListItem] = []
    for row in rows:
        fund = db.get(Fund, row.fund_id)
        result.append(
            ExitCommitteeFundListItem(
                id=row.id,
                exit_committee_id=row.exit_committee_id,
                fund_id=row.fund_id,
                investment_id=row.investment_id,
                fund_name=fund.name if fund else "",
            )
        )
    return result


@router.post(
    "/api/exit-committees/{committee_id}/funds",
    response_model=ExitCommitteeFundResponse,
    status_code=201,
)
def create_exit_committee_fund(committee_id: int, data: ExitCommitteeFundCreate, db: Session = Depends(get_db)):
    committee = db.get(ExitCommittee, committee_id)
    if not committee:
        raise HTTPException(status_code=404, detail="Exit committee not found")
    _ensure_fund(db, data.fund_id)
    investment = _ensure_investment(db, data.investment_id)
    _ensure_investment_links(investment=investment, fund_id=data.fund_id, company_id=committee.company_id)

    row = ExitCommitteeFund(
        exit_committee_id=committee_id,
        fund_id=data.fund_id,
        investment_id=data.investment_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put(
    "/api/exit-committees/{committee_id}/funds/{item_id}",
    response_model=ExitCommitteeFundResponse,
)
def update_exit_committee_fund(
    committee_id: int,
    item_id: int,
    data: ExitCommitteeFundUpdate,
    db: Session = Depends(get_db),
):
    committee = db.get(ExitCommittee, committee_id)
    if not committee:
        raise HTTPException(status_code=404, detail="Exit committee not found")
    row = db.get(ExitCommitteeFund, item_id)
    if not row or row.exit_committee_id != committee_id:
        raise HTTPException(status_code=404, detail="Exit committee fund not found")

    payload = data.model_dump(exclude_unset=True)
    next_fund_id = payload.get("fund_id", row.fund_id)
    next_investment_id = payload.get("investment_id", row.investment_id)
    _ensure_fund(db, next_fund_id)
    investment = _ensure_investment(db, next_investment_id)
    _ensure_investment_links(
        investment=investment,
        fund_id=next_fund_id,
        company_id=committee.company_id,
    )

    for key, value in payload.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/exit-committees/{committee_id}/funds/{item_id}", status_code=204)
def delete_exit_committee_fund(committee_id: int, item_id: int, db: Session = Depends(get_db)):
    row = db.get(ExitCommitteeFund, item_id)
    if not row or row.exit_committee_id != committee_id:
        raise HTTPException(status_code=404, detail="Exit committee fund not found")
    db.delete(row)
    db.commit()


@router.get("/api/exit-trades", response_model=list[ExitTradeListItem])
def list_exit_trades(
    fund_id: int | None = None,
    company_id: int | None = None,
    investment_id: int | None = None,
    exit_committee_id: int | None = None,
    exit_type: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(ExitTrade)
    if fund_id:
        query = query.filter(ExitTrade.fund_id == fund_id)
    if company_id:
        query = query.filter(ExitTrade.company_id == company_id)
    if investment_id:
        query = query.filter(ExitTrade.investment_id == investment_id)
    if exit_committee_id:
        query = query.filter(ExitTrade.exit_committee_id == exit_committee_id)
    if exit_type:
        query = query.filter(ExitTrade.exit_type == exit_type)
    rows = query.order_by(ExitTrade.trade_date.desc(), ExitTrade.id.desc()).all()

    result: list[ExitTradeListItem] = []
    for row in rows:
        fund = db.get(Fund, row.fund_id)
        company = db.get(PortfolioCompany, row.company_id)
        result.append(
            ExitTradeListItem(
                id=row.id,
                exit_committee_id=row.exit_committee_id,
                investment_id=row.investment_id,
                fund_id=row.fund_id,
                company_id=row.company_id,
                exit_type=row.exit_type,
                trade_date=row.trade_date,
                amount=row.amount,
                shares_sold=row.shares_sold,
                price_per_share=row.price_per_share,
                fees=row.fees,
                net_amount=row.net_amount,
                realized_gain=row.realized_gain,
                memo=row.memo,
                created_at=row.created_at,
                fund_name=fund.name if fund else "",
                company_name=company.name if company else "",
            )
        )
    return result


@router.get("/api/exit-trades/{trade_id}", response_model=ExitTradeResponse)
def get_exit_trade(trade_id: int, db: Session = Depends(get_db)):
    row = db.get(ExitTrade, trade_id)
    if not row:
        raise HTTPException(status_code=404, detail="Exit trade not found")
    return row


@router.post("/api/exit-trades", response_model=ExitTradeResponse, status_code=201)
def create_exit_trade(data: ExitTradeCreate, db: Session = Depends(get_db)):
    _ensure_fund(db, data.fund_id)
    _ensure_company(db, data.company_id)
    investment = _ensure_investment(db, data.investment_id)
    _ensure_investment_links(investment=investment, fund_id=data.fund_id, company_id=data.company_id)

    committee = None
    if data.exit_committee_id is not None:
        committee = db.get(ExitCommittee, data.exit_committee_id)
        if not committee:
            raise HTTPException(status_code=404, detail="Exit committee not found")
        if committee.company_id != data.company_id:
            raise HTTPException(status_code=409, detail="Committee company must match trade company")

    row = ExitTrade(**data.model_dump())
    if row.net_amount is None:
        row.net_amount = row.amount - row.fees
    db.add(row)
    db.flush()
    _sync_exit_trade_transaction(db, row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/exit-trades/{trade_id}", response_model=ExitTradeResponse)
def update_exit_trade(trade_id: int, data: ExitTradeUpdate, db: Session = Depends(get_db)):
    row = db.get(ExitTrade, trade_id)
    if not row:
        raise HTTPException(status_code=404, detail="Exit trade not found")

    payload = data.model_dump(exclude_unset=True)
    next_fund_id = payload.get("fund_id", row.fund_id)
    next_company_id = payload.get("company_id", row.company_id)
    next_investment_id = payload.get("investment_id", row.investment_id)
    next_committee_id = payload.get("exit_committee_id", row.exit_committee_id)

    _ensure_fund(db, next_fund_id)
    _ensure_company(db, next_company_id)
    investment = _ensure_investment(db, next_investment_id)
    _ensure_investment_links(
        investment=investment,
        fund_id=next_fund_id,
        company_id=next_company_id,
    )

    if next_committee_id is not None:
        committee = db.get(ExitCommittee, next_committee_id)
        if not committee:
            raise HTTPException(status_code=404, detail="Exit committee not found")
        if committee.company_id != next_company_id:
            raise HTTPException(status_code=409, detail="Committee company must match trade company")

    for key, value in payload.items():
        setattr(row, key, value)

    if "net_amount" not in payload:
        row.net_amount = row.amount - row.fees

    _sync_exit_trade_transaction(db, row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/exit-trades/{trade_id}", status_code=204)
def delete_exit_trade(trade_id: int, db: Session = Depends(get_db)):
    row = db.get(ExitTrade, trade_id)
    if not row:
        raise HTTPException(status_code=404, detail="Exit trade not found")

    for tx in _find_exit_trade_transactions(db, row.id):
        db.delete(tx)
    db.delete(row)
    db.commit()
