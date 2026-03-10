from __future__ import annotations

from database import SessionLocal
from services.erp_backbone import backfill_backbone


def main() -> None:
    db = SessionLocal()
    try:
        stats = backfill_backbone(db, emit_seed_events=True)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print("ERP backbone backfill complete")
    for key, value in stats.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
