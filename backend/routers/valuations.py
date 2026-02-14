from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.investment import Investment, PortfolioCompany
from models.valuation import Valuation
from schemas.valuation import (
    ValuationCreate,
    ValuationListItem,
    ValuationResponse,
    ValuationUpdate,
)

router = APIRouter(tags=["valuations"])


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


def _latest_previous_valuation(
    db: Session, investment_id: int, exclude_id: int | None = None
) -> Valuation | None:
    query = (
        db.query(Valuation)
        .filter(Valuation.investment_id == investment_id)
        .order_by(Valuation.as_of_date.desc(), Valuation.id.desc())
    )
    if exclude_id is not None:
        query = query.filter(Valuation.id != exclude_id)
    return query.first()


def _derive_values(
    *,
    value: float,
    prev_value: float | None,
    change_amount: float | None,
    change_pct: float | None,
) -> tuple[float | None, float | None, float | None]:
    next_prev = prev_value
    next_change_amount = change_amount
    next_change_pct = change_pct

    if next_change_amount is None and next_prev is not None:
        next_change_amount = value - next_prev

    if next_change_pct is None and next_change_amount is not None and next_prev not in (None, 0):
        next_change_pct = round((next_change_amount / next_prev) * 100, 2)

    return next_prev, next_change_amount, next_change_pct


def _list_valuations(
    db: Session,
    *,
    investment_id: int | None = None,
    fund_id: int | None = None,
    company_id: int | None = None,
    method: str | None = None,
) -> list[ValuationListItem]:
    query = db.query(Valuation)
    if investment_id:
        query = query.filter(Valuation.investment_id == investment_id)
    if fund_id:
        query = query.filter(Valuation.fund_id == fund_id)
    if company_id:
        query = query.filter(Valuation.company_id == company_id)
    if method:
        query = query.filter(Valuation.method == method)

    rows = query.order_by(Valuation.as_of_date.desc(), Valuation.id.desc()).all()
    result: list[ValuationListItem] = []
    for row in rows:
        fund = db.get(Fund, row.fund_id)
        company = db.get(PortfolioCompany, row.company_id)
        result.append(
            ValuationListItem(
                id=row.id,
                investment_id=row.investment_id,
                fund_id=row.fund_id,
                company_id=row.company_id,
                as_of_date=row.as_of_date,
                evaluator=row.evaluator,
                method=row.method,
                instrument=row.instrument,
                value=row.value,
                prev_value=row.prev_value,
                change_amount=row.change_amount,
                change_pct=row.change_pct,
                basis=row.basis,
                created_at=row.created_at,
                fund_name=fund.name if fund else "",
                company_name=company.name if company else "",
            )
        )
    return result


@router.get("/api/valuations", response_model=list[ValuationListItem])
def list_valuations(
    investment_id: int | None = None,
    fund_id: int | None = None,
    company_id: int | None = None,
    method: str | None = None,
    db: Session = Depends(get_db),
):
    return _list_valuations(
        db,
        investment_id=investment_id,
        fund_id=fund_id,
        company_id=company_id,
        method=method,
    )


@router.get(
    "/api/investments/{investment_id}/valuations",
    response_model=list[ValuationListItem],
)
def list_valuations_by_investment(investment_id: int, db: Session = Depends(get_db)):
    if not db.get(Investment, investment_id):
        raise HTTPException(status_code=404, detail="Investment not found")
    return _list_valuations(db, investment_id=investment_id)


@router.get("/api/valuations/{valuation_id}", response_model=ValuationResponse)
def get_valuation(valuation_id: int, db: Session = Depends(get_db)):
    row = db.get(Valuation, valuation_id)
    if not row:
        raise HTTPException(status_code=404, detail="Valuation not found")
    return row


@router.post("/api/valuations", response_model=ValuationResponse, status_code=201)
def create_valuation(data: ValuationCreate, db: Session = Depends(get_db)):
    _validate_entities(
        db,
        investment_id=data.investment_id,
        fund_id=data.fund_id,
        company_id=data.company_id,
    )
    payload = data.model_dump()

    if payload["prev_value"] is None:
        previous = _latest_previous_valuation(db, data.investment_id)
        if previous is not None:
            payload["prev_value"] = previous.value

    prev_value, change_amount, change_pct = _derive_values(
        value=payload["value"],
        prev_value=payload["prev_value"],
        change_amount=payload["change_amount"],
        change_pct=payload["change_pct"],
    )
    payload["prev_value"] = prev_value
    payload["change_amount"] = change_amount
    payload["change_pct"] = change_pct

    row = Valuation(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/valuations/{valuation_id}", response_model=ValuationResponse)
def update_valuation(valuation_id: int, data: ValuationUpdate, db: Session = Depends(get_db)):
    row = db.get(Valuation, valuation_id)
    if not row:
        raise HTTPException(status_code=404, detail="Valuation not found")

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

    if row.prev_value is None:
        previous = _latest_previous_valuation(db, row.investment_id, exclude_id=row.id)
        if previous is not None:
            row.prev_value = previous.value

    if "change_amount" not in payload or "change_pct" not in payload:
        _, row.change_amount, row.change_pct = _derive_values(
            value=row.value,
            prev_value=row.prev_value,
            change_amount=row.change_amount,
            change_pct=row.change_pct,
        )

    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/valuations/{valuation_id}", status_code=204)
def delete_valuation(valuation_id: int, db: Session = Depends(get_db)):
    row = db.get(Valuation, valuation_id)
    if not row:
        raise HTTPException(status_code=404, detail="Valuation not found")
    db.delete(row)
    db.commit()
