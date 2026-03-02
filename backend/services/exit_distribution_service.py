from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from models.fund import Fund, LP
from models.phase3 import Distribution, DistributionDetail, DistributionItem, ExitTrade
from services.auto_journal import create_event_journal_entry


async def create_distribution_from_exit(
    db: Session,
    exit_trade_id: int,
    auto_journal: bool = True,
) -> dict:
    """Create LP distribution draft from settled exit trade."""
    trade = db.get(ExitTrade, exit_trade_id)
    if not trade:
        raise ValueError("exit trade not found")

    settlement_status = (trade.settlement_status or "").strip().lower()
    if settlement_status not in {"정산완료", "settled", "completed"}:
        raise ValueError("exit trade is not settled")

    settlement_amount = float(
        trade.settlement_amount
        if trade.settlement_amount is not None
        else trade.net_amount
        if trade.net_amount is not None
        else 0
    )
    if settlement_amount <= 0:
        raise ValueError("settlement amount must be positive")

    settlement_date = trade.settlement_date or date.today()

    marker = f"[exit_trade:{trade.id}]"
    existing = (
        db.query(Distribution)
        .filter(
            Distribution.fund_id == trade.fund_id,
            Distribution.memo.isnot(None),
            Distribution.memo.like(f"%{marker}%"),
        )
        .order_by(Distribution.id.desc())
        .first()
    )

    details_count = 0
    distribution: Distribution
    if existing is not None:
        distribution = existing
        details_count = (
            db.query(DistributionDetail)
            .filter(DistributionDetail.distribution_id == distribution.id)
            .count()
        )
    else:
        fund = db.get(Fund, trade.fund_id)
        lps = list(fund.lps) if fund else []
        lps = [lp for lp in lps if float(lp.commitment or 0) > 0]
        if not lps:
            raise ValueError("fund has no LP commitment records")

        total_commitment = float(sum(float(lp.commitment or 0) for lp in lps))
        if total_commitment <= 0:
            raise ValueError("total commitment must be positive")

        distribution = Distribution(
            fund_id=trade.fund_id,
            dist_date=settlement_date,
            dist_type="exit",
            principal_total=0,
            profit_total=settlement_amount,
            performance_fee=0,
            memo=f"{marker} auto distribution draft",
        )
        db.add(distribution)
        db.flush()

        assigned = 0.0
        for index, lp in enumerate(lps):
            ratio = float(lp.commitment or 0) / total_commitment
            if index == len(lps) - 1:
                lp_amount = round(max(settlement_amount - assigned, 0.0), 2)
            else:
                lp_amount = round(settlement_amount * ratio, 2)
                assigned += lp_amount

            db.add(
                DistributionItem(
                    distribution_id=distribution.id,
                    lp_id=lp.id,
                    principal=0,
                    profit=int(round(lp_amount)),
                )
            )
            db.add(
                DistributionDetail(
                    distribution_id=distribution.id,
                    lp_id=lp.id,
                    distribution_amount=lp_amount,
                    distribution_type="수익배분",
                    paid=False,
                )
            )
            details_count += 1

        db.flush()

    journal_entry = None
    if auto_journal:
        journal_entry = create_event_journal_entry(
            db,
            event_key="distribution_exit",
            fund_id=trade.fund_id,
            amount=settlement_amount,
            entry_date=settlement_date,
            source_type="distribution",
            source_id=distribution.id,
            description_override=f"엑시트 배분 자동분개 (ExitTrade #{trade.id})",
            status="미결재",
        )

    return {
        "distribution_id": int(distribution.id),
        "details_count": int(details_count),
        "journal_entry_id": int(journal_entry.id) if journal_entry else None,
        "message": "배분 초안이 생성되었습니다.",
    }
