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
from models.fund import LP
from models.phase3 import CapitalCall, CapitalCallItem


def _paid_items_for_lp(db: Session, lp: LP) -> list[CapitalCallItem]:
    return (
        db.query(CapitalCallItem)
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(
            CapitalCall.fund_id == lp.fund_id,
            CapitalCallItem.lp_id == lp.id,
            CapitalCallItem.paid == 1,
        )
        .order_by(
            CapitalCall.call_date.desc(),
            CapitalCallItem.paid_date.desc(),
            CapitalCallItem.id.desc(),
        )
        .all()
    )


def _paid_total_for_lp(db: Session, lp: LP) -> int:
    total = (
        db.query(func.coalesce(func.sum(CapitalCallItem.amount), 0))
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(
            CapitalCall.fund_id == lp.fund_id,
            CapitalCallItem.lp_id == lp.id,
            CapitalCallItem.paid == 1,
        )
        .scalar()
    )
    return int(total or 0)


def _trim_overpaid_items(
    db: Session,
    *,
    lp: LP,
    commitment: int,
) -> tuple[int, int]:
    paid_items = _paid_items_for_lp(db, lp)
    total_paid = sum(int(item.amount or 0) for item in paid_items)
    overflow = total_paid - commitment
    if overflow <= 0:
        return (0, 0)

    trimmed_count = 0
    deleted_count = 0

    for item in paid_items:
        if overflow <= 0:
            break
        amount = int(item.amount or 0)
        if amount <= 0:
            db.delete(item)
            deleted_count += 1
            continue
        if amount <= overflow:
            db.delete(item)
            overflow -= amount
            deleted_count += 1
            continue
        item.amount = amount - overflow
        overflow = 0
        trimmed_count += 1

    return (trimmed_count, deleted_count)


def run_fix(db: Session, *, dry_run: bool = False) -> int:
    lps = db.query(LP).order_by(LP.fund_id.asc(), LP.id.asc()).all()
    stats = {
        "lp_checked": len(lps),
        "lp_overpaid": 0,
        "lp_paid_in_updated": 0,
        "items_trimmed": 0,
        "items_deleted": 0,
    }

    for lp in lps:
        commitment = int(lp.commitment or 0) if lp.commitment is not None else None
        paid_total = _paid_total_for_lp(db, lp)

        if commitment is not None and paid_total > commitment:
            stats["lp_overpaid"] += 1
            trimmed_count, deleted_count = _trim_overpaid_items(
                db,
                lp=lp,
                commitment=commitment,
            )
            stats["items_trimmed"] += trimmed_count
            stats["items_deleted"] += deleted_count
            paid_total = _paid_total_for_lp(db, lp)

        if commitment is None:
            next_paid_in = paid_total
        else:
            next_paid_in = min(paid_total, commitment)

        if int(lp.paid_in or 0) != int(next_paid_in):
            lp.paid_in = int(next_paid_in)
            stats["lp_paid_in_updated"] += 1

    if dry_run:
        db.rollback()
    else:
        db.commit()

    print("--- fix_overpaid_history summary ---")
    print(f"mode={'dry-run' if dry_run else 'apply'}")
    print(f"lp_checked={stats['lp_checked']}")
    print(f"lp_overpaid={stats['lp_overpaid']}")
    print(f"lp_paid_in_updated={stats['lp_paid_in_updated']}")
    print(f"items_trimmed={stats['items_trimmed']}")
    print(f"items_deleted={stats['items_deleted']}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Trim overpaid capital-call history and cap LP paid_in at commitment.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Calculate and print changes without committing.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db = SessionLocal()
    try:
        return run_fix(db, dry_run=bool(args.dry_run))
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
