from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal
from models.fund import Fund, LP
from models.phase3 import CapitalCall, CapitalCallItem


def _paid_totals_by_lp(db: Session, fund_id: int) -> dict[int, int]:
    rows = (
        db.query(
            CapitalCallItem.lp_id.label("lp_id"),
            func.coalesce(func.sum(CapitalCallItem.amount), 0).label("paid_total"),
        )
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(
            CapitalCall.fund_id == fund_id,
            CapitalCallItem.paid == 1,
        )
        .group_by(CapitalCallItem.lp_id)
        .all()
    )
    return {int(row.lp_id): int(row.paid_total or 0) for row in rows}


def run_audit(
    db: Session,
    *,
    fund_id: int | None = None,
    apply_changes: bool = False,
) -> int:
    funds_query = db.query(Fund).order_by(Fund.id.asc())
    if fund_id is not None:
        funds_query = funds_query.filter(Fund.id == fund_id)
    funds = funds_query.all()

    if not funds:
        print("No funds found for the given scope.")
        return 0

    changed_lp_count = 0
    mismatch_count = 0
    lp_overflow_count = 0
    fund_overflow_count = 0

    for fund in funds:
        lps = db.query(LP).filter(LP.fund_id == fund.id).order_by(LP.id.asc()).all()
        paid_by_lp = _paid_totals_by_lp(db, fund.id)
        fund_paid_total = 0

        for lp in lps:
            expected_paid_in = int(paid_by_lp.get(lp.id, 0))
            current_paid_in = int(lp.paid_in or 0)
            fund_paid_total += expected_paid_in

            if current_paid_in != expected_paid_in:
                mismatch_count += 1
                print(
                    f"[MISMATCH] fund={fund.id} lp={lp.id} "
                    f"stored={current_paid_in} expected={expected_paid_in}"
                )
                if apply_changes:
                    lp.paid_in = expected_paid_in
                    changed_lp_count += 1

            commitment = None if lp.commitment is None else int(lp.commitment)
            if commitment is not None and expected_paid_in > commitment:
                lp_overflow_count += 1
                print(
                    f"[OVERFLOW:LP] fund={fund.id} lp={lp.id} "
                    f"paid_in={expected_paid_in} commitment={commitment}"
                )

        fund_commitment = None if fund.commitment_total is None else int(fund.commitment_total)
        if fund_commitment is not None and fund_paid_total > fund_commitment:
            fund_overflow_count += 1
            print(
                f"[OVERFLOW:FUND] fund={fund.id} "
                f"paid_in_total={fund_paid_total} commitment_total={fund_commitment}"
            )

    if apply_changes:
        db.commit()
    else:
        db.rollback()

    print("--- Audit Summary ---")
    print(f"funds_checked={len(funds)}")
    print(f"lp_mismatch_count={mismatch_count}")
    print(f"lp_changed_count={changed_lp_count}")
    print(f"lp_overflow_count={lp_overflow_count}")
    print(f"fund_overflow_count={fund_overflow_count}")
    print(f"mode={'apply' if apply_changes else 'dry-run'}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit and fix LP paid_in from CapitalCallItem data.")
    parser.add_argument("--fund-id", type=int, default=None, help="Optional fund id scope")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist recalculated LP paid_in values (default: dry-run)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db = SessionLocal()
    try:
        return run_audit(
            db,
            fund_id=args.fund_id,
            apply_changes=bool(args.apply),
        )
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
