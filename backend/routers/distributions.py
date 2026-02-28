import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP
from models.phase3 import Distribution, DistributionDetail, DistributionItem
from schemas.phase3 import (
    DistributionCreate,
    DistributionDetailResponse,
    DistributionDetailUpdate,
    DistributionItemCreate,
    DistributionItemListItem,
    DistributionItemResponse,
    DistributionItemUpdate,
    DistributionListItem,
    DistributionResponse,
    DistributionUpdate,
)
from services.compliance_engine import ComplianceEngine

router = APIRouter(tags=["distributions"])
logger = logging.getLogger(__name__)


def _ensure_fund(db: Session, fund_id: int) -> None:
    if not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="Fund not found")


def _serialize_distribution_detail(row: DistributionDetail, db: Session) -> DistributionDetailResponse:
    lp = db.get(LP, row.lp_id)
    return DistributionDetailResponse(
        id=row.id,
        distribution_id=row.distribution_id,
        lp_id=row.lp_id,
        distribution_amount=float(row.distribution_amount or 0),
        distribution_type=row.distribution_type,
        paid=bool(row.paid),
        lp_name=lp.name if lp else None,
    )


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
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)

    try:
        ComplianceEngine(db).on_distribution_executed(row.fund_id)
    except Exception as exc:  # noqa: BLE001 - hook failures must not break main flow
        db.rollback()
        logger.warning(
            "compliance hook failed on create_distribution: distribution_id=%s fund_id=%s error=%s",
            row.id,
            row.fund_id,
            exc,
        )

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
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.delete("/api/distributions/{distribution_id}", status_code=204)
def delete_distribution(distribution_id: int, db: Session = Depends(get_db)):
    row = db.get(Distribution, distribution_id)
    if not row:
        raise HTTPException(status_code=404, detail="Distribution not found")
    db.delete(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


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
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
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
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.delete("/api/distributions/{distribution_id}/items/{item_id}", status_code=204)
def delete_distribution_item(distribution_id: int, item_id: int, db: Session = Depends(get_db)):
    row = db.get(DistributionItem, item_id)
    if not row or row.distribution_id != distribution_id:
        raise HTTPException(status_code=404, detail="Distribution item not found")
    db.delete(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


@router.get(
    "/api/distributions/{distribution_id}/details",
    response_model=list[DistributionDetailResponse],
)
def list_distribution_details(distribution_id: int, db: Session = Depends(get_db)):
    distribution = db.get(Distribution, distribution_id)
    if not distribution:
        raise HTTPException(status_code=404, detail="Distribution not found")
    rows = (
        db.query(DistributionDetail)
        .filter(DistributionDetail.distribution_id == distribution_id)
        .order_by(DistributionDetail.id.asc())
        .all()
    )
    return [_serialize_distribution_detail(row, db) for row in rows]


@router.post(
    "/api/distributions/{distribution_id}/details/auto-generate",
    response_model=list[DistributionDetailResponse],
)
def auto_generate_distribution_details(
    distribution_id: int,
    replace_existing: bool = True,
    db: Session = Depends(get_db),
):
    distribution = db.get(Distribution, distribution_id)
    if not distribution:
        raise HTTPException(status_code=404, detail="Distribution not found")

    lp_rows = (
        db.query(LP)
        .filter(LP.fund_id == distribution.fund_id)
        .order_by(LP.id.asc())
        .all()
    )
    lp_rows = [row for row in lp_rows if float(row.commitment or 0) > 0]
    if not lp_rows:
        raise HTTPException(status_code=400, detail="약정금이 있는 LP가 없어 자동 생성할 수 없습니다")

    if replace_existing:
        for existing in (
            db.query(DistributionDetail)
            .filter(DistributionDetail.distribution_id == distribution_id)
            .all()
        ):
            db.delete(existing)

    total_commitment = sum(float(row.commitment or 0) for row in lp_rows)
    total_amount = float(distribution.principal_total or 0) + float(distribution.profit_total or 0)
    assigned = 0.0
    created: list[DistributionDetail] = []
    for idx, lp in enumerate(lp_rows):
        ratio = float(lp.commitment or 0) / total_commitment if total_commitment else 0.0
        if idx == len(lp_rows) - 1:
            amount = max(total_amount - assigned, 0.0)
        else:
            amount = round(total_amount * ratio, 2)
            assigned += amount
        row = DistributionDetail(
            distribution_id=distribution_id,
            lp_id=lp.id,
            distribution_amount=amount,
            distribution_type="수익배분",
            paid=False,
        )
        db.add(row)
        created.append(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    for row in created:
        db.refresh(row)
    return [_serialize_distribution_detail(row, db) for row in created]


@router.patch(
    "/api/distribution-details/{detail_id}",
    response_model=DistributionDetailResponse,
)
def update_distribution_detail(
    detail_id: int,
    data: DistributionDetailUpdate,
    db: Session = Depends(get_db),
):
    row = db.get(DistributionDetail, detail_id)
    if not row:
        raise HTTPException(status_code=404, detail="Distribution detail not found")
    payload = data.model_dump(exclude_unset=True)
    for key, value in payload.items():
        setattr(row, key, value)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize_distribution_detail(row, db)
