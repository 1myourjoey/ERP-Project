from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP
from models.phase3 import Distribution, DistributionItem
from schemas.phase3 import (
    DistributionCreate,
    DistributionItemCreate,
    DistributionItemListItem,
    DistributionItemResponse,
    DistributionItemUpdate,
    DistributionListItem,
    DistributionResponse,
    DistributionUpdate,
)

router = APIRouter(tags=["distributions"])


def _ensure_fund(db: Session, fund_id: int) -> None:
    if not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="Fund not found")


@router.get("/api/distributions", response_model=list[DistributionListItem])
def list_distributions(
    fund_id: int | None = None,
    dist_type: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Distribution)
    if fund_id:
        query = query.filter(Distribution.fund_id == fund_id)
    if dist_type:
        query = query.filter(Distribution.dist_type == dist_type)
    rows = query.order_by(Distribution.dist_date.desc(), Distribution.id.desc()).all()
    result: list[DistributionListItem] = []
    for row in rows:
        fund = db.get(Fund, row.fund_id)
        result.append(
            DistributionListItem(
                id=row.id,
                fund_id=row.fund_id,
                dist_date=row.dist_date,
                dist_type=row.dist_type,
                principal_total=row.principal_total,
                profit_total=row.profit_total,
                performance_fee=row.performance_fee,
                memo=row.memo,
                created_at=row.created_at,
                fund_name=fund.name if fund else "",
            )
        )
    return result


@router.get("/api/distributions/{distribution_id}", response_model=DistributionResponse)
def get_distribution(distribution_id: int, db: Session = Depends(get_db)):
    row = db.get(Distribution, distribution_id)
    if not row:
        raise HTTPException(status_code=404, detail="Distribution not found")
    return row


@router.post("/api/distributions", response_model=DistributionResponse, status_code=201)
def create_distribution(data: DistributionCreate, db: Session = Depends(get_db)):
    _ensure_fund(db, data.fund_id)
    row = Distribution(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/distributions/{distribution_id}", response_model=DistributionResponse)
def update_distribution(distribution_id: int, data: DistributionUpdate, db: Session = Depends(get_db)):
    row = db.get(Distribution, distribution_id)
    if not row:
        raise HTTPException(status_code=404, detail="Distribution not found")
    payload = data.model_dump(exclude_unset=True)
    next_fund_id = payload.get("fund_id", row.fund_id)
    _ensure_fund(db, next_fund_id)
    for key, value in payload.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/distributions/{distribution_id}", status_code=204)
def delete_distribution(distribution_id: int, db: Session = Depends(get_db)):
    row = db.get(Distribution, distribution_id)
    if not row:
        raise HTTPException(status_code=404, detail="Distribution not found")
    db.delete(row)
    db.commit()


@router.get("/api/distributions/{distribution_id}/items", response_model=list[DistributionItemListItem])
def list_distribution_items(distribution_id: int, db: Session = Depends(get_db)):
    distribution = db.get(Distribution, distribution_id)
    if not distribution:
        raise HTTPException(status_code=404, detail="Distribution not found")
    rows = (
        db.query(DistributionItem)
        .filter(DistributionItem.distribution_id == distribution_id)
        .order_by(DistributionItem.id.desc())
        .all()
    )
    result: list[DistributionItemListItem] = []
    for row in rows:
        lp = db.get(LP, row.lp_id)
        result.append(
            DistributionItemListItem(
                id=row.id,
                distribution_id=row.distribution_id,
                lp_id=row.lp_id,
                principal=row.principal,
                profit=row.profit,
                lp_name=lp.name if lp else "",
            )
        )
    return result


@router.post("/api/distributions/{distribution_id}/items", response_model=DistributionItemResponse, status_code=201)
def create_distribution_item(distribution_id: int, data: DistributionItemCreate, db: Session = Depends(get_db)):
    distribution = db.get(Distribution, distribution_id)
    if not distribution:
        raise HTTPException(status_code=404, detail="Distribution not found")
    lp = db.get(LP, data.lp_id)
    if not lp:
        raise HTTPException(status_code=404, detail="LP not found")
    if lp.fund_id != distribution.fund_id:
        raise HTTPException(status_code=409, detail="LP must belong to the same fund")
    row = DistributionItem(
        distribution_id=distribution_id,
        lp_id=data.lp_id,
        principal=data.principal,
        profit=data.profit,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/distributions/{distribution_id}/items/{item_id}", response_model=DistributionItemResponse)
def update_distribution_item(
    distribution_id: int,
    item_id: int,
    data: DistributionItemUpdate,
    db: Session = Depends(get_db),
):
    distribution = db.get(Distribution, distribution_id)
    if not distribution:
        raise HTTPException(status_code=404, detail="Distribution not found")
    row = db.get(DistributionItem, item_id)
    if not row or row.distribution_id != distribution_id:
        raise HTTPException(status_code=404, detail="Distribution item not found")
    payload = data.model_dump(exclude_unset=True)
    next_lp_id = payload.get("lp_id", row.lp_id)
    lp = db.get(LP, next_lp_id)
    if not lp:
        raise HTTPException(status_code=404, detail="LP not found")
    if lp.fund_id != distribution.fund_id:
        raise HTTPException(status_code=409, detail="LP must belong to the same fund")
    for key, value in payload.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/distributions/{distribution_id}/items/{item_id}", status_code=204)
def delete_distribution_item(distribution_id: int, item_id: int, db: Session = Depends(get_db)):
    row = db.get(DistributionItem, item_id)
    if not row or row.distribution_id != distribution_id:
        raise HTTPException(status_code=404, detail="Distribution item not found")
    db.delete(row)
    db.commit()
