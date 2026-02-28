from __future__ import annotations

import json
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.biz_report import BizReport, BizReportRequest
from models.compliance import ComplianceObligation, ComplianceRule
from models.fund import Fund
from models.internal_review import CompanyReview, InternalReview
from models.investment import Investment, PortfolioCompany
from services.generated_document_service import generate_and_store_document
from services.impairment_evaluator import evaluate_impairment

router = APIRouter(tags=["internal-reviews"])


class InternalReviewCreateBody(BaseModel):
    fund_id: int
    year: int = Field(..., ge=2000, le=2100)
    quarter: int = Field(..., ge=1, le=4)


class InternalReviewPatchBody(BaseModel):
    review_date: date | None = None
    status: str | None = None
    attendees: list[dict[str, Any]] | None = None
    compliance_opinion: str | None = None
    compliance_officer: str | None = None
    minutes_document_id: int | None = None


class CompanyReviewPatchBody(BaseModel):
    quarterly_revenue: float | None = None
    quarterly_operating_income: float | None = None
    quarterly_net_income: float | None = None
    total_assets: float | None = None
    total_liabilities: float | None = None
    total_equity: float | None = None
    cash_and_equivalents: float | None = None
    paid_in_capital: float | None = None
    employee_count: int | None = None
    employee_change: int | None = None
    asset_rating: str | None = None
    rating_reason: str | None = None
    impairment_type: str | None = None
    impairment_amount: float | None = None
    key_issues: str | None = None
    follow_up_actions: str | None = None
    board_attendance: str | None = None
    investment_opinion: str | None = None


class InternalReviewCompleteBody(BaseModel):
    completed_by: str | None = None
    evidence_note: str | None = None


def _quarter_end(year: int, quarter: int) -> date:
    if quarter == 1:
        return date(year, 3, 31)
    if quarter == 2:
        return date(year, 6, 30)
    if quarter == 3:
        return date(year, 9, 30)
    return date(year, 12, 31)


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _load_latest_request(db: Session, investment_id: int) -> BizReportRequest | None:
    return (
        db.query(BizReportRequest)
        .join(BizReport, BizReport.id == BizReportRequest.biz_report_id)
        .filter(BizReportRequest.investment_id == investment_id)
        .order_by(BizReport.report_year.desc(), BizReportRequest.updated_at.desc(), BizReportRequest.id.desc())
        .first()
    )


def _load_previous_request(db: Session, investment_id: int, current_id: int | None) -> BizReportRequest | None:
    query = (
        db.query(BizReportRequest)
        .join(BizReport, BizReport.id == BizReportRequest.biz_report_id)
        .filter(BizReportRequest.investment_id == investment_id)
    )
    if current_id is not None:
        query = query.filter(BizReportRequest.id != current_id)
    return query.order_by(BizReport.report_year.desc(), BizReportRequest.updated_at.desc(), BizReportRequest.id.desc()).first()


def _load_financial_snapshot(db: Session, investment: Investment) -> dict[str, Any]:
    latest = _load_latest_request(db, investment.id)
    previous = _load_previous_request(db, investment.id, latest.id if latest else None)

    current_employees = latest.employees if latest else None
    previous_employees = previous.employees if previous else None
    employee_change = None
    if current_employees is not None and previous_employees is not None:
        employee_change = int(current_employees) - int(previous_employees)

    return {
        "quarterly_revenue": _to_float(latest.revenue) if latest else None,
        "quarterly_operating_income": _to_float(latest.operating_income) if latest else None,
        "quarterly_net_income": _to_float(latest.net_income) if latest else None,
        "total_assets": _to_float(latest.total_assets) if latest else None,
        "total_equity": _to_float(latest.total_equity) if latest else None,
        "cash_and_equivalents": _to_float(latest.cash) if latest else None,
        "paid_in_capital": _to_float(investment.amount),
        "employee_count": int(current_employees) if current_employees is not None else None,
        "employee_change": employee_change,
    }


def _default_investment_opinion(impairment_type: str | None) -> str:
    if impairment_type == "full":
        return "손상처리"
    if impairment_type == "partial":
        return "회수검토"
    return "유지"


def _serialize_company_review(db: Session, row: CompanyReview) -> dict[str, Any]:
    investment = db.get(Investment, row.investment_id)
    company = db.get(PortfolioCompany, investment.company_id) if investment else None
    flags: list[str] = []
    if row.impairment_flags_json:
        try:
            loaded = json.loads(row.impairment_flags_json)
            if isinstance(loaded, list):
                flags = [str(item) for item in loaded]
        except json.JSONDecodeError:
            pass

    return {
        "id": row.id,
        "review_id": row.review_id,
        "investment_id": row.investment_id,
        "company_id": investment.company_id if investment else None,
        "company_name": company.name if company else f"Company #{investment.company_id}" if investment else f"Investment #{row.investment_id}",
        "quarterly_revenue": row.quarterly_revenue,
        "quarterly_operating_income": row.quarterly_operating_income,
        "quarterly_net_income": row.quarterly_net_income,
        "total_assets": row.total_assets,
        "total_liabilities": row.total_liabilities,
        "total_equity": row.total_equity,
        "cash_and_equivalents": row.cash_and_equivalents,
        "paid_in_capital": row.paid_in_capital,
        "employee_count": row.employee_count,
        "employee_change": row.employee_change,
        "asset_rating": row.asset_rating,
        "rating_reason": row.rating_reason,
        "impairment_type": row.impairment_type,
        "impairment_amount": row.impairment_amount,
        "impairment_flags": flags,
        "key_issues": row.key_issues,
        "follow_up_actions": row.follow_up_actions,
        "board_attendance": row.board_attendance,
        "investment_opinion": row.investment_opinion,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _serialize_internal_review(db: Session, row: InternalReview, include_companies: bool = False) -> dict[str, Any]:
    fund = db.get(Fund, row.fund_id)
    payload = {
        "id": row.id,
        "fund_id": row.fund_id,
        "fund_name": fund.name if fund else f"Fund #{row.fund_id}",
        "year": row.year,
        "quarter": row.quarter,
        "reference_date": row.reference_date.isoformat() if row.reference_date else None,
        "review_date": row.review_date.isoformat() if row.review_date else None,
        "status": row.status,
        "attendees": json.loads(row.attendees_json) if row.attendees_json else [],
        "compliance_opinion": row.compliance_opinion,
        "compliance_officer": row.compliance_officer,
        "minutes_document_id": row.minutes_document_id,
        "obligation_id": row.obligation_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
    if include_companies:
        payload["company_reviews"] = [_serialize_company_review(db, cr) for cr in row.company_reviews]
    return payload


@router.get("/api/internal-reviews")
def list_internal_reviews(
    fund_id: int | None = None,
    year: int | None = None,
    quarter: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(InternalReview)
    if fund_id is not None:
        query = query.filter(InternalReview.fund_id == fund_id)
    if year is not None:
        query = query.filter(InternalReview.year == year)
    if quarter is not None:
        query = query.filter(InternalReview.quarter == quarter)
    rows = query.order_by(InternalReview.year.desc(), InternalReview.quarter.desc(), InternalReview.id.desc()).all()
    return [_serialize_internal_review(db, row, include_companies=False) for row in rows]


@router.post("/api/internal-reviews", status_code=201)
def create_internal_review(body: InternalReviewCreateBody, db: Session = Depends(get_db)):
    fund = db.get(Fund, body.fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다.")

    existing = (
        db.query(InternalReview)
        .filter(
            InternalReview.fund_id == body.fund_id,
            InternalReview.year == body.year,
            InternalReview.quarter == body.quarter,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="해당 조합/연도/분기의 내부보고회가 이미 존재합니다.")

    period_key = f"{body.year}-Q{body.quarter}"
    rule = db.query(ComplianceRule).filter(ComplianceRule.rule_code == "RPT-Q-01").first()
    obligation = None
    if rule is not None:
        obligation = (
            db.query(ComplianceObligation)
            .filter(
                ComplianceObligation.rule_id == rule.id,
                ComplianceObligation.fund_id == body.fund_id,
                ComplianceObligation.period_type == period_key,
            )
            .order_by(ComplianceObligation.id.desc())
            .first()
        )

    review = InternalReview(
        fund_id=body.fund_id,
        year=body.year,
        quarter=body.quarter,
        reference_date=_quarter_end(body.year, body.quarter),
        status="data_collecting",
        obligation_id=obligation.id if obligation else None,
    )
    db.add(review)
    db.flush()

    investments = (
        db.query(Investment)
        .filter(
            Investment.fund_id == body.fund_id,
            func.lower(func.coalesce(Investment.status, "active")) != "exited",
        )
        .order_by(Investment.id.asc())
        .all()
    )

    for investment in investments:
        snapshot = _load_financial_snapshot(db, investment)
        eval_result = evaluate_impairment(investment.id, db, financial_snapshot=snapshot)
        company_review = CompanyReview(
            review_id=review.id,
            investment_id=investment.id,
            quarterly_revenue=snapshot.get("quarterly_revenue"),
            quarterly_operating_income=snapshot.get("quarterly_operating_income"),
            quarterly_net_income=snapshot.get("quarterly_net_income"),
            total_assets=snapshot.get("total_assets"),
            total_liabilities=None,
            total_equity=snapshot.get("total_equity"),
            cash_and_equivalents=snapshot.get("cash_and_equivalents"),
            paid_in_capital=snapshot.get("paid_in_capital"),
            employee_count=snapshot.get("employee_count"),
            employee_change=snapshot.get("employee_change"),
            asset_rating=eval_result["rating"],
            rating_reason=", ".join(eval_result["flags"]) if eval_result["flags"] else "자동평가",
            impairment_type=eval_result["impairment_type"],
            impairment_amount=eval_result.get("impairment_amount"),
            impairment_flags_json=json.dumps(eval_result["flags"], ensure_ascii=False),
            investment_opinion=_default_investment_opinion(eval_result["impairment_type"]),
        )
        db.add(company_review)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(review)
    return _serialize_internal_review(db, review, include_companies=True)


@router.get("/api/internal-reviews/{review_id}")
def get_internal_review(review_id: int, db: Session = Depends(get_db)):
    row = db.get(InternalReview, review_id)
    if not row:
        raise HTTPException(status_code=404, detail="내부보고회를 찾을 수 없습니다.")
    return _serialize_internal_review(db, row, include_companies=True)


@router.patch("/api/internal-reviews/{review_id}")
def patch_internal_review(review_id: int, body: InternalReviewPatchBody, db: Session = Depends(get_db)):
    row = db.get(InternalReview, review_id)
    if not row:
        raise HTTPException(status_code=404, detail="내부보고회를 찾을 수 없습니다.")

    if body.review_date is not None:
        row.review_date = body.review_date
    if body.status is not None:
        row.status = body.status
    if body.attendees is not None:
        row.attendees_json = json.dumps(body.attendees, ensure_ascii=False)
    if body.compliance_opinion is not None:
        row.compliance_opinion = body.compliance_opinion
    if body.compliance_officer is not None:
        row.compliance_officer = body.compliance_officer
    if body.minutes_document_id is not None:
        row.minutes_document_id = body.minutes_document_id

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize_internal_review(db, row, include_companies=True)


@router.delete("/api/internal-reviews/{review_id}")
def delete_internal_review(review_id: int, db: Session = Depends(get_db)):
    row = db.get(InternalReview, review_id)
    if not row:
        raise HTTPException(status_code=404, detail="내부보고회를 찾을 수 없습니다.")
    db.delete(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"ok": True}


@router.get("/api/internal-reviews/{review_id}/company-reviews")
def list_company_reviews(review_id: int, db: Session = Depends(get_db)):
    review = db.get(InternalReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="내부보고회를 찾을 수 없습니다.")
    rows = (
        db.query(CompanyReview)
        .filter(CompanyReview.review_id == review_id)
        .order_by(CompanyReview.id.asc())
        .all()
    )
    return [_serialize_company_review(db, row) for row in rows]


@router.patch("/api/internal-reviews/{review_id}/company-reviews/{company_review_id}")
def patch_company_review(
    review_id: int,
    company_review_id: int,
    body: CompanyReviewPatchBody,
    db: Session = Depends(get_db),
):
    row = db.get(CompanyReview, company_review_id)
    if not row or row.review_id != review_id:
        raise HTTPException(status_code=404, detail="회사별 보고 항목을 찾을 수 없습니다.")

    payload = body.model_dump(exclude_unset=True)
    for key, value in payload.items():
        setattr(row, key, value)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize_company_review(db, row)


@router.post("/api/internal-reviews/{review_id}/auto-evaluate")
def auto_evaluate_internal_review(review_id: int, db: Session = Depends(get_db)):
    review = db.get(InternalReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="내부보고회를 찾을 수 없습니다.")

    rows = (
        db.query(CompanyReview)
        .filter(CompanyReview.review_id == review_id)
        .order_by(CompanyReview.id.asc())
        .all()
    )
    results: list[dict[str, Any]] = []
    for row in rows:
        snapshot = {
            "quarterly_revenue": row.quarterly_revenue,
            "quarterly_operating_income": row.quarterly_operating_income,
            "quarterly_net_income": row.quarterly_net_income,
            "total_assets": row.total_assets,
            "total_equity": row.total_equity,
            "cash_and_equivalents": row.cash_and_equivalents,
            "paid_in_capital": row.paid_in_capital,
            "employee_count": row.employee_count,
            "employee_change": row.employee_change,
        }
        evaluated = evaluate_impairment(row.investment_id, db, financial_snapshot=snapshot)
        row.asset_rating = evaluated["rating"]
        row.impairment_type = evaluated["impairment_type"]
        row.impairment_amount = evaluated.get("impairment_amount")
        row.impairment_flags_json = json.dumps(evaluated["flags"], ensure_ascii=False)
        row.rating_reason = ", ".join(evaluated["flags"]) if evaluated["flags"] else "자동평가"
        if not row.investment_opinion:
            row.investment_opinion = _default_investment_opinion(evaluated["impairment_type"])

        serialized = _serialize_company_review(db, row)
        results.append(
            {
                "company_review_id": row.id,
                "company_name": serialized["company_name"],
                "rating": row.asset_rating,
                "impairment_type": row.impairment_type,
                "flags": serialized["impairment_flags"],
            }
        )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {"evaluated": len(rows), "results": results}


@router.post("/api/internal-reviews/{review_id}/complete")
def complete_internal_review(
    review_id: int,
    body: InternalReviewCompleteBody,
    db: Session = Depends(get_db),
):
    review = db.get(InternalReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="내부보고회를 찾을 수 없습니다.")

    review.status = "completed"
    if review.review_date is None:
        review.review_date = date.today()

    if review.obligation_id:
        obligation = db.get(ComplianceObligation, review.obligation_id)
        if obligation and obligation.status != "completed":
            obligation.status = "completed"
            obligation.completed_date = date.today()
            if body.completed_by is not None:
                obligation.completed_by = body.completed_by
            if body.evidence_note is not None:
                obligation.evidence_note = body.evidence_note

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(review)
    return _serialize_internal_review(db, review, include_companies=True)


@router.post("/api/internal-reviews/{review_id}/generate-report")
def generate_internal_review_integrated_report(review_id: int, db: Session = Depends(get_db)):
    review = db.get(InternalReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="내부보고회를 찾을 수 없습니다.")

    try:
        result = generate_and_store_document(
            "internal_review_report",
            {"internal_review_id": review_id},
            db,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    review.minutes_document_id = result["document_id"]
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return result


@router.post("/api/internal-reviews/{review_id}/company-reviews/{company_review_id}/generate-report")
def generate_company_follow_up_report(
    review_id: int,
    company_review_id: int,
    db: Session = Depends(get_db),
):
    review = db.get(InternalReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="내부보고회를 찾을 수 없습니다.")

    row = db.get(CompanyReview, company_review_id)
    if not row or row.review_id != review_id:
        raise HTTPException(status_code=404, detail="회사별 보고 항목을 찾을 수 없습니다.")

    try:
        return generate_and_store_document(
            "follow_up_report",
            {"company_review_id": company_review_id},
            db,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
