from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.investment import Investment
from schemas.phase3 import FundPerformanceResponse
from services.performance_calculator import calculate_fund_performance

router = APIRouter(tags=["performance"])


def _total_invested(db: Session, fund_id: int) -> float:
    return float(
        db.query(func.coalesce(func.sum(Investment.amount), 0))
        .filter(Investment.fund_id == fund_id)
        .scalar()
        or 0
    )


@router.get("/api/funds/{fund_id}/performance", response_model=FundPerformanceResponse)
async def get_fund_performance(
    fund_id: int,
    as_of_date: date | None = None,
    db: Session = Depends(get_db),
):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")

    perf = await calculate_fund_performance(db, fund_id, as_of_date=as_of_date)
    paid_in_total = float(perf.get("total_paid_in") or 0)
    total_distributed = float(perf.get("total_distributed") or 0)
    residual_value = float(perf.get("residual_value") or 0)
    total_value = total_distributed + residual_value
    tvpi = float(perf.get("tvpi") or 0)

    return FundPerformanceResponse(
        fund_id=fund.id,
        fund_name=fund.name,
        paid_in_total=paid_in_total,
        total_invested=_total_invested(db, fund.id),
        total_distributed=total_distributed,
        residual_value=residual_value,
        total_value=total_value,
        irr=perf.get("irr"),
        tvpi=tvpi,
        dpi=perf.get("dpi"),
        rvpi=(residual_value / paid_in_total) if paid_in_total > 0 else None,
    )


@router.get("/api/performance/all")
async def get_all_funds_performance(db: Session = Depends(get_db)):
    funds = (
        db.query(Fund)
        .filter(func.lower(func.coalesce(Fund.status, "")) == "active")
        .order_by(Fund.id.asc())
        .all()
    )

    result: list[dict] = []
    for fund in funds:
        perf = await calculate_fund_performance(db, fund.id)
        result.append({
            "fund_id": fund.id,
            "fund_name": fund.name,
            **perf,
        })
    return result
