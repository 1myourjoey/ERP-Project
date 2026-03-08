from __future__ import annotations

from calendar import isleap
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.fee import FeeConfig, ManagementFee, PerformanceFeeSimulation
from models.fund import Fund, LP
from models.investment import Investment
from models.phase3 import Distribution
from models.valuation import Valuation
from schemas.fee import (
    FeeConfigInput,
    FeeConfigResponse,
    ManagementFeeCalculateRequest,
    ManagementFeeResponse,
    ManagementFeeUpdate,
    PerformanceFeeSimulateRequest,
    PerformanceFeeSimulationResponse,
    PerformanceFeeSimulationUpdate,
    WaterfallResponse,
)

router = APIRouter(tags=["fees"])

PRORATION_METHODS = {"equal_quarter", "actual_365", "actual_366", "actual_actual"}


def _ensure_fund(db: Session, fund_id: int) -> Fund:
    row = db.get(Fund, fund_id)
    if not row:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
    return row


def _to_float(value) -> float:
    if value is None:
        return 0.0
    return float(value)


def _percent_to_decimal(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value) / 100, 6)


def _decimal_to_percent(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value) * 100, 4)


def _latest_nav(db: Session, fund_id: int) -> float:
    rows = (
        db.query(Valuation)
        .filter(Valuation.fund_id == fund_id)
        .order_by(Valuation.as_of_date.desc(), Valuation.id.desc())
        .all()
    )
    latest_by_investment: dict[int, Valuation] = {}
    for row in rows:
        if row.investment_id not in latest_by_investment:
            latest_by_investment[row.investment_id] = row
    return float(sum(_to_float(row.total_fair_value) or _to_float(row.value) for row in latest_by_investment.values()))


def _total_invested(db: Session, fund_id: int) -> float:
    return float(
        db.query(func.coalesce(func.sum(Investment.amount), 0))
        .filter(Investment.fund_id == fund_id)
        .scalar()
        or 0
    )


def _quarter_date_range(year: int, quarter: int) -> tuple[date, date]:
    month = ((quarter - 1) * 3) + 1
    start = date(year, month, 1)
    if quarter == 4:
        end = date(year, 12, 31)
    else:
        end = date(year, month + 3, 1) - timedelta(days=1)
    return start, end


def _quarter_days(year: int, quarter: int) -> int:
    start, end = _quarter_date_range(year, quarter)
    return (end - start).days + 1


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


def _resolve_basis_amount(db: Session, fund: Fund, basis_type: str) -> float:
    if basis_type == "nav":
        return _latest_nav(db, fund.id)
    if basis_type == "invested":
        return _total_invested(db, fund.id)
    return float(fund.commitment_total or 0)


def _seed_config_from_fund(config: FeeConfig, fund: Fund | None) -> None:
    if not fund:
        return
    if fund.mgmt_fee_rate is not None:
        config.mgmt_fee_rate = _percent_to_decimal(fund.mgmt_fee_rate)
    if fund.performance_fee_rate is not None:
        config.carry_rate = _percent_to_decimal(fund.performance_fee_rate)
    if fund.hurdle_rate is not None:
        config.hurdle_rate = _percent_to_decimal(fund.hurdle_rate)


def _sync_fund_rates_from_config(fund: Fund | None, config: FeeConfig) -> None:
    if not fund:
        return
    fund.mgmt_fee_rate = _decimal_to_percent(_to_float(config.mgmt_fee_rate))
    fund.performance_fee_rate = _decimal_to_percent(_to_float(config.carry_rate))
    fund.hurdle_rate = _decimal_to_percent(_to_float(config.hurdle_rate))


def _resolve_phase(fund: Fund, year: int, quarter: int) -> str:
    if not fund.investment_period_end:
        return "investment"
    quarter_start, quarter_end = _quarter_date_range(year, quarter)
    if quarter_start > fund.investment_period_end:
        return "post_investment"
    if quarter_start <= fund.investment_period_end < quarter_end:
        return "split"
    return "investment"


def _resolve_fee_terms(db: Session, fund: Fund, config: FeeConfig, phase: str) -> tuple[str, float, float]:
    if phase == "post_investment":
        basis_type = _normalize_basis(config.liquidation_fee_basis, _normalize_basis(config.mgmt_fee_basis))
        fee_rate = float(
            config.liquidation_fee_rate if config.liquidation_fee_rate is not None else (config.mgmt_fee_rate or 0)
        )
    else:
        basis_type = _normalize_basis(config.mgmt_fee_basis)
        fee_rate = float(config.mgmt_fee_rate or 0)
    basis_amount = _resolve_basis_amount(db, fund, basis_type)
    return basis_type, fee_rate, basis_amount


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
    proration_method = _normalize_proration_method(config.mgmt_fee_proration_method)
    quarter_start, quarter_end = _quarter_date_range(year, quarter)
    quarter_days = _quarter_days(year, quarter)

    if phase != "split":
        basis_type, fee_rate, basis_amount = _resolve_fee_terms(db, fund, config, phase)
        period_days = quarter_days
        proration_factor, year_days = _resolve_proration(proration_method, period_days, year, quarter_days)
        fee_amount = round(basis_amount * fee_rate * proration_factor, 2)
        return {
            "applied_phase": phase,
            "fee_basis": basis_type,
            "fee_rate": fee_rate,
            "basis_amount": basis_amount,
            "fee_amount": fee_amount,
            "proration_method": proration_method,
            "period_days": period_days,
            "year_days": year_days,
            "calculation_detail": None,
        }

    split_date = fund.investment_period_end
    assert split_date is not None
    investment_days = (split_date - quarter_start).days + 1
    post_start = split_date + timedelta(days=1)
    post_days = (quarter_end - post_start).days + 1

    investment_basis, investment_rate, investment_basis_amount = _resolve_fee_terms(db, fund, config, "investment")
    post_basis, post_rate, post_basis_amount = _resolve_fee_terms(db, fund, config, "post_investment")

    investment_factor, investment_year_days = _resolve_proration(proration_method, investment_days, year, quarter_days)
    post_factor, post_year_days = _resolve_proration(proration_method, post_days, year, quarter_days)

    investment_fee = investment_basis_amount * investment_rate * investment_factor
    post_fee = post_basis_amount * post_rate * post_factor
    fee_amount = round(investment_fee + post_fee, 2)

    if investment_year_days and post_year_days:
        detail = (
            f"투자기간 중 {investment_basis} × {investment_rate:.4f} × {investment_days}/{investment_year_days} + "
            f"종료 후 {post_basis} × {post_rate:.4f} × {post_days}/{post_year_days}"
        )
    else:
        detail = (
            f"투자기간 중 {investment_basis} × {investment_rate:.4f} × {investment_days}일 + "
            f"종료 후 {post_basis} × {post_rate:.4f} × {post_days}일"
        )

    return {
        "applied_phase": "split",
        "fee_basis": "split",
        "fee_rate": investment_rate,
        "basis_amount": investment_basis_amount,
        "fee_amount": fee_amount,
        "proration_method": proration_method,
        "period_days": investment_days + post_days,
        "year_days": investment_year_days if investment_year_days == post_year_days else None,
        "calculation_detail": detail,
    }


def _serialize_mgmt_fee(db: Session, row: ManagementFee) -> ManagementFeeResponse:
    fund = db.get(Fund, row.fund_id)
    return ManagementFeeResponse(
        id=row.id,
        fund_id=row.fund_id,
        year=row.year,
        quarter=row.quarter,
        fee_basis=row.fee_basis,
        fee_rate=_to_float(row.fee_rate),
        basis_amount=_to_float(row.basis_amount),
        fee_amount=_to_float(row.fee_amount),
        proration_method=row.proration_method or "equal_quarter",
        period_days=row.period_days,
        year_days=row.year_days,
        applied_phase=row.applied_phase or "investment",
        calculation_detail=row.calculation_detail,
        status=row.status,
        invoice_date=row.invoice_date,
        payment_date=row.payment_date,
        memo=row.memo,
        created_at=row.created_at,
        fund_name=fund.name if fund else None,
    )


def _serialize_perf(db: Session, row: PerformanceFeeSimulation) -> PerformanceFeeSimulationResponse:
    fund = db.get(Fund, row.fund_id)
    return PerformanceFeeSimulationResponse(
        id=row.id,
        fund_id=row.fund_id,
        simulation_date=row.simulation_date,
        scenario=row.scenario,
        total_paid_in=_to_float(row.total_paid_in),
        total_distributed=_to_float(row.total_distributed),
        hurdle_amount=_to_float(row.hurdle_amount),
        excess_profit=_to_float(row.excess_profit),
        carry_amount=_to_float(row.carry_amount),
        lp_net_return=_to_float(row.lp_net_return),
        status=row.status,
        created_at=row.created_at,
        fund_name=fund.name if fund else None,
    )


def _get_or_create_config(db: Session, fund_id: int) -> FeeConfig:
    config = db.query(FeeConfig).filter(FeeConfig.fund_id == fund_id).first()
    if config:
        return config
    fund = db.get(Fund, fund_id)
    config = FeeConfig(fund_id=fund_id)
    _seed_config_from_fund(config, fund)
    db.add(config)
    db.flush()
    return config


@router.get("/api/fees/management", response_model=list[ManagementFeeResponse])
def list_management_fees(
    fund_id: int | None = None,
    year: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(ManagementFee)
    if fund_id:
        query = query.filter(ManagementFee.fund_id == fund_id)
    if year:
        query = query.filter(ManagementFee.year == year)
    rows = query.order_by(ManagementFee.year.desc(), ManagementFee.quarter.desc(), ManagementFee.id.desc()).all()
    return [_serialize_mgmt_fee(db, row) for row in rows]


@router.get("/api/fees/management/fund/{fund_id}", response_model=list[ManagementFeeResponse])
def list_management_fees_by_fund(fund_id: int, db: Session = Depends(get_db)):
    _ensure_fund(db, fund_id)
    rows = (
        db.query(ManagementFee)
        .filter(ManagementFee.fund_id == fund_id)
        .order_by(ManagementFee.year.desc(), ManagementFee.quarter.desc(), ManagementFee.id.desc())
        .all()
    )
    return [_serialize_mgmt_fee(db, row) for row in rows]


@router.post("/api/fees/management/calculate", response_model=ManagementFeeResponse)
def calculate_management_fee(
    data: ManagementFeeCalculateRequest,
    db: Session = Depends(get_db),
):
    fund = _ensure_fund(db, data.fund_id)
    try:
        config = _get_or_create_config(db, data.fund_id)
        calculation = _build_calculation_result(db, fund, config, data.year, data.quarter)

        row = (
            db.query(ManagementFee)
            .filter(
                ManagementFee.fund_id == data.fund_id,
                ManagementFee.year == data.year,
                ManagementFee.quarter == data.quarter,
            )
            .first()
        )
        if row is None:
            row = ManagementFee(
                fund_id=data.fund_id,
                year=data.year,
                quarter=data.quarter,
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
        if not row.status:
            row.status = "계산완료"

        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize_mgmt_fee(db, row)


@router.patch("/api/fees/management/{fee_id}", response_model=ManagementFeeResponse)
def update_management_fee(
    fee_id: int,
    data: ManagementFeeUpdate,
    db: Session = Depends(get_db),
):
    row = db.get(ManagementFee, fee_id)
    if not row:
        raise HTTPException(status_code=404, detail="관리보수를 찾을 수 없습니다")
    payload = data.model_dump(exclude_unset=True)
    for key, value in payload.items():
        setattr(row, key, value)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize_mgmt_fee(db, row)


@router.get("/api/fees/config/{fund_id}", response_model=FeeConfigResponse)
def get_fee_config(fund_id: int, db: Session = Depends(get_db)):
    _ensure_fund(db, fund_id)
    config = _get_or_create_config(db, fund_id)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(config)
    return config


@router.put("/api/fees/config/{fund_id}", response_model=FeeConfigResponse)
def put_fee_config(
    fund_id: int,
    data: FeeConfigInput,
    db: Session = Depends(get_db),
):
    _ensure_fund(db, fund_id)
    config = _get_or_create_config(db, fund_id)
    payload = data.model_dump()
    for key, value in payload.items():
        setattr(config, key, value)
    _sync_fund_rates_from_config(db.get(Fund, fund_id), config)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(config)
    return config


@router.post("/api/fees/performance/simulate", response_model=PerformanceFeeSimulationResponse)
def simulate_performance_fee(
    data: PerformanceFeeSimulateRequest,
    db: Session = Depends(get_db),
):
    _ensure_fund(db, data.fund_id)
    scenario_factor = {
        "worst": 0.85,
        "base": 1.0,
        "best": 1.15,
    }
    factor = scenario_factor.get((data.scenario or "base").strip().lower(), 1.0)

    config = _get_or_create_config(db, data.fund_id)

    total_paid_in = float(
        db.query(func.coalesce(func.sum(LP.paid_in), 0)).filter(LP.fund_id == data.fund_id).scalar() or 0
    )
    realized_distributed = float(
        db.query(func.coalesce(func.sum(Distribution.principal_total + Distribution.profit_total), 0))
        .filter(Distribution.fund_id == data.fund_id)
        .scalar()
        or 0
    )
    nav = _latest_nav(db, data.fund_id)
    total_distributed = (realized_distributed + nav) * factor

    hurdle_amount = total_paid_in * float(config.hurdle_rate or 0)
    excess_profit = max(total_distributed - total_paid_in - hurdle_amount, 0.0)
    carry_amount = excess_profit * float(config.carry_rate or 0)
    lp_net_return = total_distributed - carry_amount

    row = PerformanceFeeSimulation(
        fund_id=data.fund_id,
        simulation_date=data.simulation_date,
        scenario=(data.scenario or "base").strip().lower(),
        total_paid_in=total_paid_in,
        total_distributed=total_distributed,
        hurdle_amount=hurdle_amount,
        excess_profit=excess_profit,
        carry_amount=carry_amount,
        lp_net_return=lp_net_return,
        status="시뮬레이션",
    )
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize_perf(db, row)


@router.get("/api/fees/performance/fund/{fund_id}", response_model=list[PerformanceFeeSimulationResponse])
def list_performance_simulations(fund_id: int, db: Session = Depends(get_db)):
    _ensure_fund(db, fund_id)
    rows = (
        db.query(PerformanceFeeSimulation)
        .filter(PerformanceFeeSimulation.fund_id == fund_id)
        .order_by(PerformanceFeeSimulation.simulation_date.desc(), PerformanceFeeSimulation.id.desc())
        .all()
    )
    return [_serialize_perf(db, row) for row in rows]


@router.patch("/api/fees/performance/{simulation_id}", response_model=PerformanceFeeSimulationResponse)
def update_performance_simulation(
    simulation_id: int,
    data: PerformanceFeeSimulationUpdate,
    db: Session = Depends(get_db),
):
    row = db.get(PerformanceFeeSimulation, simulation_id)
    if not row:
        raise HTTPException(status_code=404, detail="성과보수 시뮬레이션을 찾을 수 없습니다")
    payload = data.model_dump(exclude_unset=True)
    for key, value in payload.items():
        setattr(row, key, value)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize_perf(db, row)


@router.get("/api/fees/waterfall/{fund_id}", response_model=WaterfallResponse)
def get_waterfall(fund_id: int, db: Session = Depends(get_db)):
    _ensure_fund(db, fund_id)
    latest = (
        db.query(PerformanceFeeSimulation)
        .filter(PerformanceFeeSimulation.fund_id == fund_id)
        .order_by(PerformanceFeeSimulation.simulation_date.desc(), PerformanceFeeSimulation.id.desc())
        .first()
    )
    if latest is None:
        raise HTTPException(status_code=404, detail="성과보수 시뮬레이션 이력이 없습니다")

    total_distributed = _to_float(latest.total_distributed)
    lp_return_of_capital = min(_to_float(latest.total_paid_in), total_distributed)
    lp_hurdle_return = min(_to_float(latest.hurdle_amount), max(total_distributed - lp_return_of_capital, 0))
    gp_catch_up = max(_to_float(latest.excess_profit) * 0.25, 0)
    gp_carry = _to_float(latest.carry_amount)
    lp_residual = max(total_distributed - lp_return_of_capital - lp_hurdle_return - gp_catch_up - gp_carry, 0)

    return WaterfallResponse(
        total_distributed=total_distributed,
        lp_return_of_capital=lp_return_of_capital,
        lp_hurdle_return=lp_hurdle_return,
        gp_catch_up=gp_catch_up,
        gp_carry=gp_carry,
        lp_residual=lp_residual,
    )
