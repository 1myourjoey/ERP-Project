from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models.compliance import ComplianceObligation, ComplianceRule
from models.fund import Fund
from models.task import Task
from services.compliance_engine import ComplianceEngine

router = APIRouter(tags=["compliance"])


class ObligationCompleteBody(BaseModel):
    completed_by: str = Field(..., min_length=1)
    evidence_note: str | None = None


class ObligationWaiveBody(BaseModel):
    reason: str | None = None


class GeneratePeriodicBody(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)


class InvestmentLimitCheckBody(BaseModel):
    fund_id: int
    company_name: str = Field(..., min_length=1)
    amount: float = Field(..., ge=0)
    is_overseas: bool = False
    is_affiliate: bool = False


def _serialize_rule(rule: ComplianceRule) -> dict:
    return {
        "id": rule.id,
        "category": rule.category,
        "subcategory": rule.subcategory,
        "rule_code": rule.rule_code,
        "title": rule.title,
        "description": rule.description,
        "trigger_event": rule.trigger_event,
        "frequency": rule.frequency,
        "deadline_rule": rule.deadline_rule,
        "target_system": rule.target_system,
        "guideline_ref": rule.guideline_ref,
        "is_active": bool(rule.is_active),
        "fund_type_filter": rule.fund_type_filter,
    }


def _serialize_obligation(db: Session, row: ComplianceObligation) -> dict:
    rule = db.get(ComplianceRule, row.rule_id)
    fund = db.get(Fund, row.fund_id)
    d_day = (row.due_date - date.today()).days if row.due_date else None
    return {
        "id": row.id,
        "rule_id": row.rule_id,
        "rule_code": rule.rule_code if rule else None,
        "rule_title": rule.title if rule else None,
        "category": rule.category if rule else None,
        "subcategory": rule.subcategory if rule else None,
        "fund_id": row.fund_id,
        "fund_name": fund.name if fund else None,
        "period_type": row.period_type,
        "due_date": row.due_date.isoformat() if row.due_date else None,
        "d_day": d_day,
        "status": row.status,
        "completed_date": row.completed_date.isoformat() if row.completed_date else None,
        "completed_by": row.completed_by,
        "evidence_note": row.evidence_note,
        "investment_id": row.investment_id,
        "task_id": row.task_id,
        "target_system": rule.target_system if rule else None,
        "guideline_ref": rule.guideline_ref if rule else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/api/compliance/rules")
def list_compliance_rules(
    category: str | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(ComplianceRule)
    if category:
        query = query.filter(ComplianceRule.category == category)
    if active_only:
        query = query.filter(ComplianceRule.is_active == True)
    rules = query.order_by(ComplianceRule.rule_code.asc()).all()
    return [_serialize_rule(rule) for rule in rules]


@router.get("/api/compliance/rules/{rule_code}")
def get_compliance_rule(rule_code: str, db: Session = Depends(get_db)):
    row = (
        db.query(ComplianceRule)
        .filter(ComplianceRule.rule_code == rule_code)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="규제 룰을 찾을 수 없습니다.")
    return _serialize_rule(row)


@router.get("/api/compliance/obligations")
def list_compliance_obligations(
    fund_id: int | None = None,
    status: str | None = None,
    period: str | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(ComplianceObligation)
    if fund_id is not None:
        query = query.filter(ComplianceObligation.fund_id == fund_id)
    if status:
        query = query.filter(ComplianceObligation.status == status)
    if period:
        query = query.filter(ComplianceObligation.period_type == period)

    rows = query.order_by(ComplianceObligation.due_date.asc(), ComplianceObligation.id.desc()).all()
    if category:
        category = category.strip().lower()
        rows = [
            row
            for row in rows
            if (
                (db.get(ComplianceRule, row.rule_id).category if db.get(ComplianceRule, row.rule_id) else "")
                .strip()
                .lower()
                == category
            )
        ]
    return [_serialize_obligation(db, row) for row in rows]


@router.post("/api/compliance/obligations/{obligation_id}/complete")
def complete_compliance_obligation(
    obligation_id: int,
    body: ObligationCompleteBody,
    db: Session = Depends(get_db),
):
    row = db.get(ComplianceObligation, obligation_id)
    if not row:
        raise HTTPException(status_code=404, detail="컴플라이언스 의무를 찾을 수 없습니다.")

    row.status = "completed"
    row.completed_date = date.today()
    row.completed_by = body.completed_by.strip()
    row.evidence_note = body.evidence_note.strip() if body.evidence_note else None

    if row.task_id:
        task = db.get(Task, row.task_id)
        if task and task.status != "completed":
            task.status = "completed"
            task.completed_at = datetime.utcnow()
            task.actual_time = task.actual_time or "0m"

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(row)
    return _serialize_obligation(db, row)


@router.post("/api/compliance/obligations/{obligation_id}/waive")
def waive_compliance_obligation(
    obligation_id: int,
    body: ObligationWaiveBody,
    db: Session = Depends(get_db),
):
    row = db.get(ComplianceObligation, obligation_id)
    if not row:
        raise HTTPException(status_code=404, detail="컴플라이언스 의무를 찾을 수 없습니다.")

    row.status = "waived"
    reason = (body.reason or "").strip()
    row.evidence_note = f"[면제 사유] {reason}" if reason else "[면제 사유] 미기재"

    if row.task_id:
        task = db.get(Task, row.task_id)
        if task and task.status != "completed":
            task.status = "completed"
            task.completed_at = datetime.utcnow()
            task.actual_time = task.actual_time or "0m"

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize_obligation(db, row)


@router.get("/api/compliance/dashboard")
def get_compliance_dashboard(db: Session = Depends(get_db)):
    today = date.today()
    week_end = today + timedelta(days=7)
    if today.month == 12:
        month_end = date(today.year, 12, 31)
    else:
        month_end = date(today.year, today.month + 1, 1) - timedelta(days=1)

    obligations = db.query(ComplianceObligation).all()
    overdue_count = sum(1 for row in obligations if row.status == "overdue" or (row.status in ("pending", "in_progress") and row.due_date < today))
    due_this_week = sum(1 for row in obligations if row.status in ("pending", "in_progress", "overdue") and today <= row.due_date <= week_end)
    due_this_month = sum(1 for row in obligations if row.status in ("pending", "in_progress", "overdue") and today <= row.due_date <= month_end)
    completed_count = sum(1 for row in obligations if row.status == "completed")

    by_fund: list[dict] = []
    funds = db.query(Fund).order_by(Fund.id.asc()).all()
    for fund in funds:
        fund_rows = [row for row in obligations if row.fund_id == fund.id]
        by_fund.append(
            {
                "fund_id": fund.id,
                "fund_name": fund.name,
                "overdue": sum(1 for row in fund_rows if row.status == "overdue"),
                "pending": sum(1 for row in fund_rows if row.status in ("pending", "in_progress")),
                "completed": sum(1 for row in fund_rows if row.status == "completed"),
            }
        )

    return {
        "overdue_count": overdue_count,
        "due_this_week": due_this_week,
        "due_this_month": due_this_month,
        "completed_count": completed_count,
        "by_fund": by_fund,
    }


@router.post("/api/compliance/generate-periodic")
def generate_periodic_obligations(body: GeneratePeriodicBody, db: Session = Depends(get_db)):
    engine = ComplianceEngine(db)
    result = engine.generate_periodic_obligations(year=body.year, month=body.month)
    return {"year": body.year, "month": body.month, **result}


@router.post("/api/compliance/check-investment-limits")
def check_investment_limits(body: InvestmentLimitCheckBody, db: Session = Depends(get_db)):
    engine = ComplianceEngine(db)
    try:
        checks = engine.check_investment_limits(
            fund_id=body.fund_id,
            amount=body.amount,
            company_name=body.company_name,
            is_overseas=body.is_overseas,
            is_affiliate=body.is_affiliate,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    overall = "pass"
    if any(item["result"] == "block" for item in checks):
        overall = "block"
    elif any(item["result"] == "warning" for item in checks):
        overall = "warning"
    return {"checks": checks, "overall": overall}


@router.post("/api/compliance/update-overdue")
def update_overdue_obligations(db: Session = Depends(get_db)):
    engine = ComplianceEngine(db)
    return engine.update_overdue_obligations()
