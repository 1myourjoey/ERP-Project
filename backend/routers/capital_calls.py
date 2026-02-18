from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP
from models.phase3 import CapitalCall, CapitalCallItem
from schemas.phase3 import (
    CapitalCallBatchCreate,
    CapitalCallCreate,
    CapitalCallItemCreate,
    CapitalCallItemListItem,
    CapitalCallItemResponse,
    CapitalCallSummaryResponse,
    CapitalCallItemUpdate,
    CapitalCallListItem,
    CapitalCallResponse,
    CapitalCallUpdate,
)

router = APIRouter(tags=["capital_calls"])


def _ensure_fund(db: Session, fund_id: int) -> None:
    if not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="Fund not found")


def _increase_lp_paid_in(lp: LP, amount: int | float) -> None:
    lp.paid_in = int((lp.paid_in or 0) + (amount or 0))


def _decrease_lp_paid_in(lp: LP, amount: int | float) -> None:
    lp.paid_in = max(0, int((lp.paid_in or 0) - (amount or 0)))


@router.get("/api/capital-calls", response_model=list[CapitalCallListItem])
def list_capital_calls(
    fund_id: int | None = None,
    call_type: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(CapitalCall)
    if fund_id:
        query = query.filter(CapitalCall.fund_id == fund_id)
    if call_type:
        query = query.filter(CapitalCall.call_type == call_type)
    rows = query.order_by(CapitalCall.call_date.desc(), CapitalCall.id.desc()).all()
    result: list[CapitalCallListItem] = []
    for row in rows:
        fund = db.get(Fund, row.fund_id)
        result.append(
            CapitalCallListItem(
                id=row.id,
                fund_id=row.fund_id,
                call_date=row.call_date,
                call_type=row.call_type,
                total_amount=row.total_amount,
                request_percent=row.request_percent,
                memo=row.memo,
                created_at=row.created_at,
                fund_name=fund.name if fund else "",
            )
        )
    return result


@router.post("/api/capital-calls/batch", response_model=CapitalCallResponse, status_code=201)
def create_capital_call_batch(data: CapitalCallBatchCreate, db: Session = Depends(get_db)):
    _ensure_fund(db, data.fund_id)
    call = CapitalCall(
        fund_id=data.fund_id,
        call_date=data.call_date,
        call_type=data.call_type,
        total_amount=data.total_amount,
        request_percent=data.request_percent,
        memo=data.memo,
    )
    db.add(call)
    db.flush()

    for item_data in data.items:
        lp = db.get(LP, item_data.lp_id)
        if not lp:
            raise HTTPException(status_code=404, detail=f"LP {item_data.lp_id} not found")
        if lp.fund_id != data.fund_id:
            raise HTTPException(status_code=409, detail="LP must belong to the same fund")
        row = CapitalCallItem(
            capital_call_id=call.id,
            lp_id=item_data.lp_id,
            amount=item_data.amount,
            paid=1 if item_data.paid else 0,
            paid_date=item_data.paid_date,
            memo=item_data.memo,
        )
        db.add(row)
        if item_data.paid:
            _increase_lp_paid_in(lp, item_data.amount)

    db.commit()
    db.refresh(call)
    return call


@router.get("/api/capital-calls/{capital_call_id}", response_model=CapitalCallResponse)
def get_capital_call(capital_call_id: int, db: Session = Depends(get_db)):
    row = db.get(CapitalCall, capital_call_id)
    if not row:
        raise HTTPException(status_code=404, detail="Capital call not found")
    return row


@router.post("/api/capital-calls", response_model=CapitalCallResponse, status_code=201)
def create_capital_call(data: CapitalCallCreate, db: Session = Depends(get_db)):
    _ensure_fund(db, data.fund_id)
    row = CapitalCall(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/capital-calls/{capital_call_id}", response_model=CapitalCallResponse)
def update_capital_call(capital_call_id: int, data: CapitalCallUpdate, db: Session = Depends(get_db)):
    row = db.get(CapitalCall, capital_call_id)
    if not row:
        raise HTTPException(status_code=404, detail="Capital call not found")
    payload = data.model_dump(exclude_unset=True)
    next_fund_id = payload.get("fund_id", row.fund_id)
    _ensure_fund(db, next_fund_id)
    for key, value in payload.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/capital-calls/{capital_call_id}", status_code=204)
def delete_capital_call(capital_call_id: int, db: Session = Depends(get_db)):
    row = db.get(CapitalCall, capital_call_id)
    if not row:
        raise HTTPException(status_code=404, detail="Capital call not found")
    for item in row.items:
        if bool(item.paid):
            lp = db.get(LP, item.lp_id)
            if lp:
                _decrease_lp_paid_in(lp, int(item.amount or 0))
    db.delete(row)
    db.commit()


@router.get(
    "/api/capital-calls/{capital_call_id}/items",
    response_model=list[CapitalCallItemListItem],
)
def list_capital_call_items(capital_call_id: int, db: Session = Depends(get_db)):
    call = db.get(CapitalCall, capital_call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Capital call not found")
    rows = (
        db.query(CapitalCallItem)
        .filter(CapitalCallItem.capital_call_id == capital_call_id)
        .order_by(CapitalCallItem.id.desc())
        .all()
    )
    result: list[CapitalCallItemListItem] = []
    for row in rows:
        lp = db.get(LP, row.lp_id)
        result.append(
            CapitalCallItemListItem(
                id=row.id,
                capital_call_id=row.capital_call_id,
                lp_id=row.lp_id,
                amount=row.amount,
                paid=bool(row.paid),
                paid_date=row.paid_date,
                memo=row.memo,
                lp_name=lp.name if lp else "",
            )
        )
    return result


@router.post(
    "/api/capital-calls/{capital_call_id}/items",
    response_model=CapitalCallItemResponse,
    status_code=201,
)
def create_capital_call_item(capital_call_id: int, data: CapitalCallItemCreate, db: Session = Depends(get_db)):
    call = db.get(CapitalCall, capital_call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Capital call not found")
    lp = db.get(LP, data.lp_id)
    if not lp:
        raise HTTPException(status_code=404, detail="LP not found")
    if lp.fund_id != call.fund_id:
        raise HTTPException(status_code=409, detail="LP must belong to the same fund")

    row = CapitalCallItem(
        capital_call_id=capital_call_id,
        lp_id=data.lp_id,
        amount=data.amount,
        paid=1 if data.paid else 0,
        paid_date=data.paid_date,
        memo=data.memo,
    )
    db.add(row)
    if data.paid:
        _increase_lp_paid_in(lp, data.amount)
    db.commit()
    db.refresh(row)
    return CapitalCallItemResponse(
        id=row.id,
        capital_call_id=row.capital_call_id,
        lp_id=row.lp_id,
        amount=row.amount,
        paid=bool(row.paid),
        paid_date=row.paid_date,
        memo=row.memo,
    )


@router.put(
    "/api/capital-calls/{capital_call_id}/items/{item_id}",
    response_model=CapitalCallItemResponse,
)
def update_capital_call_item(
    capital_call_id: int,
    item_id: int,
    data: CapitalCallItemUpdate,
    db: Session = Depends(get_db),
):
    call = db.get(CapitalCall, capital_call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Capital call not found")
    row = db.get(CapitalCallItem, item_id)
    if not row or row.capital_call_id != capital_call_id:
        raise HTTPException(status_code=404, detail="Capital call item not found")

    payload = data.model_dump(exclude_unset=True)
    old_lp = db.get(LP, row.lp_id)
    old_paid = bool(row.paid)
    old_amount = int(row.amount or 0)
    next_lp_id = payload.get("lp_id", row.lp_id)
    lp = db.get(LP, next_lp_id)
    if not lp:
        raise HTTPException(status_code=404, detail="LP not found")
    if lp.fund_id != call.fund_id:
        raise HTTPException(status_code=409, detail="LP must belong to the same fund")

    for key, value in payload.items():
        if key == "paid":
            setattr(row, key, 1 if value else 0)
        else:
            setattr(row, key, value)

    if {"paid", "amount", "lp_id"} & set(payload.keys()):
        new_lp = db.get(LP, row.lp_id)
        if old_paid and old_lp:
            _decrease_lp_paid_in(old_lp, old_amount)
        if bool(row.paid) and new_lp:
            _increase_lp_paid_in(new_lp, int(row.amount or 0))
    db.commit()
    db.refresh(row)
    return CapitalCallItemResponse(
        id=row.id,
        capital_call_id=row.capital_call_id,
        lp_id=row.lp_id,
        amount=row.amount,
        paid=bool(row.paid),
        paid_date=row.paid_date,
        memo=row.memo,
    )


@router.delete("/api/capital-calls/{capital_call_id}/items/{item_id}", status_code=204)
def delete_capital_call_item(capital_call_id: int, item_id: int, db: Session = Depends(get_db)):
    row = db.get(CapitalCallItem, item_id)
    if not row or row.capital_call_id != capital_call_id:
        raise HTTPException(status_code=404, detail="Capital call item not found")
    if bool(row.paid):
        lp = db.get(LP, row.lp_id)
        if lp:
            _decrease_lp_paid_in(lp, int(row.amount or 0))
    db.delete(row)
    db.commit()


@router.get("/api/capital-calls/summary/{fund_id}", response_model=CapitalCallSummaryResponse)
def get_capital_call_summary(fund_id: int, db: Session = Depends(get_db)):
    _ensure_fund(db, fund_id)
    fund = db.get(Fund, fund_id)
    today = date.today()
    calls = (
        db.query(CapitalCall)
        .filter(CapitalCall.fund_id == fund_id)
        .order_by(CapitalCall.call_date.asc(), CapitalCall.id.asc())
        .all()
    )
    call_ids = [row.id for row in calls]
    items = (
        db.query(CapitalCallItem)
        .filter(CapitalCallItem.capital_call_id.in_(call_ids))
        .all()
        if call_ids
        else []
    )
    items_by_call: dict[int, list[CapitalCallItem]] = {}
    for item in items:
        items_by_call.setdefault(item.capital_call_id, []).append(item)

    rows: list[dict] = []
    for idx, call in enumerate(calls, start=1):
        call_items = items_by_call.get(call.id, [])
        paid_items = [item for item in call_items if bool(item.paid)]
        paid_count = len(paid_items)
        total_count = len(call_items)
        paid_amount = sum(float(item.amount or 0) for item in paid_items)
        paid_dates = [item.paid_date for item in paid_items if item.paid_date is not None]
        latest_paid_date = max(paid_dates) if paid_dates else None
        is_fully_paid = total_count > 0 and paid_count == total_count
        paid_on_time = is_fully_paid and all(
            item.paid_date is not None and item.paid_date <= call.call_date
            for item in paid_items
        )
        is_due = call.call_date <= today
        is_overdue_unpaid = is_due and not is_fully_paid
        commitment_total = float(fund.commitment_total or 0) if fund else 0
        commitment_ratio = round((float(call.total_amount or 0) / commitment_total) * 100, 1) if commitment_total else 0
        rows.append(
            {
                "id": call.id,
                "round": idx,
                "call_date": call.call_date.isoformat() if call.call_date else None,
                "call_type": call.call_type,
                "total_amount": float(call.total_amount or 0),
                "request_percent": call.request_percent,
                "paid_count": paid_count,
                "total_count": total_count,
                "paid_amount": paid_amount,
                "latest_paid_date": latest_paid_date.isoformat() if latest_paid_date else None,
                "is_fully_paid": is_fully_paid,
                "paid_on_time": paid_on_time,
                "is_due": is_due,
                "is_overdue_unpaid": is_overdue_unpaid,
                "commitment_ratio": commitment_ratio,
                "memo": call.memo,
            }
        )

    return {
        "fund_id": fund_id,
        "commitment_total": float(fund.commitment_total or 0) if fund else 0,
        "total_paid_in": sum(float(row["paid_amount"] or 0) for row in rows),
        "calls": rows,
    }
