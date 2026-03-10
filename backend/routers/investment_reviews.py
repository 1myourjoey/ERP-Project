from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.investment import Investment, PortfolioCompany
from models.investment_review import InvestmentReview, ReviewComment
from services.erp_backbone import backbone_enabled, mark_subject_deleted, maybe_emit_mutation, record_snapshot, sync_company_graph, sync_investment_graph, sync_investment_review_graph
from schemas.investment_review import (
    InvestmentReviewConvertRequest,
    InvestmentReviewConvertResponse,
    InvestmentReviewCreate,
    InvestmentReviewDetail,
    InvestmentReviewListItem,
    InvestmentReviewResponse,
    InvestmentReviewStatusUpdate,
    InvestmentReviewUpdate,
    InvestmentReviewWeeklySummary,
    ReviewCommentCreate,
    ReviewCommentResponse,
    WeeklyActivityItem,
)

router = APIRouter(tags=["investment-reviews"])

PIPELINE_STATUSES = ["소싱", "검토중", "실사중", "상정", "의결", "집행", "완료"]
STOP_STATUS = "중단"


def _normalize_status(value: str | None) -> str:
    return (value or "").strip()


def _can_transition(current: str, nxt: str) -> bool:
    if current == nxt:
        return True
    if nxt == STOP_STATUS:
        return True
    if current == STOP_STATUS:
        return False
    if current not in PIPELINE_STATUSES or nxt not in PIPELINE_STATUSES:
        return False
    return PIPELINE_STATUSES.index(nxt) >= PIPELINE_STATUSES.index(current)


def _serialize_review(row: InvestmentReview, db: Session) -> InvestmentReviewListItem:
    comment_count = (
        db.query(func.count(ReviewComment.id))
        .filter(ReviewComment.review_id == row.id)
        .scalar()
        or 0
    )
    latest_comment_at = (
        db.query(func.max(ReviewComment.created_at))
        .filter(ReviewComment.review_id == row.id)
        .scalar()
    )
    recent_activity_at = latest_comment_at or row.updated_at
    return InvestmentReviewListItem(
        id=row.id,
        company_name=row.company_name,
        sector=row.sector,
        stage=row.stage,
        deal_source=row.deal_source,
        reviewer=row.reviewer,
        status=row.status,
        target_amount=float(row.target_amount) if row.target_amount is not None else None,
        pre_valuation=float(row.pre_valuation) if row.pre_valuation is not None else None,
        post_valuation=float(row.post_valuation) if row.post_valuation is not None else None,
        instrument=row.instrument,
        fund_id=row.fund_id,
        review_start_date=row.review_start_date,
        dd_start_date=row.dd_start_date,
        committee_date=row.committee_date,
        decision_date=row.decision_date,
        execution_date=row.execution_date,
        review_opinion=row.review_opinion,
        committee_opinion=row.committee_opinion,
        decision_result=row.decision_result,
        rejection_reason=row.rejection_reason,
        investment_id=row.investment_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        comment_count=int(comment_count),
        recent_activity_at=recent_activity_at,
    )


@router.get("/api/investment-reviews/weekly-summary", response_model=InvestmentReviewWeeklySummary)
def get_weekly_summary(db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=7)
    status_counts_rows = (
        db.query(InvestmentReview.status, func.count(InvestmentReview.id))
        .group_by(InvestmentReview.status)
        .all()
    )
    status_counts = {status: int(count) for status, count in status_counts_rows}

    new_count = (
        db.query(func.count(InvestmentReview.id))
        .filter(InvestmentReview.created_at >= since)
        .scalar()
        or 0
    )
    status_changed_count = (
        db.query(func.count(InvestmentReview.id))
        .filter(InvestmentReview.updated_at >= since, InvestmentReview.created_at < since)
        .scalar()
        or 0
    )
    comments_added_count = (
        db.query(func.count(ReviewComment.id))
        .filter(ReviewComment.created_at >= since)
        .scalar()
        or 0
    )

    recent_reviews = (
        db.query(InvestmentReview)
        .order_by(InvestmentReview.updated_at.desc(), InvestmentReview.id.desc())
        .limit(10)
        .all()
    )
    activities: list[WeeklyActivityItem] = []
    for row in recent_reviews:
        comment_count = (
            db.query(func.count(ReviewComment.id))
            .filter(ReviewComment.review_id == row.id, ReviewComment.created_at >= since)
            .scalar()
            or 0
        )
        activities.append(
            WeeklyActivityItem(
                review_id=row.id,
                company_name=row.company_name,
                status=row.status,
                updated_at=row.updated_at,
                comment_count=int(comment_count),
            )
        )

    return InvestmentReviewWeeklySummary(
        status_counts=status_counts,
        new_count=int(new_count),
        status_changed_count=int(status_changed_count),
        comments_added_count=int(comments_added_count),
        recent_activities=activities,
    )


@router.get("/api/investment-reviews", response_model=list[InvestmentReviewListItem])
def list_investment_reviews(
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(InvestmentReview)
    normalized_status = _normalize_status(status)
    if normalized_status:
        query = query.filter(InvestmentReview.status == normalized_status)
    rows = query.order_by(InvestmentReview.updated_at.desc(), InvestmentReview.id.desc()).all()
    return [_serialize_review(row, db) for row in rows]


@router.get("/api/investment-reviews/{review_id}", response_model=InvestmentReviewDetail)
def get_investment_review(review_id: int, db: Session = Depends(get_db)):
    row = db.get(InvestmentReview, review_id)
    if not row:
        raise HTTPException(status_code=404, detail="Investment review not found")
    comments = (
        db.query(ReviewComment)
        .filter(ReviewComment.review_id == review_id)
        .order_by(ReviewComment.created_at.asc(), ReviewComment.id.asc())
        .all()
    )
    payload = _serialize_review(row, db).model_dump()
    payload["comments"] = [ReviewCommentResponse.model_validate(comment) for comment in comments]
    return InvestmentReviewDetail(**payload)


@router.post("/api/investment-reviews", response_model=InvestmentReviewResponse, status_code=201)
def create_investment_review(data: InvestmentReviewCreate, db: Session = Depends(get_db)):
    if data.fund_id is not None and not db.get(Fund, data.fund_id):
        raise HTTPException(status_code=404, detail="Fund not found")
    row = InvestmentReview(**data.model_dump())
    db.add(row)
    try:
        db.flush()
        if backbone_enabled():
            subject = sync_investment_review_graph(db, row)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="investment_review.created",
                after=record_snapshot(row),
                origin_model="investment_review",
                origin_id=row.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.put("/api/investment-reviews/{review_id}", response_model=InvestmentReviewResponse)
def update_investment_review(
    review_id: int,
    data: InvestmentReviewUpdate,
    db: Session = Depends(get_db),
):
    row = db.get(InvestmentReview, review_id)
    if not row:
        raise HTTPException(status_code=404, detail="Investment review not found")

    before = record_snapshot(row)
    payload = data.model_dump(exclude_unset=True)
    next_fund_id = payload.get("fund_id", row.fund_id)
    if next_fund_id is not None and not db.get(Fund, next_fund_id):
        raise HTTPException(status_code=404, detail="Fund not found")

    for key, value in payload.items():
        setattr(row, key, value)
    try:
        if backbone_enabled():
            subject = sync_investment_review_graph(db, row)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="investment_review.updated",
                before=before,
                after=record_snapshot(row),
                origin_model="investment_review",
                origin_id=row.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.delete("/api/investment-reviews/{review_id}", status_code=204)
def delete_investment_review(review_id: int, db: Session = Depends(get_db)):
    row = db.get(InvestmentReview, review_id)
    if not row:
        raise HTTPException(status_code=404, detail="Investment review not found")
    before = record_snapshot(row)
    if backbone_enabled():
        subject = mark_subject_deleted(db, subject_type="investment_review", native_id=row.id, payload=before)
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="investment_review.deleted",
            before=before,
            origin_model="investment_review",
            origin_id=row.id,
        )
    db.delete(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


@router.patch("/api/investment-reviews/{review_id}/status", response_model=InvestmentReviewResponse)
def update_investment_review_status(
    review_id: int,
    data: InvestmentReviewStatusUpdate,
    db: Session = Depends(get_db),
):
    row = db.get(InvestmentReview, review_id)
    if not row:
        raise HTTPException(status_code=404, detail="Investment review not found")
    next_status = _normalize_status(data.status)
    if not next_status:
        raise HTTPException(status_code=400, detail="Status is required")
    if not _can_transition(_normalize_status(row.status), next_status):
        raise HTTPException(
            status_code=409,
            detail=f"Invalid status transition: {row.status} -> {next_status}",
        )
    before = record_snapshot(row)
    row.status = next_status
    try:
        if backbone_enabled():
            subject = sync_investment_review_graph(db, row)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="investment_review.status_updated",
                before=before,
                after=record_snapshot(row),
                origin_model="investment_review",
                origin_id=row.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.post(
    "/api/investment-reviews/{review_id}/convert",
    response_model=InvestmentReviewConvertResponse,
)
def convert_investment_review(
    review_id: int,
    data: InvestmentReviewConvertRequest,
    db: Session = Depends(get_db),
):
    row = db.get(InvestmentReview, review_id)
    if not row:
        raise HTTPException(status_code=404, detail="Investment review not found")
    if (row.decision_result or "").strip() != "승인":
        raise HTTPException(status_code=409, detail="Only approved reviews can be converted")
    fund_id = data.fund_id or row.fund_id
    if fund_id is None:
        raise HTTPException(status_code=400, detail="Fund is required for conversion")
    if not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="Fund not found")

    if row.investment_id is not None:
        existing = db.get(Investment, row.investment_id)
        if existing:
            return InvestmentReviewConvertResponse(
                review_id=row.id,
                investment_id=existing.id,
                company_id=existing.company_id,
                status=row.status,
            )

    company_name = (row.company_name or "").strip()
    company = (
        db.query(PortfolioCompany)
        .filter(func.lower(PortfolioCompany.name) == company_name.lower())
        .first()
    )
    created_company = False
    if company is None:
        company = PortfolioCompany(name=company_name, industry=row.sector)
        db.add(company)
        db.flush()
        created_company = True

    investment_date = data.investment_date or row.execution_date or row.decision_date
    if investment_date is None:
        raise HTTPException(status_code=400, detail="Investment date is required for conversion")

    before_review = record_snapshot(row)
    investment = Investment(
        fund_id=fund_id,
        company_id=company.id,
        investment_date=investment_date,
        amount=data.amount if data.amount is not None else float(row.target_amount) if row.target_amount is not None else None,
        instrument=(data.instrument or row.instrument or None),
        status=data.status or "active",
        shares=data.shares,
        share_price=data.share_price,
        valuation=data.valuation,
        contribution_rate=data.contribution_rate,
        round=data.round,
        valuation_pre=data.valuation_pre,
        valuation_post=data.valuation_post,
        ownership_pct=data.ownership_pct,
        board_seat=data.board_seat,
    )
    db.add(investment)
    db.flush()

    row.fund_id = fund_id
    row.execution_date = row.execution_date or investment_date
    row.investment_id = investment.id
    if row.status not in (STOP_STATUS, "완료"):
        row.status = "집행" if row.execution_date else "의결"
    try:
        if backbone_enabled():
            if created_company:
                company_subject = sync_company_graph(db, company)
                maybe_emit_mutation(
                    db,
                    subject=company_subject,
                    event_type="company.created",
                    after=record_snapshot(company),
                    origin_model="portfolio_company",
                    origin_id=company.id,
                )
            investment_subject = sync_investment_graph(db, investment)
            maybe_emit_mutation(
                db,
                subject=investment_subject,
                event_type="investment.created",
                after=record_snapshot(investment),
                origin_model="investment",
                origin_id=investment.id,
            )
            review_subject = sync_investment_review_graph(db, row)
            maybe_emit_mutation(
                db,
                subject=review_subject,
                event_type="investment_review.converted",
                before=before_review,
                after=record_snapshot(row),
                payload={"investment_id": investment.id, "company_id": company.id},
                origin_model="investment_review",
                origin_id=row.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return InvestmentReviewConvertResponse(
        review_id=row.id,
        investment_id=investment.id,
        company_id=company.id,
        status=row.status,
    )


@router.get("/api/investment-reviews/{review_id}/comments", response_model=list[ReviewCommentResponse])
def list_review_comments(review_id: int, db: Session = Depends(get_db)):
    review = db.get(InvestmentReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Investment review not found")
    return (
        db.query(ReviewComment)
        .filter(ReviewComment.review_id == review_id)
        .order_by(ReviewComment.created_at.asc(), ReviewComment.id.asc())
        .all()
    )


@router.post(
    "/api/investment-reviews/{review_id}/comments",
    response_model=ReviewCommentResponse,
    status_code=201,
)
def create_review_comment(
    review_id: int,
    data: ReviewCommentCreate,
    db: Session = Depends(get_db),
):
    review = db.get(InvestmentReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Investment review not found")
    if not data.author.strip() or not data.content.strip():
        raise HTTPException(status_code=400, detail="Author/content are required")
    row = ReviewComment(
        review_id=review_id,
        author=data.author.strip(),
        content=data.content.strip(),
        comment_type=(data.comment_type or "opinion").strip() or "opinion",
    )
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.delete("/api/review-comments/{comment_id}", status_code=204)
def delete_review_comment(comment_id: int, db: Session = Depends(get_db)):
    row = db.get(ReviewComment, comment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Review comment not found")
    db.delete(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
