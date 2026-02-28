from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP
from models.lp_contribution import LPContribution
from schemas.lp_contribution import (
    BulkLPContributionCreate,
    LPContributionCreate,
    LPContributionListItem,
    LPContributionResponse,
    LPContributionSummary,
    LPContributionUpdate,
)

router = APIRouter(tags=["lp-contributions"])


def _ensure_fund_and_lp(db: Session, fund_id: int, lp_id: int) -> LP:
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다.")
    lp = db.query(LP).filter(LP.id == lp_id, LP.fund_id == fund_id).first()
    if not lp:
        raise HTTPException(status_code=404, detail="LP를 찾을 수 없습니다.")
    return lp


def _calculate_commitment_ratio(amount: float, commitment: float | int | None) -> float | None:
    commitment_value = float(commitment or 0)
    if commitment_value <= 0:
        return None
    return round((float(amount) / commitment_value) * 100, 4)


def _auto_round_no(db: Session, fund_id: int, lp_id: int) -> int:
    max_round = (
        db.query(func.coalesce(func.max(LPContribution.round_no), 0))
        .filter(
            LPContribution.fund_id == fund_id,
            LPContribution.lp_id == lp_id,
        )
        .scalar()
    )
    return int(max_round or 0) + 1


def _sync_lp_paid_in(db: Session, lp_id: int, force_when_empty: bool = False) -> None:
    db.flush()

    contribution_count = (
        db.query(func.count(LPContribution.id))
        .filter(LPContribution.lp_id == lp_id)
        .scalar()
    )
    has_contribution = int(contribution_count or 0) > 0
    if not has_contribution and not force_when_empty:
        return

    lp = db.get(LP, lp_id)
    if lp is None:
        return

    if has_contribution:
        total = (
            db.query(func.coalesce(func.sum(LPContribution.amount), 0))
            .filter(LPContribution.lp_id == lp_id)
            .scalar()
        )
    else:
        total = 0
    lp.paid_in = int(total or 0)
    db.flush()


def _build_list_items(
    lp: LP,
    rows: list[LPContribution],
) -> list[LPContributionListItem]:
    items: list[LPContributionListItem] = []
    cumulative = 0.0
    for row in rows:
        amount = float(row.amount or 0)
        cumulative += amount
        items.append(
            LPContributionListItem(
                id=row.id,
                fund_id=row.fund_id,
                lp_id=row.lp_id,
                due_date=row.due_date,
                amount=amount,
                commitment_ratio=float(row.commitment_ratio) if row.commitment_ratio is not None else None,
                round_no=row.round_no,
                actual_paid_date=row.actual_paid_date,
                memo=row.memo,
                capital_call_id=row.capital_call_id,
                source=row.source,
                created_at=row.created_at,
                lp_name=lp.name,
                cumulative_amount=round(cumulative, 2),
            )
        )
    return items


def _fetch_lp_contribution_items(db: Session, fund_id: int, lp_id: int) -> tuple[LP, list[LPContributionListItem]]:
    lp = _ensure_fund_and_lp(db, fund_id, lp_id)
    rows = (
        db.query(LPContribution)
        .filter(
            LPContribution.fund_id == fund_id,
            LPContribution.lp_id == lp_id,
        )
        .order_by(
            LPContribution.due_date.asc(),
            LPContribution.round_no.asc(),
            LPContribution.id.asc(),
        )
        .all()
    )
    return lp, _build_list_items(lp, rows)


@router.get(
    "/api/funds/{fund_id}/lps/{lp_id}/contributions",
    response_model=list[LPContributionListItem],
)
def list_lp_contributions(
    fund_id: int,
    lp_id: int,
    db: Session = Depends(get_db),
):
    """LP별 납입 이력 조회(시간순, 누적금액 포함)."""
    _, items = _fetch_lp_contribution_items(db, fund_id, lp_id)
    return items


@router.get(
    "/api/funds/{fund_id}/lps/{lp_id}/contributions/summary",
    response_model=LPContributionSummary,
)
def get_lp_contribution_summary(
    fund_id: int,
    lp_id: int,
    db: Session = Depends(get_db),
):
    """LP별 납입 요약."""
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다.")

    lp, items = _fetch_lp_contribution_items(db, fund_id, lp_id)
    total_paid = sum(float(item.amount or 0) for item in items)
    commitment = float(lp.commitment or 0)
    paid_ratio = round((total_paid / commitment) * 100, 2) if commitment > 0 else 0.0

    return LPContributionSummary(
        lp_id=lp.id,
        lp_name=lp.name,
        commitment=commitment,
        total_paid_in=round(total_paid, 2),
        paid_ratio=paid_ratio,
        contribution_count=len(items),
        contribution_type=fund.contribution_type,
        contributions=items,
    )


@router.post(
    "/api/funds/{fund_id}/lps/{lp_id}/contributions",
    response_model=LPContributionResponse,
    status_code=201,
)
def create_lp_contribution(
    fund_id: int,
    lp_id: int,
    data: LPContributionCreate,
    db: Session = Depends(get_db),
):
    """납입 이력 수동 추가."""
    if data.fund_id != fund_id or data.lp_id != lp_id:
        raise HTTPException(status_code=400, detail="경로 파라미터와 payload의 fund/lp가 일치하지 않습니다.")

    lp = _ensure_fund_and_lp(db, fund_id, lp_id)
    contribution = LPContribution(
        fund_id=fund_id,
        lp_id=lp_id,
        due_date=data.due_date,
        amount=float(data.amount),
        commitment_ratio=_calculate_commitment_ratio(data.amount, lp.commitment),
        round_no=data.round_no or _auto_round_no(db, fund_id, lp_id),
        actual_paid_date=data.actual_paid_date,
        memo=data.memo,
        source=data.source or "manual",
    )
    db.add(contribution)
    _sync_lp_paid_in(db, lp_id)
    db.commit()
    db.refresh(contribution)
    return LPContributionResponse.model_validate(contribution)


@router.post(
    "/api/funds/{fund_id}/lps/{lp_id}/contributions/bulk",
    response_model=list[LPContributionResponse],
    status_code=201,
)
def bulk_create_lp_contributions(
    fund_id: int,
    lp_id: int,
    data: BulkLPContributionCreate,
    db: Session = Depends(get_db),
):
    """일괄 납입 이력 추가."""
    if data.fund_id != fund_id:
        raise HTTPException(status_code=400, detail="경로 fund_id와 payload fund_id가 일치하지 않습니다.")

    lp = _ensure_fund_and_lp(db, fund_id, lp_id)
    created: list[LPContribution] = []
    next_round_no = _auto_round_no(db, fund_id, lp_id)

    for item in data.contributions:
        if item.fund_id != fund_id or item.lp_id != lp_id:
            raise HTTPException(status_code=400, detail="일괄 payload 중 fund/lp가 경로 파라미터와 일치하지 않습니다.")
        round_no = item.round_no or next_round_no
        next_round_no = max(next_round_no + 1, round_no + 1)
        row = LPContribution(
            fund_id=fund_id,
            lp_id=lp_id,
            due_date=item.due_date,
            amount=float(item.amount),
            commitment_ratio=_calculate_commitment_ratio(item.amount, lp.commitment),
            round_no=round_no,
            actual_paid_date=item.actual_paid_date,
            memo=item.memo,
            source=item.source or "manual",
        )
        db.add(row)
        created.append(row)

    _sync_lp_paid_in(db, lp_id)
    db.commit()
    for row in created:
        db.refresh(row)
    return [LPContributionResponse.model_validate(row) for row in created]


@router.put(
    "/api/lp-contributions/{contribution_id}",
    response_model=LPContributionResponse,
)
def update_lp_contribution(
    contribution_id: int,
    data: LPContributionUpdate,
    db: Session = Depends(get_db),
):
    """납입 이력 수정."""
    contribution = db.get(LPContribution, contribution_id)
    if not contribution:
        raise HTTPException(status_code=404, detail="납입 이력을 찾을 수 없습니다.")
    if contribution.source == "capital_call":
        raise HTTPException(status_code=409, detail="캐피탈콜 연동 이력은 수정할 수 없습니다.")

    payload = data.model_dump(exclude_unset=True)
    for key, value in payload.items():
        setattr(contribution, key, value)

    if data.amount is not None:
        lp = db.get(LP, contribution.lp_id)
        contribution.commitment_ratio = _calculate_commitment_ratio(
            amount=data.amount,
            commitment=(lp.commitment if lp else None),
        )

    _sync_lp_paid_in(db, contribution.lp_id)
    db.commit()
    db.refresh(contribution)
    return LPContributionResponse.model_validate(contribution)


@router.delete("/api/lp-contributions/{contribution_id}", status_code=204)
def delete_lp_contribution(
    contribution_id: int,
    db: Session = Depends(get_db),
):
    """납입 이력 삭제."""
    contribution = db.get(LPContribution, contribution_id)
    if not contribution:
        raise HTTPException(status_code=404, detail="납입 이력을 찾을 수 없습니다.")
    if contribution.source == "capital_call":
        raise HTTPException(status_code=409, detail="캐피탈콜 연동 이력은 삭제할 수 없습니다.")

    lp_id = contribution.lp_id
    db.delete(contribution)
    _sync_lp_paid_in(db, lp_id, force_when_empty=True)
    db.commit()


@router.get("/api/funds/{fund_id}/contribution-overview")
def get_fund_contribution_overview(
    fund_id: int,
    db: Session = Depends(get_db),
):
    """조합 전체 LP 납입 현황 요약."""
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다.")

    lps = db.query(LP).filter(LP.fund_id == fund_id).order_by(LP.id.asc()).all()
    summaries = [get_lp_contribution_summary(fund_id, lp.id, db) for lp in lps]
    return {
        "fund_id": fund_id,
        "contribution_type": fund.contribution_type,
        "lp_summaries": summaries,
        "generated_at": date.today().isoformat(),
    }
