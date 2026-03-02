from __future__ import annotations

from sqlalchemy.orm import Session

from models.biz_report import BizReport, BizReportRequest
from models.investment import Investment, PortfolioCompany
from models.valuation import Valuation


def _to_float(value) -> float:
    if value is None:
        return 0.0
    return float(value)


def _latest_valuation(db: Session, investment_id: int) -> Valuation | None:
    return (
        db.query(Valuation)
        .filter(Valuation.investment_id == investment_id)
        .order_by(Valuation.as_of_date.desc(), Valuation.id.desc())
        .first()
    )


async def suggest_valuation_updates(db: Session, biz_report_id: int) -> list[dict]:
    report = db.get(BizReport, biz_report_id)
    if not report:
        raise ValueError("biz report not found")

    requests = (
        db.query(BizReportRequest)
        .filter(BizReportRequest.biz_report_id == biz_report_id)
        .order_by(BizReportRequest.id.asc())
        .all()
    )

    suggestions: list[dict] = []
    for row in requests:
        investment = db.get(Investment, row.investment_id)
        if not investment:
            continue

        latest = _latest_valuation(db, investment.id)
        current_fair_value = float(
            latest.total_fair_value
            if latest and latest.total_fair_value is not None
            else latest.value
            if latest
            else investment.amount
            if investment.amount is not None
            else 0
        )
        if current_fair_value <= 0:
            continue

        revenue = _to_float(row.revenue)
        prev_revenue = _to_float(row.prev_revenue)
        operating_income = _to_float(row.operating_income)
        prev_operating_income = _to_float(row.prev_operating_income)
        net_income = _to_float(row.net_income)
        prev_net_income = _to_float(row.prev_net_income)

        score = 0.0
        reasons: list[str] = []

        if prev_revenue > 0 and revenue > 0:
            growth = (revenue - prev_revenue) / prev_revenue
            score += growth * 0.6
            if abs(growth) >= 0.1:
                direction = "증가" if growth > 0 else "감소"
                reasons.append(f"매출 {abs(growth) * 100:.1f}% {direction}")

        if prev_operating_income > 0 and operating_income > 0:
            growth = (operating_income - prev_operating_income) / prev_operating_income
            score += growth * 0.25
            if abs(growth) >= 0.1:
                direction = "증가" if growth > 0 else "감소"
                reasons.append(f"영업이익 {abs(growth) * 100:.1f}% {direction}")
        elif operating_income < 0:
            score -= 0.12
            reasons.append("영업손실 발생")

        if prev_net_income > 0 and net_income > 0:
            growth = (net_income - prev_net_income) / prev_net_income
            score += growth * 0.15
            if abs(growth) >= 0.1:
                direction = "증가" if growth > 0 else "감소"
                reasons.append(f"순이익 {abs(growth) * 100:.1f}% {direction}")
        elif net_income < 0:
            score -= 0.08
            reasons.append("순손실 발생")

        if score == 0 and not reasons:
            continue

        bounded_score = max(-0.35, min(0.35, score))
        suggested_fair_value = round(current_fair_value * (1 + bounded_score), 2)
        if suggested_fair_value <= 0:
            continue

        change_pct = round(((suggested_fair_value - current_fair_value) / current_fair_value) * 100, 2)

        company = db.get(PortfolioCompany, investment.company_id)
        suggestions.append(
            {
                "investment_id": investment.id,
                "company_name": company.name if company else f"Investment #{investment.id}",
                "current_fair_value": round(current_fair_value, 2),
                "suggested_fair_value": suggested_fair_value,
                "change_pct": change_pct,
                "reason": " / ".join(reasons) if reasons else "재무지표 변화 기반 제안",
            }
        )

    suggestions.sort(key=lambda row: abs(float(row["change_pct"])), reverse=True)
    return suggestions
