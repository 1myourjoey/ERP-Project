from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from services.cashflow_projection import project_cashflow

router = APIRouter(tags=["cashflow"])


@router.get("/api/funds/{fund_id}/cashflow")
async def get_fund_cashflow(
    fund_id: int,
    months_ahead: int = Query(default=12, ge=1, le=24),
    operating_cost: float = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return await project_cashflow(db, fund_id, months_ahead, operating_cost)


@router.get("/api/cashflow/all")
async def get_all_funds_cashflow(
    months_ahead: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
):
    funds = (
        db.query(Fund)
        .filter(func.lower(func.coalesce(Fund.status, "")) == "active")
        .order_by(Fund.id.asc())
        .all()
    )

    results: list[dict] = []
    for fund in funds:
        projection = await project_cashflow(db, fund.id, months_ahead)
        first_month = projection["monthly_summary"][0] if projection.get("monthly_summary") else None
        results.append(
            {
                "fund_id": fund.id,
                "fund_name": fund.name,
                "current_balance": projection.get("current_balance", 0),
                "next_month_net": first_month.get("net", 0) if first_month else 0,
            }
        )
    return results
