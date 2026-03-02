from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.orm import Session

from models.fee import ManagementFee
from models.fund import Fund
from models.phase3 import CapitalCall, Distribution, ExitTrade


@dataclass
class CashFlowItem:
    date: date
    category: str
    description: str
    inflow: float
    outflow: float
    source_id: int | None
    source_type: str | None
    is_confirmed: bool

    def to_dict(self) -> dict:
        return {
            "date": self.date.isoformat(),
            "category": self.category,
            "description": self.description,
            "inflow": round(self.inflow, 2),
            "outflow": round(self.outflow, 2),
            "source_id": self.source_id,
            "source_type": self.source_type,
            "is_confirmed": bool(self.is_confirmed),
        }


def _month_start(value: date) -> date:
    return date(value.year, value.month, 1)


def _add_months(value: date, months: int) -> date:
    year = value.year + ((value.month - 1 + months) // 12)
    month = ((value.month - 1 + months) % 12) + 1
    return date(year, month, 1)


def _end_of_month(value: date) -> date:
    next_month = _add_months(_month_start(value), 1)
    return next_month - timedelta(days=1)


def _is_capital_call_confirmed(call: CapitalCall) -> bool:
    if not call.items:
        return call.call_date <= date.today()
    return all(int(item.paid or 0) == 1 for item in call.items)


async def project_cashflow(
    db: Session,
    fund_id: int,
    months_ahead: int = 12,
    operating_cost_monthly: float = 0,
) -> dict:
    fund = db.get(Fund, fund_id)
    if not fund:
        raise ValueError("fund not found")

    horizon = max(1, min(int(months_ahead or 12), 24))
    today = date.today()
    horizon_end = _end_of_month(_add_months(today, horizon - 1))

    items: list[CashFlowItem] = []

    calls = (
        db.query(CapitalCall)
        .filter(CapitalCall.fund_id == fund_id, CapitalCall.call_date <= horizon_end)
        .order_by(CapitalCall.call_date.asc(), CapitalCall.id.asc())
        .all()
    )
    for row in calls:
        amount = float(row.total_amount or 0)
        if amount <= 0:
            continue
        confirmed = _is_capital_call_confirmed(row)
        items.append(
            CashFlowItem(
                date=row.call_date,
                category="capital_call",
                description=f"자본금 콜 #{row.id}",
                inflow=amount,
                outflow=0.0,
                source_id=row.id,
                source_type="capital_call",
                is_confirmed=confirmed,
            )
        )

    distributions = (
        db.query(Distribution)
        .filter(Distribution.fund_id == fund_id, Distribution.dist_date <= horizon_end)
        .order_by(Distribution.dist_date.asc(), Distribution.id.asc())
        .all()
    )
    for row in distributions:
        amount = float(row.principal_total or 0) + float(row.profit_total or 0)
        if amount <= 0:
            continue
        items.append(
            CashFlowItem(
                date=row.dist_date,
                category="distribution",
                description=f"배분 #{row.id}",
                inflow=0.0,
                outflow=amount,
                source_id=row.id,
                source_type="distribution",
                is_confirmed=row.dist_date <= today,
            )
        )

    fees = (
        db.query(ManagementFee)
        .filter(ManagementFee.fund_id == fund_id)
        .order_by(ManagementFee.year.asc(), ManagementFee.quarter.asc(), ManagementFee.id.asc())
        .all()
    )
    for row in fees:
        base_month = ((int(row.quarter or 1) - 1) * 3) + 1
        fee_date = date(int(row.year or today.year), min(max(base_month, 1), 12), 1)
        if fee_date > horizon_end:
            continue
        amount = float(row.fee_amount or 0)
        if amount <= 0:
            continue
        status = (row.status or "").strip().lower()
        confirmed = status in {"수령", "received", "완료"}
        items.append(
            CashFlowItem(
                date=fee_date,
                category="mgmt_fee",
                description=f"관리보수 {row.year}Q{row.quarter}",
                inflow=0.0,
                outflow=amount,
                source_id=row.id,
                source_type="management_fee",
                is_confirmed=confirmed,
            )
        )

    exits = (
        db.query(ExitTrade)
        .filter(ExitTrade.fund_id == fund_id, ExitTrade.trade_date <= horizon_end)
        .order_by(ExitTrade.trade_date.asc(), ExitTrade.id.asc())
        .all()
    )
    for row in exits:
        amount = float(
            row.settlement_amount
            if row.settlement_status == "정산완료" and row.settlement_amount is not None
            else row.net_amount if row.net_amount is not None else 0
        )
        if amount <= 0:
            continue
        occurred_at = row.settlement_date or row.trade_date
        if occurred_at > horizon_end:
            continue
        is_settled = (row.settlement_status or "").strip() == "정산완료"
        items.append(
            CashFlowItem(
                date=occurred_at,
                category="exit",
                description=f"엑시트 #{row.id}",
                inflow=amount,
                outflow=0.0,
                source_id=row.id,
                source_type="exit_trade",
                is_confirmed=is_settled,
            )
        )

    operating_cost = float(operating_cost_monthly or 0)
    if operating_cost > 0:
        for offset in range(horizon):
            month = _add_months(today, offset)
            items.append(
                CashFlowItem(
                    date=month,
                    category="operating",
                    description=f"운영비 ({month.year}-{month.month:02d})",
                    inflow=0.0,
                    outflow=operating_cost,
                    source_id=None,
                    source_type="projection",
                    is_confirmed=False,
                )
            )

    items.sort(key=lambda row: (row.date, row.category, row.source_id or 0))

    current_balance = 0.0
    for row in items:
        if row.date <= today:
            current_balance += row.inflow - row.outflow

    month_map: dict[str, dict[str, float]] = defaultdict(lambda: {
        "total_inflow": 0.0,
        "total_outflow": 0.0,
        "net": 0.0,
        "ending_balance": 0.0,
    })

    running_balance = current_balance
    for offset in range(horizon):
        month_start = _add_months(today, offset)
        month_key = f"{month_start.year}-{month_start.month:02d}"
        month_end = _end_of_month(month_start)
        month_items = [row for row in items if month_start <= row.date <= month_end]

        inflow = sum(row.inflow for row in month_items)
        outflow = sum(row.outflow for row in month_items)
        net = inflow - outflow
        running_balance += net

        summary = month_map[month_key]
        summary["total_inflow"] = round(inflow, 2)
        summary["total_outflow"] = round(outflow, 2)
        summary["net"] = round(net, 2)
        summary["ending_balance"] = round(running_balance, 2)

    monthly_summary = [
        {
            "year_month": key,
            **value,
        }
        for key, value in sorted(month_map.items())
    ]

    return {
        "fund_id": fund.id,
        "fund_name": fund.name,
        "current_balance": round(current_balance, 2),
        "monthly_summary": monthly_summary,
        "items": [row.to_dict() for row in items],
    }
