from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from models.biz_report import BizReport, BizReportRequest
from models.investment import Investment
from models.valuation import Valuation


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def evaluate_impairment(
    investment_id: int,
    db: Session,
    financial_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Evaluate IMP-01~04 flags and calculate an internal asset rating.

    Returns:
        {
            "rating": "AA" | "A" | "B" | "C" | "D",
            "impairment_type": "none" | "partial" | "full",
            "impairment_amount": float | None,
            "flags": list[str],
            "detail": dict[str, Any],
        }
    """
    investment = db.get(Investment, investment_id)
    if not investment:
        raise ValueError("투자건을 찾을 수 없습니다.")

    snapshot = financial_snapshot or {}

    latest_requests = (
        db.query(BizReportRequest)
        .join(BizReport, BizReport.id == BizReportRequest.biz_report_id)
        .filter(BizReportRequest.investment_id == investment_id)
        .order_by(BizReport.report_year.desc(), BizReportRequest.updated_at.desc(), BizReportRequest.id.desc())
        .limit(3)
        .all()
    )

    latest_request = latest_requests[0] if latest_requests else None

    paid_in_capital = _to_float(snapshot.get("paid_in_capital"))
    if paid_in_capital is None:
        paid_in_capital = _to_float(investment.amount) or 0.0

    total_equity = _to_float(snapshot.get("total_equity"))
    if total_equity is None and latest_request is not None:
        total_equity = _to_float(latest_request.total_equity)

    current_net_income = _to_float(snapshot.get("quarterly_net_income"))
    if current_net_income is None and latest_request is not None:
        current_net_income = _to_float(latest_request.net_income)

    flags: list[str] = []
    impairment_type = "none"
    impairment_amount: float | None = None

    # IMP-01: Capital impairment exceeds 50%.
    if paid_in_capital > 0 and total_equity is not None and total_equity < paid_in_capital * 0.5:
        ratio = ((paid_in_capital - total_equity) / paid_in_capital) * 100.0
        flags.append(f"IMP-01: 자본잠식 {ratio:.1f}%")
        impairment_type = "full"
        impairment_amount = max((paid_in_capital - total_equity), 0.0)

    # IMP-02: Net loss for 3 consecutive periods.
    net_incomes = [_to_float(row.net_income) for row in latest_requests]
    valid_net_incomes = [value for value in net_incomes if value is not None]
    if len(valid_net_incomes) >= 3 and all(value < 0 for value in valid_net_incomes[:3]):
        flags.append("IMP-02: 3기 연속 순손실")
        impairment_type = "full"

    # IMP-03: Revenue declined for 2 consecutive periods.
    revenues = [_to_float(row.revenue) for row in latest_requests]
    valid_revenues = [value for value in revenues if value is not None]
    if len(valid_revenues) >= 3:
        latest, prev1, prev2 = valid_revenues[0], valid_revenues[1], valid_revenues[2]
        if latest < prev1 < prev2:
            flags.append("IMP-03: 2기 연속 매출 감소")
            if impairment_type != "full":
                impairment_type = "partial"

    # IMP-04: Fair value dropped materially.
    latest_valuation = (
        db.query(Valuation)
        .filter(Valuation.investment_id == investment_id)
        .order_by(Valuation.as_of_date.desc(), Valuation.id.desc())
        .first()
    )
    fair_value = None
    if latest_valuation is not None:
        fair_value = _to_float(latest_valuation.total_fair_value)
        if fair_value is None:
            fair_value = _to_float(latest_valuation.value)

    valuation_base = paid_in_capital if paid_in_capital > 0 else (_to_float(investment.amount) or 0.0)
    if fair_value is not None and valuation_base > 0:
        fair_value_ratio = fair_value / valuation_base
        if fair_value_ratio <= 0.5:
            flags.append(f"IMP-04: 공정가치 급락 ({fair_value_ratio * 100:.1f}%)")
            impairment_type = "full"
        elif fair_value_ratio <= 0.7:
            flags.append(f"IMP-04: 공정가치 하락 ({fair_value_ratio * 100:.1f}%)")
            if impairment_type != "full":
                impairment_type = "partial"

        candidate_amount = max(valuation_base - fair_value, 0.0)
        impairment_amount = max(impairment_amount or 0.0, candidate_amount)

    if impairment_type == "full":
        rating = "D" if (total_equity is not None and total_equity <= 0) else "C"
    elif impairment_type == "partial":
        rating = "B"
    elif current_net_income is not None and current_net_income < 0:
        rating = "A"
    else:
        rating = "AA"

    return {
        "rating": rating,
        "impairment_type": impairment_type,
        "impairment_amount": impairment_amount,
        "flags": flags,
        "detail": {
            "paid_in_capital": paid_in_capital,
            "total_equity": total_equity,
            "current_net_income": current_net_income,
            "recent_net_incomes": valid_net_incomes,
            "recent_revenues": valid_revenues,
            "fair_value": fair_value,
            "valuation_base": valuation_base,
        },
    }
