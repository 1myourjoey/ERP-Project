from __future__ import annotations

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.fee import FeeConfig, ManagementFee
from models.fund import Fund
from models.investment import Investment
from models.valuation import Valuation
from services.auto_journal import create_event_journal_entry


def _latest_nav(db: Session, fund_id: int) -> float:
    rows = (
        db.query(Valuation)
        .filter(Valuation.fund_id == fund_id)
        .order_by(Valuation.as_of_date.desc(), Valuation.id.desc())
        .all()
    )
    seen: set[int] = set()
    total = 0.0
    for row in rows:
        if row.investment_id in seen:
            continue
        seen.add(row.investment_id)
        total += float(row.total_fair_value if row.total_fair_value is not None else row.value or 0)
    return total


def _invested_total(db: Session, fund_id: int) -> float:
    return float(
        db.query(func.coalesce(func.sum(Investment.amount), 0))
        .filter(Investment.fund_id == fund_id)
        .scalar()
        or 0
    )


def _quarter_first_date(year: int, quarter: int) -> date:
    month = ((quarter - 1) * 3) + 1
    return date(year, month, 1)


def _resolve_basis_amount(db: Session, fund: Fund, config: FeeConfig) -> tuple[str, float]:
    basis = (config.mgmt_fee_basis or "commitment").strip().lower()
    if basis == "nav":
        return "nav", _latest_nav(db, fund.id)
    if basis == "invested":
        return "invested", _invested_total(db, fund.id)
    return "commitment", float(fund.commitment_total or 0)


async def calculate_quarterly_fee(
    db: Session,
    fund_id: int,
    year: int,
    quarter: int,
) -> ManagementFee:
    fund = db.get(Fund, fund_id)
    if not fund:
        raise ValueError("fund not found")

    if quarter not in {1, 2, 3, 4}:
        raise ValueError("quarter must be between 1 and 4")

    config = db.query(FeeConfig).filter(FeeConfig.fund_id == fund_id).first()
    if not config:
        config = FeeConfig(fund_id=fund_id)
        db.add(config)
        db.flush()

    fee_basis, basis_amount = _resolve_basis_amount(db, fund, config)
    fee_rate = float(config.mgmt_fee_rate or 0)
    fee_amount = round(basis_amount * fee_rate / 4, 2)

    row = (
        db.query(ManagementFee)
        .filter(
            ManagementFee.fund_id == fund_id,
            ManagementFee.year == int(year),
            ManagementFee.quarter == int(quarter),
        )
        .first()
    )
    if row is None:
        row = ManagementFee(
            fund_id=fund_id,
            year=int(year),
            quarter=int(quarter),
        )
        db.add(row)

    row.fee_basis = fee_basis
    row.fee_rate = fee_rate
    row.basis_amount = basis_amount
    row.fee_amount = fee_amount
    row.status = "calculated"

    db.flush()

    create_event_journal_entry(
        db,
        event_key="management_fee",
        fund_id=fund_id,
        amount=fee_amount,
        entry_date=_quarter_first_date(int(year), int(quarter)),
        source_type="management_fee",
        source_id=row.id,
        description_override=f"{year}년 {quarter}분기 관리보수 자동계산",
        status="미결재",
    )

    db.commit()
    db.refresh(row)
    return row


async def auto_calculate_all_funds(
    db: Session,
    year: int,
    quarter: int,
) -> list[dict]:
    rows = (
        db.query(Fund)
        .filter(func.lower(func.coalesce(Fund.status, "")) == "active")
        .order_by(Fund.id.asc())
        .all()
    )

    result: list[dict] = []
    for fund in rows:
        try:
            row = await calculate_quarterly_fee(db, fund.id, year, quarter)
            result.append(
                {
                    "fund_id": fund.id,
                    "fund_name": fund.name,
                    "fee_id": row.id,
                    "fee_amount": float(row.fee_amount or 0),
                    "status": "ok",
                }
            )
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            result.append(
                {
                    "fund_id": fund.id,
                    "fund_name": fund.name,
                    "status": "error",
                    "error": str(exc),
                }
            )
    return result
