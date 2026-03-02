from __future__ import annotations

import math
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.fund import LP
from models.phase3 import CapitalCall, Distribution, DistributionDetail
from models.valuation import Valuation


def _xirr(cashflows: list[tuple[date, float]]) -> float | None:
    if len(cashflows) < 2:
        return None
    if not any(amount < 0 for _, amount in cashflows):
        return None
    if not any(amount > 0 for _, amount in cashflows):
        return None

    cashflows = sorted(cashflows, key=lambda row: row[0])
    base = cashflows[0][0]

    def npv(rate: float) -> float:
        total = 0.0
        for dt, amount in cashflows:
            years = (dt - base).days / 365.0
            total += amount / ((1.0 + rate) ** years)
        return total

    low = -0.9999
    high = 10.0
    f_low = npv(low)
    f_high = npv(high)
    if f_low == 0:
        return low
    if f_high == 0:
        return high
    if (f_low > 0 and f_high > 0) or (f_low < 0 and f_high < 0):
        return None

    for _ in range(200):
        mid = (low + high) / 2.0
        value = npv(mid)
        if abs(value) < 1e-8:
            return mid
        if (f_low < 0 < value) or (f_low > 0 > value):
            high = mid
            f_high = value
        else:
            low = mid
            f_low = value

    result = (low + high) / 2.0
    if not math.isfinite(result):
        return None
    return result


def _latest_residual_value(db: Session, fund_id: int, as_of_date: date) -> float:
    rows = (
        db.query(Valuation)
        .filter(Valuation.fund_id == fund_id, Valuation.as_of_date <= as_of_date)
        .order_by(Valuation.investment_id.asc(), Valuation.as_of_date.desc(), Valuation.id.desc())
        .all()
    )
    latest_by_investment: dict[int, Valuation] = {}
    for row in rows:
        if row.investment_id in latest_by_investment:
            continue
        latest_by_investment[row.investment_id] = row

    total = 0.0
    for row in latest_by_investment.values():
        if row.total_fair_value is not None:
            total += float(row.total_fair_value)
        else:
            total += float(row.value or 0)
    return total


async def calculate_fund_performance(
    db: Session,
    fund_id: int,
    as_of_date: date | None = None,
) -> dict:
    cutoff = as_of_date or date.today()

    paid_in_total = float(
        db.query(func.coalesce(func.sum(LP.paid_in), 0))
        .filter(LP.fund_id == fund_id)
        .scalar()
        or 0
    )

    distributed_from_details = float(
        db.query(func.coalesce(func.sum(DistributionDetail.distribution_amount), 0))
        .join(Distribution, Distribution.id == DistributionDetail.distribution_id)
        .filter(Distribution.fund_id == fund_id, Distribution.dist_date <= cutoff)
        .scalar()
        or 0
    )
    if distributed_from_details > 0:
        total_distributed = distributed_from_details
    else:
        total_distributed = float(
            db.query(func.coalesce(func.sum(Distribution.principal_total + Distribution.profit_total), 0))
            .filter(Distribution.fund_id == fund_id, Distribution.dist_date <= cutoff)
            .scalar()
            or 0
        )

    residual_value = _latest_residual_value(db, fund_id, cutoff)

    tvpi = ((total_distributed + residual_value) / paid_in_total) if paid_in_total > 0 else 0.0
    dpi = (total_distributed / paid_in_total) if paid_in_total > 0 else 0.0

    cashflows: list[tuple[date, float]] = []
    calls = (
        db.query(CapitalCall)
        .filter(CapitalCall.fund_id == fund_id, CapitalCall.call_date <= cutoff)
        .order_by(CapitalCall.call_date.asc(), CapitalCall.id.asc())
        .all()
    )
    for row in calls:
        amount = float(row.total_amount or 0)
        if amount > 0:
            cashflows.append((row.call_date, -amount))

    distributions = (
        db.query(Distribution)
        .filter(Distribution.fund_id == fund_id, Distribution.dist_date <= cutoff)
        .order_by(Distribution.dist_date.asc(), Distribution.id.asc())
        .all()
    )
    for row in distributions:
        amount = float(row.principal_total or 0) + float(row.profit_total or 0)
        if amount > 0:
            cashflows.append((row.dist_date, amount))

    if residual_value > 0:
        cashflows.append((cutoff, residual_value))

    irr_value = _xirr(cashflows)

    return {
        "irr": round(float(irr_value), 6) if irr_value is not None else None,
        "tvpi": round(float(tvpi), 6),
        "dpi": round(float(dpi), 6),
        "total_paid_in": round(paid_in_total, 2),
        "total_distributed": round(total_distributed, 2),
        "residual_value": round(residual_value, 2),
        "as_of_date": cutoff.isoformat(),
    }
