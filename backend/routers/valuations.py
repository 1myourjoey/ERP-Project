from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.investment import Investment, PortfolioCompany
from models.valuation import Valuation
from schemas.valuation import (
    ValuationBulkCreate,
    ValuationDashboardItem,
    ValuationDashboardResponse,
    ValuationCreate,
    ValuationHistoryPoint,
    ValuationListItem,
    ValuationNavSummaryItem,
    ValuationResponse,
    ValuationUpdate,
)

router = APIRouter(tags=["valuations"])


def _to_float(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _normalize_payload(payload: dict) -> dict:
    if payload.get("valuation_method") is None and payload.get("method") is not None:
        payload["valuation_method"] = payload["method"]
    if payload.get("instrument_type") is None and payload.get("instrument") is not None:
        payload["instrument_type"] = payload["instrument"]
    if payload.get("valuation_date") is None and payload.get("as_of_date") is not None:
        payload["valuation_date"] = payload["as_of_date"]
    if payload.get("total_fair_value") is None and payload.get("value") is not None:
        payload["total_fair_value"] = payload["value"]
    if payload.get("book_value") is None and payload.get("prev_value") is not None:
        payload["book_value"] = payload["prev_value"]
    if (
        payload.get("unrealized_gain_loss") is None
        and payload.get("total_fair_value") is not None
        and payload.get("book_value") is not None
    ):
        payload["unrealized_gain_loss"] = (
            float(payload["total_fair_value"]) - float(payload["book_value"])
        )
    return payload


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


def _row_to_list_item(db: Session, row: Valuation) -> ValuationListItem:
    fund = db.get(Fund, row.fund_id)
    company = db.get(PortfolioCompany, row.company_id)
    return ValuationListItem(
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
        valuation_method=row.valuation_method,
        instrument_type=row.instrument_type,
        conversion_price=_to_float(row.conversion_price),
        exercise_price=_to_float(row.exercise_price),
        liquidation_pref=_to_float(row.liquidation_pref),
        participation_cap=_to_float(row.participation_cap),
        fair_value_per_share=_to_float(row.fair_value_per_share),
        total_fair_value=_to_float(row.total_fair_value),
        book_value=_to_float(row.book_value),
        unrealized_gain_loss=_to_float(row.unrealized_gain_loss),
        valuation_date=row.valuation_date,
        created_at=row.created_at,
        fund_name=fund.name if fund else "",
        company_name=company.name if company else "",
    )


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
        query = query.filter(
            (Valuation.method == method) | (Valuation.valuation_method == method)
        )

    rows = query.order_by(Valuation.as_of_date.desc(), Valuation.id.desc()).all()
    return [_row_to_list_item(db, row) for row in rows]


@router.get("/api/valuations/nav-summary", response_model=list[ValuationNavSummaryItem])
def get_nav_summary(db: Session = Depends(get_db)):
    rows = db.query(Valuation).all()
    grouped: dict[int, dict[str, float | int]] = defaultdict(
        lambda: {"total_nav": 0.0, "total_unrealized": 0.0, "count": 0}
    )
    for row in rows:
        summary = grouped[row.fund_id]
        summary["total_nav"] += float(
            _to_float(row.total_fair_value) or _to_float(row.value) or 0
        )
        summary["total_unrealized"] += float(_to_float(row.unrealized_gain_loss) or 0)
        summary["count"] += 1

    payload: list[ValuationNavSummaryItem] = []
    for fund_id, summary in grouped.items():
        fund = db.get(Fund, fund_id)
        payload.append(
            ValuationNavSummaryItem(
                fund_id=fund_id,
                fund_name=fund.name if fund else f"Fund #{fund_id}",
                total_nav=float(summary["total_nav"]),
                total_unrealized_gain_loss=float(summary["total_unrealized"]),
                valuation_count=int(summary["count"]),
            )
        )
    payload.sort(key=lambda row: row.fund_name)
    return payload


@router.get("/api/valuations/history/{investment_id}", response_model=list[ValuationHistoryPoint])
def get_valuation_history(investment_id: int, db: Session = Depends(get_db)):
    if not db.get(Investment, investment_id):
        raise HTTPException(status_code=404, detail="Investment not found")
    rows = (
        db.query(Valuation)
        .filter(Valuation.investment_id == investment_id)
        .order_by(Valuation.as_of_date.asc(), Valuation.id.asc())
        .all()
    )
    return [
        ValuationHistoryPoint(
            id=row.id,
            as_of_date=row.as_of_date,
            valuation_date=row.valuation_date,
            total_fair_value=_to_float(row.total_fair_value),
            book_value=_to_float(row.book_value),
            unrealized_gain_loss=_to_float(row.unrealized_gain_loss),
            method=row.method,
            valuation_method=row.valuation_method,
        )
        for row in rows
    ]


@router.post("/api/valuations/bulk", response_model=list[ValuationResponse], status_code=201)
def bulk_create_valuations(data: ValuationBulkCreate, db: Session = Depends(get_db)):
    if not data.items:
        raise HTTPException(status_code=400, detail="items is required")
    created: list[Valuation] = []
    try:
        for item in data.items:
            _validate_entities(
                db,
                investment_id=item.investment_id,
                fund_id=item.fund_id,
                company_id=item.company_id,
            )
            payload = _normalize_payload(
                {
                    "investment_id": item.investment_id,
                    "fund_id": item.fund_id,
                    "company_id": item.company_id,
                    "as_of_date": data.as_of_date,
                    "evaluator": data.evaluator,
                    "method": item.method,
                    "instrument": item.instrument,
                    "value": item.value,
                    "prev_value": None,
                    "change_amount": None,
                    "change_pct": None,
                    "basis": item.basis,
                    "valuation_method": item.valuation_method,
                    "instrument_type": item.instrument_type,
                    "book_value": item.book_value,
                    "total_fair_value": item.total_fair_value,
                    "unrealized_gain_loss": item.unrealized_gain_loss,
                    "valuation_date": data.valuation_date or data.as_of_date,
                }
            )
            previous = _latest_previous_valuation(db, item.investment_id)
            if previous is not None:
                payload["prev_value"] = previous.value
            payload["prev_value"], payload["change_amount"], payload["change_pct"] = _derive_values(
                value=payload["value"],
                prev_value=payload["prev_value"],
                change_amount=payload["change_amount"],
                change_pct=payload["change_pct"],
            )
            row = Valuation(**payload)
            db.add(row)
            created.append(row)
        db.commit()
    except Exception:
        db.rollback()
        raise
    for row in created:
        db.refresh(row)
    return created


@router.get("/api/valuations/dashboard", response_model=ValuationDashboardResponse)
def get_valuation_dashboard(
    fund_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Valuation)
    if fund_id:
        query = query.filter(Valuation.fund_id == fund_id)

    rows = query.order_by(Valuation.as_of_date.desc(), Valuation.id.desc()).all()
    latest_by_investment: dict[int, Valuation] = {}
    for row in rows:
        if row.investment_id not in latest_by_investment:
            latest_by_investment[row.investment_id] = row

    items: list[ValuationDashboardItem] = []
    total_nav = 0.0
    total_unrealized = 0.0
    for row in latest_by_investment.values():
        company = db.get(PortfolioCompany, row.company_id)
        total_fair_value = float(_to_float(row.total_fair_value) or _to_float(row.value) or 0)
        unrealized = float(_to_float(row.unrealized_gain_loss) or 0)
        total_nav += total_fair_value
        total_unrealized += unrealized
        items.append(
            ValuationDashboardItem(
                investment_id=row.investment_id,
                company_name=company.name if company else f"Company #{row.company_id}",
                instrument=row.instrument,
                instrument_type=row.instrument_type,
                book_value=_to_float(row.book_value),
                total_fair_value=_to_float(row.total_fair_value) or _to_float(row.value),
                unrealized_gain_loss=_to_float(row.unrealized_gain_loss),
                valuation_date=row.valuation_date or row.as_of_date,
                method=row.method,
                valuation_method=row.valuation_method,
            )
        )

    investment_query = db.query(Investment)
    if fund_id:
        investment_query = investment_query.filter(Investment.fund_id == fund_id)
    total_investments = investment_query.count()
    unvalued_count = max(0, total_investments - len(latest_by_investment))
    items.sort(key=lambda row: row.company_name)

    return ValuationDashboardResponse(
        total_nav=total_nav,
        total_unrealized_gain_loss=total_unrealized,
        valuation_count=len(latest_by_investment),
        unvalued_count=unvalued_count,
        items=items,
    )


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
    payload = _normalize_payload(data.model_dump())

    if payload["prev_value"] is None:
        previous = _latest_previous_valuation(db, data.investment_id)
        if previous is not None:
            payload["prev_value"] = previous.value

    payload["prev_value"], payload["change_amount"], payload["change_pct"] = _derive_values(
        value=payload["value"],
        prev_value=payload["prev_value"],
        change_amount=payload["change_amount"],
        change_pct=payload["change_pct"],
    )

    row = Valuation(**payload)
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.put("/api/valuations/{valuation_id}", response_model=ValuationResponse)
def update_valuation(valuation_id: int, data: ValuationUpdate, db: Session = Depends(get_db)):
    row = db.get(Valuation, valuation_id)
    if not row:
        raise HTTPException(status_code=404, detail="Valuation not found")

    payload = _normalize_payload(data.model_dump(exclude_unset=True))
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
    if row.valuation_method is None and row.method is not None:
        row.valuation_method = row.method
    if row.instrument_type is None and row.instrument is not None:
        row.instrument_type = row.instrument
    if row.valuation_date is None:
        row.valuation_date = row.as_of_date
    if row.total_fair_value is None:
        row.total_fair_value = row.value
    if row.book_value is None:
        row.book_value = row.prev_value
    if row.unrealized_gain_loss is None and row.total_fair_value is not None and row.book_value is not None:
        row.unrealized_gain_loss = float(row.total_fair_value) - float(row.book_value)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.delete("/api/valuations/{valuation_id}", status_code=204)
def delete_valuation(valuation_id: int, db: Session = Depends(get_db)):
    row = db.get(Valuation, valuation_id)
    if not row:
        raise HTTPException(status_code=404, detail="Valuation not found")
    db.delete(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
