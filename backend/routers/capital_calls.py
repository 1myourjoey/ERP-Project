from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP
from models.phase3 import CapitalCall, CapitalCallItem
from schemas.phase3 import (
    CapitalCallCreate,
    CapitalCallItemCreate,
    CapitalCallItemListItem,
    CapitalCallItemResponse,
    CapitalCallItemUpdate,
    CapitalCallListItem,
    CapitalCallResponse,
    CapitalCallUpdate,
)

router = APIRouter(tags=["capital_calls"])


def _ensure_fund(db: Session, fund_id: int) -> None:
    if not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="Fund not found")


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
                memo=row.memo,
                created_at=row.created_at,
                fund_name=fund.name if fund else "",
            )
        )
    return result


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
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return CapitalCallItemResponse(
        id=row.id,
        capital_call_id=row.capital_call_id,
        lp_id=row.lp_id,
        amount=row.amount,
        paid=bool(row.paid),
        paid_date=row.paid_date,
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
    db.commit()
    db.refresh(row)
    return CapitalCallItemResponse(
        id=row.id,
        capital_call_id=row.capital_call_id,
        lp_id=row.lp_id,
        amount=row.amount,
        paid=bool(row.paid),
        paid_date=row.paid_date,
    )


@router.delete("/api/capital-calls/{capital_call_id}/items/{item_id}", status_code=204)
def delete_capital_call_item(capital_call_id: int, item_id: int, db: Session = Depends(get_db)):
    row = db.get(CapitalCallItem, item_id)
    if not row or row.capital_call_id != capital_call_id:
        raise HTTPException(status_code=404, detail="Capital call item not found")
    db.delete(row)
    db.commit()
