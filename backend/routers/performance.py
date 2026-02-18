from datetime import date
import math

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP
from models.investment import Investment
from models.phase3 import CapitalCall, CapitalCallItem, Distribution, DistributionItem
from models.transaction import Transaction
from models.valuation import Valuation
from schemas.phase3 import FundPerformanceResponse

router = APIRouter(tags=["performance"])

INVESTMENT_TRANSACTION_TYPES = {
    "investment",
    "follow_on",
    "additional_investment",
    "reinvestment",
}


def _xirr(cashflows: list[tuple[date, float]]) -> float | None:
    if len(cashflows) < 2:
        return None
    if not any(amount < 0 for _, amount in cashflows):
        return None
    if not any(amount > 0 for _, amount in cashflows):
        return None

    cashflows = sorted(cashflows, key=lambda x: x[0])
    base_date = cashflows[0][0]

    def npv(rate: float) -> float:
        total = 0.0
        for d, amount in cashflows:
            years = (d - base_date).days / 365.0
            total += amount / ((1.0 + rate) ** years)
        return total

    def d_npv(rate: float) -> float:
        total = 0.0
        for d, amount in cashflows:
            years = (d - base_date).days / 365.0
            total += -(years * amount) / ((1.0 + rate) ** (years + 1.0))
        return total

    rate = 0.1
    for _ in range(100):
        if rate <= -0.999999:
            return None
        f_val = npv(rate)
        d_val = d_npv(rate)
        if abs(d_val) < 1e-12:
            break
        next_rate = rate - (f_val / d_val)
        if not math.isfinite(next_rate):
            break
        if abs(next_rate - rate) < 1e-7:
            return next_rate
        rate = next_rate

    low = -0.9999
    high = 10.0
    f_low = npv(low)
    f_high = npv(high)
    if (f_low > 0 and f_high > 0) or (f_low < 0 and f_high < 0):
        return None

    for _ in range(200):
        mid = (low + high) / 2.0
        f_mid = npv(mid)
        if abs(f_mid) < 1e-7:
            return mid
        if (f_low < 0 < f_mid) or (f_low > 0 > f_mid):
            high = mid
            f_high = f_mid
        else:
            low = mid
            f_low = f_mid
    return (low + high) / 2.0


def _latest_residual_value(db: Session, *, fund_id: int, as_of_date: date) -> float:
    valuations = (
        db.query(Valuation)
        .filter(
            Valuation.fund_id == fund_id,
            Valuation.as_of_date <= as_of_date,
        )
        .order_by(Valuation.investment_id.asc(), Valuation.as_of_date.desc(), Valuation.id.desc())
        .all()
    )

    seen_investment_ids: set[int] = set()
    total = 0.0
    for row in valuations:
        if row.investment_id in seen_investment_ids:
            continue
        seen_investment_ids.add(row.investment_id)
        total += row.value or 0
    return total


@router.get("/api/funds/{fund_id}/performance", response_model=FundPerformanceResponse)
def get_fund_performance(
    fund_id: int,
    as_of_date: date | None = None,
    db: Session = Depends(get_db),
):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")

    cutoff = as_of_date or date.today()

    paid_in_from_call_items = float(
        db.query(func.coalesce(func.sum(CapitalCallItem.amount), 0))
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(
            CapitalCall.fund_id == fund_id,
            CapitalCall.call_date <= cutoff,
            CapitalCallItem.paid == 1,
            or_(CapitalCallItem.paid_date.is_(None), CapitalCallItem.paid_date <= cutoff),
        )
        .scalar()
        or 0
    )
    paid_in_total = (
        paid_in_from_call_items
        if paid_in_from_call_items > 0
        else float(db.query(func.coalesce(func.sum(LP.paid_in), 0)).filter(LP.fund_id == fund_id).scalar() or 0)
    )

    invested_from_transactions = float(
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.fund_id == fund_id,
            Transaction.transaction_date <= cutoff,
            Transaction.type.in_(tuple(INVESTMENT_TRANSACTION_TYPES)),
        )
        .scalar()
        or 0
    )
    invested_from_investments = float(
        db.query(func.coalesce(func.sum(Investment.amount), 0))
        .filter(Investment.fund_id == fund_id)
        .scalar()
        or 0
    )
    total_invested = invested_from_transactions if invested_from_transactions > 0 else invested_from_investments

    distributed_from_items = float(
        db.query(func.coalesce(func.sum(DistributionItem.principal + DistributionItem.profit), 0))
        .join(Distribution, Distribution.id == DistributionItem.distribution_id)
        .filter(Distribution.fund_id == fund_id, Distribution.dist_date <= cutoff)
        .scalar()
        or 0
    )
    if distributed_from_items > 0:
        total_distributed = distributed_from_items
    else:
        distribution_totals = (
            db.query(
                func.coalesce(func.sum(Distribution.principal_total), 0),
                func.coalesce(func.sum(Distribution.profit_total), 0),
            )
            .filter(Distribution.fund_id == fund_id, Distribution.dist_date <= cutoff)
            .first()
        )
        total_distributed = float((distribution_totals[0] or 0) + (distribution_totals[1] or 0))

    residual_value = _latest_residual_value(db, fund_id=fund_id, as_of_date=cutoff)
    total_value = total_distributed + residual_value

    tvpi = round(total_value / paid_in_total, 6) if paid_in_total > 0 else None
    dpi = round(total_distributed / paid_in_total, 6) if paid_in_total > 0 else None
    rvpi = round(residual_value / paid_in_total, 6) if paid_in_total > 0 else None

    cashflows: list[tuple[date, float]] = []
    capital_calls = (
        db.query(CapitalCall)
        .filter(CapitalCall.fund_id == fund_id, CapitalCall.call_date <= cutoff)
        .order_by(CapitalCall.call_date.asc(), CapitalCall.id.asc())
        .all()
    )
    for row in capital_calls:
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
        amount = float((row.principal_total or 0) + (row.profit_total or 0))
        if amount > 0:
            cashflows.append((row.dist_date, amount))

    if residual_value > 0:
        cashflows.append((cutoff, float(residual_value)))

    irr_value = _xirr(cashflows)
    irr = round(irr_value, 6) if irr_value is not None else None

    return FundPerformanceResponse(
        fund_id=fund.id,
        fund_name=fund.name,
        paid_in_total=paid_in_total,
        total_invested=total_invested,
        total_distributed=total_distributed,
        residual_value=residual_value,
        total_value=total_value,
        irr=irr,
        tvpi=tvpi,
        dpi=dpi,
        rvpi=rvpi,
    )
