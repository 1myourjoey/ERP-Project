from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from models.fund import Fund, LP
from models.lp_contribution import LPContribution
from models.phase3 import CapitalCall, CapitalCallItem

PAID_IN_EXCEEDS_COMMITMENT_ERROR = "Paid-in total cannot exceed committed capital."


def _manual_paid_in_by_lp(
    db: Session,
    fund_id: int,
    lp_ids: list[int] | None = None,
) -> dict[int, int]:
    query = (
        db.query(
            LPContribution.lp_id.label("lp_id"),
            func.coalesce(func.sum(LPContribution.amount), 0).label("paid_total"),
        )
        .filter(
            LPContribution.fund_id == fund_id,
            LPContribution.actual_paid_date.isnot(None),
            LPContribution.capital_call_id.is_(None),
        )
    )
    if lp_ids is not None:
        query = query.filter(LPContribution.lp_id.in_(lp_ids))
    rows = query.group_by(LPContribution.lp_id).all()
    return {int(row.lp_id): int(row.paid_total or 0) for row in rows}


def _paid_in_by_lp(
    db: Session,
    fund_id: int,
    lp_ids: list[int] | None = None,
) -> dict[int, int]:
    query = (
        db.query(
            CapitalCallItem.lp_id.label("lp_id"),
            func.coalesce(func.sum(CapitalCallItem.amount), 0).label("paid_total"),
        )
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(
            CapitalCall.fund_id == fund_id,
            CapitalCallItem.paid == 1,
        )
    )
    if lp_ids is not None:
        query = query.filter(CapitalCallItem.lp_id.in_(lp_ids))
    rows = query.group_by(CapitalCallItem.lp_id).all()
    capital_call_paid = {int(row.lp_id): int(row.paid_total or 0) for row in rows}
    manual_paid = _manual_paid_in_by_lp(db, fund_id, lp_ids=lp_ids)

    combined = dict(manual_paid)
    for lp_id, paid_total in capital_call_paid.items():
        combined[lp_id] = int(combined.get(lp_id, 0)) + int(paid_total)
    return combined


def _fund_paid_total(db: Session, fund_id: int) -> int:
    call_total = (
        db.query(func.coalesce(func.sum(CapitalCallItem.amount), 0))
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(
            CapitalCall.fund_id == fund_id,
            CapitalCallItem.paid == 1,
        )
        .scalar()
    )
    manual_total = (
        db.query(func.coalesce(func.sum(LPContribution.amount), 0))
        .filter(
            LPContribution.fund_id == fund_id,
            LPContribution.actual_paid_date.isnot(None),
            LPContribution.capital_call_id.is_(None),
        )
        .scalar()
    )
    return int(call_total or 0) + int(manual_total or 0)


def validate_lp_paid_in_pair(
    *,
    commitment: float | int | None,
    paid_in: float | int | None,
) -> None:
    if commitment is None or paid_in is None:
        return
    if float(paid_in) > float(commitment):
        raise HTTPException(status_code=400, detail=PAID_IN_EXCEEDS_COMMITMENT_ERROR)


def validate_paid_in_deltas(
    db: Session,
    fund_id: int,
    lp_paid_deltas: dict[int, int] | None,
) -> None:
    if not lp_paid_deltas:
        return

    normalized: dict[int, int] = {}
    for lp_id, delta in lp_paid_deltas.items():
        if int(delta or 0) == 0:
            continue
        normalized[int(lp_id)] = int(delta)
    if not normalized:
        return

    fund = (
        db.query(Fund)
        .filter(Fund.id == fund_id)
        .with_for_update()
        .first()
    )
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")

    lp_ids = sorted(normalized.keys())
    lp_rows = (
        db.query(LP)
        .filter(
            LP.fund_id == fund_id,
            LP.id.in_(lp_ids),
        )
        .with_for_update()
        .all()
    )
    lp_by_id = {row.id: row for row in lp_rows}
    missing_lp_ids = [lp_id for lp_id in lp_ids if lp_id not in lp_by_id]
    if missing_lp_ids:
        missing = ",".join(str(lp_id) for lp_id in missing_lp_ids)
        raise HTTPException(status_code=404, detail=f"LP not found: {missing}")

    paid_by_lp = _paid_in_by_lp(db, fund_id, lp_ids=lp_ids)
    for lp_id, lp in lp_by_id.items():
        projected_paid_in = int(paid_by_lp.get(lp_id, 0)) + int(normalized.get(lp_id, 0))
        validate_lp_paid_in_pair(
            commitment=lp.commitment,
            paid_in=projected_paid_in,
        )

    projected_fund_paid = _fund_paid_total(db, fund_id) + sum(normalized.values())
    if fund.commitment_total is not None and projected_fund_paid > int(fund.commitment_total):
        raise HTTPException(status_code=400, detail=PAID_IN_EXCEEDS_COMMITMENT_ERROR)


def recalculate_fund_stats(db: Session, fund_id: int) -> dict[str, int]:
    """Rebuild LP paid-in values without double-counting capital-call history."""
    lps = db.query(LP).filter(LP.fund_id == fund_id).all()
    capital_call_rows = (
        db.query(
            CapitalCallItem.lp_id.label("lp_id"),
            func.count(CapitalCallItem.id).label("row_count"),
            func.coalesce(
                func.sum(
                    case(
                        (CapitalCallItem.paid == 1, CapitalCallItem.amount),
                        else_=0,
                    )
                ),
                0,
            ).label("paid_total"),
        )
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(CapitalCall.fund_id == fund_id)
        .group_by(CapitalCallItem.lp_id)
        .all()
    )
    capital_call_map = {
        int(row.lp_id): {
            "row_count": int(row.row_count or 0),
            "paid_total": int(row.paid_total or 0),
        }
        for row in capital_call_rows
    }
    contribution_rows = (
        db.query(
            LPContribution.lp_id.label("lp_id"),
            func.count(LPContribution.id).label("row_count"),
            func.coalesce(func.sum(LPContribution.amount), 0).label("paid_total"),
        )
        .filter(
            LPContribution.fund_id == fund_id,
            LPContribution.actual_paid_date.isnot(None),
            LPContribution.capital_call_id.is_(None),
        )
        .group_by(LPContribution.lp_id)
        .all()
    )
    contribution_map = {
        int(row.lp_id): {
            "row_count": int(row.row_count or 0),
            "paid_total": int(row.paid_total or 0),
        }
        for row in contribution_rows
    }

    for lp in lps:
        capital_call_info = capital_call_map.get(lp.id)
        if capital_call_info and capital_call_info["row_count"] > 0:
            lp.paid_in = capital_call_info["paid_total"]
            continue

        contribution_info = contribution_map.get(lp.id)
        if contribution_info and contribution_info["row_count"] > 0:
            lp.paid_in = contribution_info["paid_total"]

    lp_paid_total = sum(int(lp.paid_in or 0) for lp in lps)
    paid_item_total = _fund_paid_total(db, fund_id)
    return {
        "fund_id": fund_id,
        "lp_paid_total": lp_paid_total,
        "paid_item_total": paid_item_total,
    }
