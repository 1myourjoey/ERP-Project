from __future__ import annotations

from calendar import isleap
from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.fee import FeeConfig, ManagementFee
from models.fund import Fund
from models.investment import Investment
from models.valuation import Valuation
from services.auto_journal import create_event_journal_entry

PRORATION_METHODS = {"equal_quarter", "actual_365", "actual_366", "actual_actual"}


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


def _quarter_last_date(year: int, quarter: int) -> date:
    if quarter == 4:
        return date(year, 12, 31)
    month = ((quarter - 1) * 3) + 4
    return date(year, month, 1) - timedelta(days=1)


def _quarter_days(year: int, quarter: int) -> int:
    return (_quarter_last_date(year, quarter) - _quarter_first_date(year, quarter)).days + 1


def _normalize_basis(value: str | None, fallback: str = "commitment") -> str:
    basis = (value or fallback).strip().lower()
    if basis in {"commitment", "nav", "invested"}:
        return basis
    return fallback


def _normalize_proration_method(value: str | None) -> str:
    method = (value or "equal_quarter").strip().lower()
    if method in PRORATION_METHODS:
        return method
    return "equal_quarter"


def _resolve_basis_amount(db: Session, fund: Fund, basis: str) -> float:
    if basis == "nav":
        return _latest_nav(db, fund.id)
    if basis == "invested":
        return _invested_total(db, fund.id)
    return float(fund.commitment_total or 0)


def _resolve_phase(fund: Fund, year: int, quarter: int) -> str:
    if not fund.investment_period_end:
        return "investment"
    quarter_start = _quarter_first_date(year, quarter)
    quarter_end = _quarter_last_date(year, quarter)
    if quarter_start > fund.investment_period_end:
        return "post_investment"
    if quarter_start <= fund.investment_period_end < quarter_end:
        return "split"
    return "investment"


def _resolve_fee_terms(db: Session, fund: Fund, config: FeeConfig, phase: str) -> tuple[str, float, float]:
    if phase == "post_investment":
        basis = _normalize_basis(config.liquidation_fee_basis, _normalize_basis(config.mgmt_fee_basis))
        fee_rate = float(
            config.liquidation_fee_rate if config.liquidation_fee_rate is not None else (config.mgmt_fee_rate or 0)
        )
    else:
        basis = _normalize_basis(config.mgmt_fee_basis)
        fee_rate = float(config.mgmt_fee_rate or 0)
    basis_amount = _resolve_basis_amount(db, fund, basis)
    return basis, fee_rate, basis_amount


def _resolve_proration(method: str, period_days: int, year: int, quarter_days: int) -> tuple[float, int | None]:
    normalized = _normalize_proration_method(method)
    if normalized == "actual_365":
        return period_days / 365, 365
    if normalized == "actual_366":
        return period_days / 366, 366
    if normalized == "actual_actual":
        year_days = 366 if isleap(year) else 365
        return period_days / year_days, year_days
    return (period_days / quarter_days) * 0.25, None


def _build_calculation_result(db: Session, fund: Fund, config: FeeConfig, year: int, quarter: int) -> dict[str, object]:
    phase = _resolve_phase(fund, year, quarter)
    quarter_days = _quarter_days(year, quarter)
    proration_method = _normalize_proration_method(config.mgmt_fee_proration_method)

    if phase != "split":
        fee_basis, fee_rate, basis_amount = _resolve_fee_terms(db, fund, config, phase)
        proration_factor, year_days = _resolve_proration(proration_method, quarter_days, year, quarter_days)
        return {
            "fee_basis": fee_basis,
            "fee_rate": fee_rate,
            "basis_amount": basis_amount,
            "fee_amount": round(basis_amount * fee_rate * proration_factor, 2),
            "proration_method": proration_method,
            "period_days": quarter_days,
            "year_days": year_days,
            "applied_phase": phase,
            "calculation_detail": None,
        }

    split_date = fund.investment_period_end
    assert split_date is not None
    investment_days = (split_date - _quarter_first_date(year, quarter)).days + 1
    post_days = (_quarter_last_date(year, quarter) - (split_date + timedelta(days=1))).days + 1

    investment_basis, investment_rate, investment_basis_amount = _resolve_fee_terms(db, fund, config, "investment")
    post_basis, post_rate, post_basis_amount = _resolve_fee_terms(db, fund, config, "post_investment")
    investment_factor, investment_year_days = _resolve_proration(proration_method, investment_days, year, quarter_days)
    post_factor, post_year_days = _resolve_proration(proration_method, post_days, year, quarter_days)
    fee_amount = round(
        (investment_basis_amount * investment_rate * investment_factor)
        + (post_basis_amount * post_rate * post_factor),
        2,
    )
    if investment_year_days and post_year_days:
        calculation_detail = (
            f"투자기간 중 {investment_basis} × {investment_rate:.4f} × {investment_days}/{investment_year_days} + "
            f"종료 후 {post_basis} × {post_rate:.4f} × {post_days}/{post_year_days}"
        )
    else:
        calculation_detail = (
            f"투자기간 중 {investment_basis} × {investment_rate:.4f} × {investment_days}일 + "
            f"종료 후 {post_basis} × {post_rate:.4f} × {post_days}일"
        )
    return {
        "fee_basis": "split",
        "fee_rate": investment_rate,
        "basis_amount": investment_basis_amount,
        "fee_amount": fee_amount,
        "proration_method": proration_method,
        "period_days": investment_days + post_days,
        "year_days": investment_year_days if investment_year_days == post_year_days else None,
        "applied_phase": "split",
        "calculation_detail": calculation_detail,
    }


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

    calculation = _build_calculation_result(db, fund, config, year, quarter)

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

    row.fee_basis = str(calculation["fee_basis"])
    row.fee_rate = float(calculation["fee_rate"])
    row.basis_amount = float(calculation["basis_amount"])
    row.fee_amount = float(calculation["fee_amount"])
    row.proration_method = str(calculation["proration_method"])
    row.period_days = int(calculation["period_days"]) if calculation["period_days"] is not None else None
    row.year_days = int(calculation["year_days"]) if calculation["year_days"] is not None else None
    row.applied_phase = str(calculation["applied_phase"])
    row.calculation_detail = calculation["calculation_detail"]
    row.status = "계산완료"

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
