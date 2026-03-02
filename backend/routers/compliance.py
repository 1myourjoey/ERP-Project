from __future__ import annotations

import os
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import func as sqla_func, or_
from sqlalchemy.orm import Session

from database import get_db
from models.compliance import (
    ComplianceCheck,
    ComplianceDocument,
    ComplianceObligation,
    ComplianceRule,
    FundComplianceRule,
)
from models.attachment import Attachment
from models.document_template import DocumentTemplate
from models.fund import Fund
from models.llm_usage import LLMUsage
from models.task import Task
from schemas.compliance_history import (
    MonthlyReportResponse,
    RemediationStatsResponse,
    RuleAdjustmentSuggestion,
    ViolationPatternsResponse,
)
from services.compliance_engine import ComplianceEngine
from services.compliance_history_analyzer import ComplianceHistoryAnalyzer
from services.compliance_rule_engine import ComplianceRuleEngine
from services.legal_rag import LegalRAGService, MonthlyTokenLimitExceededError
from services.law_amendment_monitor import LawAmendmentMonitor
from services.periodic_compliance_scanner import PeriodicComplianceScanner
from services.document_service import build_variables_for_fund, generate_document_for_template
from services.scheduler import get_scheduler_service
from services.vector_db import VectorDBService

router = APIRouter(tags=["compliance"])
_COMPLIANCE_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "compliance"
_COMPLIANCE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


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


class ComplianceRuleCreateBody(BaseModel):
    fund_id: int | None = None
    document_id: int | None = None
    rule_code: str = Field(..., min_length=1)
    rule_name: str = Field(..., min_length=1)
    level: str = Field(..., min_length=2, max_length=2)
    category: str = Field(..., min_length=1)
    description: str | None = None
    condition: dict[str, Any]
    severity: str = "warning"
    auto_task: bool = False
    is_active: bool = True


class ComplianceRuleUpdateBody(BaseModel):
    fund_id: int | None = None
    document_id: int | None = None
    rule_code: str | None = None
    rule_name: str | None = None
    level: str | None = None
    category: str | None = None
    description: str | None = None
    condition: dict[str, Any] | None = None
    severity: str | None = None
    auto_task: bool | None = None
    is_active: bool | None = None


class ComplianceDocumentCreateBody(BaseModel):
    title: str = Field(..., min_length=1)
    document_type: str = Field(..., min_length=1)
    version: str | None = None
    effective_date: datetime | None = None
    content_summary: str | None = None
    file_path: str | None = None
    is_active: bool = True


class ComplianceInterpretBody(BaseModel):
    query: str = Field(..., min_length=1)
    fund_id: int | None = Field(default=None, ge=1)


class ComplianceManualScanBody(BaseModel):
    fund_id: int | None = Field(default=None, ge=1)
    mode: str = Field(default="daily")


def _serialize_legacy_rule(rule: ComplianceRule) -> dict:
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


def _serialize_fund_rule(db: Session, row: FundComplianceRule) -> dict:
    doc = db.get(ComplianceDocument, row.document_id) if row.document_id else None
    return {
        "id": row.id,
        "fund_id": row.fund_id,
        "document_id": row.document_id,
        "document_title": doc.title if doc else None,
        "rule_code": row.rule_code,
        "rule_name": row.rule_name,
        "level": row.level,
        "category": row.category,
        "description": row.description,
        "condition": row.condition if isinstance(row.condition, dict) else {},
        "severity": row.severity,
        "auto_task": bool(row.auto_task),
        "is_active": bool(row.is_active),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _serialize_document(row: ComplianceDocument) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "document_type": row.document_type,
        "version": row.version,
        "effective_date": row.effective_date.isoformat() if row.effective_date else None,
        "content_summary": row.content_summary,
        "file_path": row.file_path,
        "is_active": bool(row.is_active),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _serialize_check(db: Session, row: ComplianceCheck) -> dict:
    rule = db.get(FundComplianceRule, row.rule_id)
    fund = db.get(Fund, row.fund_id)
    task = db.get(Task, row.remediation_task_id) if row.remediation_task_id else None
    return {
        "id": row.id,
        "rule_id": row.rule_id,
        "rule_code": rule.rule_code if rule else None,
        "rule_name": rule.rule_name if rule else None,
        "level": rule.level if rule else None,
        "fund_id": row.fund_id,
        "fund_name": fund.name if fund else None,
        "checked_at": row.checked_at.isoformat() if row.checked_at else None,
        "result": row.result,
        "actual_value": row.actual_value,
        "threshold_value": row.threshold_value,
        "detail": row.detail,
        "trigger_type": row.trigger_type,
        "trigger_source": row.trigger_source,
        "trigger_source_id": row.trigger_source_id,
        "remediation_task_id": row.remediation_task_id,
        "remediation_task_title": task.title if task else None,
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
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
        "template_id": row.template_id,
        "target_system": rule.target_system if rule else None,
        "guideline_ref": rule.guideline_ref if rule else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _validate_rule_level(level: str) -> str:
    normalized = level.strip().upper()
    if normalized not in {"L1", "L2", "L3", "L4", "L5"}:
        raise HTTPException(status_code=400, detail="level must be one of L1, L2, L3, L4, L5")
    return normalized


@router.get("/api/compliance/rules")
def list_compliance_rules(
    fund_id: int | None = None,
    level: str | None = None,
    category: str | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(FundComplianceRule)
    if fund_id is not None:
        query = query.filter(
            or_(FundComplianceRule.fund_id == fund_id, FundComplianceRule.fund_id.is_(None))
        )
    if level:
        query = query.filter(FundComplianceRule.level == _validate_rule_level(level))
    if category:
        query = query.filter(FundComplianceRule.category == category.strip())
    if active_only:
        query = query.filter(FundComplianceRule.is_active == True)
    rows = query.order_by(FundComplianceRule.rule_code.asc()).all()
    return [_serialize_fund_rule(db, row) for row in rows]


@router.post("/api/compliance/rules", status_code=201)
def create_compliance_rule(body: ComplianceRuleCreateBody, db: Session = Depends(get_db)):
    code = body.rule_code.strip()
    exists = db.query(FundComplianceRule).filter(FundComplianceRule.rule_code == code).first()
    if exists:
        raise HTTPException(status_code=409, detail="rule_code already exists")

    if body.document_id is not None and not db.get(ComplianceDocument, body.document_id):
        raise HTTPException(status_code=404, detail="document not found")
    if body.fund_id is not None and not db.get(Fund, body.fund_id):
        raise HTTPException(status_code=404, detail="fund not found")

    row = FundComplianceRule(
        fund_id=body.fund_id,
        document_id=body.document_id,
        rule_code=code,
        rule_name=body.rule_name.strip(),
        level=_validate_rule_level(body.level),
        category=body.category.strip(),
        description=body.description.strip() if body.description else None,
        condition=body.condition,
        severity=body.severity.strip().lower(),
        auto_task=bool(body.auto_task),
        is_active=bool(body.is_active),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_fund_rule(db, row)


@router.get("/api/compliance/rules/{rule_code}")
def get_compliance_rule(rule_code: str, db: Session = Depends(get_db)):
    row = db.query(FundComplianceRule).filter(FundComplianceRule.rule_code == rule_code).first()
    if not row:
        raise HTTPException(status_code=404, detail="rule not found")
    return _serialize_fund_rule(db, row)


@router.put("/api/compliance/rules/{rule_id}")
def update_compliance_rule(rule_id: int, body: ComplianceRuleUpdateBody, db: Session = Depends(get_db)):
    row = db.get(FundComplianceRule, rule_id)
    if not row:
        raise HTTPException(status_code=404, detail="rule not found")

    payload = body.model_dump(exclude_unset=True)
    if "fund_id" in payload and payload["fund_id"] is not None and not db.get(Fund, payload["fund_id"]):
        raise HTTPException(status_code=404, detail="fund not found")
    if "document_id" in payload and payload["document_id"] is not None and not db.get(ComplianceDocument, payload["document_id"]):
        raise HTTPException(status_code=404, detail="document not found")
    if "rule_code" in payload and payload["rule_code"]:
        new_code = str(payload["rule_code"]).strip()
        dup = (
            db.query(FundComplianceRule)
            .filter(FundComplianceRule.rule_code == new_code, FundComplianceRule.id != rule_id)
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="rule_code already exists")
        payload["rule_code"] = new_code
    if "level" in payload and payload["level"] is not None:
        payload["level"] = _validate_rule_level(str(payload["level"]))
    if "severity" in payload and payload["severity"] is not None:
        payload["severity"] = str(payload["severity"]).strip().lower()
    if "category" in payload and payload["category"] is not None:
        payload["category"] = str(payload["category"]).strip()
    if "rule_name" in payload and payload["rule_name"] is not None:
        payload["rule_name"] = str(payload["rule_name"]).strip()
    if "description" in payload:
        payload["description"] = str(payload["description"]).strip() if payload["description"] else None

    for key, value in payload.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return _serialize_fund_rule(db, row)


@router.delete("/api/compliance/rules/{rule_id}")
def delete_compliance_rule(rule_id: int, db: Session = Depends(get_db)):
    row = db.get(FundComplianceRule, rule_id)
    if not row:
        raise HTTPException(status_code=404, detail="rule not found")
    db.delete(row)
    db.commit()
    return {"deleted": True, "id": rule_id}


@router.get("/api/compliance/documents")
def list_compliance_documents(active_only: bool = False, db: Session = Depends(get_db)):
    query = db.query(ComplianceDocument)
    if active_only:
        query = query.filter(ComplianceDocument.is_active == True)
    rows = query.order_by(ComplianceDocument.id.desc()).all()
    return [_serialize_document(row) for row in rows]


@router.post("/api/compliance/documents", status_code=201)
def create_compliance_document(body: ComplianceDocumentCreateBody, db: Session = Depends(get_db)):
    row = ComplianceDocument(
        title=body.title.strip(),
        document_type=body.document_type.strip(),
        version=body.version.strip() if body.version else None,
        effective_date=body.effective_date,
        content_summary=body.content_summary.strip() if body.content_summary else None,
        file_path=body.file_path.strip() if body.file_path else None,
        is_active=bool(body.is_active),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_document(row)


@router.post("/api/compliance/check/{fund_id}")
def run_compliance_check_for_fund(
    fund_id: int,
    trigger_type: str = Query(default="manual"),
    db: Session = Depends(get_db),
):
    if not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="fund not found")

    checks = ComplianceRuleEngine().evaluate_all(
        fund_id=fund_id,
        db=db,
        trigger_type=trigger_type.strip().lower() or "manual",
        trigger_source="manual_check" if trigger_type.strip().lower() == "manual" else "api_check",
        trigger_source_id=fund_id,
    )
    serialized = [_serialize_check(db, row) for row in checks]
    return {
        "fund_id": fund_id,
        "checked_count": len(serialized),
        "failed_count": sum(1 for row in serialized if row["result"] in {"fail", "error"}),
        "warning_count": sum(1 for row in serialized if row["result"] == "warning"),
        "checks": serialized,
    }


@router.get("/api/compliance/checks")
def list_compliance_checks(
    fund_id: int | None = None,
    result: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(ComplianceCheck)
    if fund_id is not None:
        query = query.filter(ComplianceCheck.fund_id == fund_id)
    if result:
        query = query.filter(ComplianceCheck.result == result.strip().lower())
    rows = query.order_by(ComplianceCheck.checked_at.desc(), ComplianceCheck.id.desc()).limit(limit).all()
    return [_serialize_check(db, row) for row in rows]


@router.get("/api/compliance/legacy-rules")
def list_legacy_compliance_rules(
    category: str | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(ComplianceRule)
    if category:
        query = query.filter(ComplianceRule.category == category)
    if active_only:
        query = query.filter(ComplianceRule.is_active == True)
    rows = query.order_by(ComplianceRule.rule_code.asc()).all()
    return [_serialize_legacy_rule(rule) for rule in rows]


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
        normalized_category = category.strip().lower()
        rule_ids = {
            rule.id
            for rule in db.query(ComplianceRule)
            .filter(ComplianceRule.category == normalized_category)
            .all()
        }
        rows = [row for row in rows if row.rule_id in rule_ids]
    return [_serialize_obligation(db, row) for row in rows]


@router.post("/api/compliance/obligations/{obligation_id}/complete")
def complete_compliance_obligation(
    obligation_id: int,
    body: ObligationCompleteBody,
    db: Session = Depends(get_db),
):
    row = db.get(ComplianceObligation, obligation_id)
    if not row:
        raise HTTPException(status_code=404, detail="compliance obligation not found")

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
        raise HTTPException(status_code=404, detail="compliance obligation not found")

    row.status = "waived"
    reason = (body.reason or "").strip()
    row.evidence_note = f"[waived] {reason}" if reason else "[waived]"

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


@router.post("/api/compliance/obligations/{obligation_id}/generate-document")
def generate_obligation_document(
    obligation_id: int,
    db: Session = Depends(get_db),
):
    row = db.get(ComplianceObligation, obligation_id)
    if not row:
        raise HTTPException(status_code=404, detail="compliance obligation not found")
    if row.template_id is None:
        raise HTTPException(status_code=400, detail="template_id is not configured for this obligation")

    template = db.get(DocumentTemplate, row.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="document template not found")

    fund = db.get(Fund, row.fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="fund not found")

    rule = db.get(ComplianceRule, row.rule_id)
    variables = build_variables_for_fund(
        fund,
        list(fund.lps or []),
        extra={
            "obligation_id": row.id,
            "obligation_due_date": row.due_date.isoformat() if row.due_date else "",
            "obligation_status": row.status or "",
            "rule_code": rule.rule_code if rule else "",
            "rule_title": rule.title if rule else "",
        },
    )

    try:
        buffer = generate_document_for_template(template, variables)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"document generation failed: {exc}") from exc

    payload = buffer.getvalue()
    stored_name = f"{uuid4().hex}.docx"
    stored_path = _COMPLIANCE_UPLOAD_DIR / stored_name
    stored_path.write_bytes(payload)

    attachment = Attachment(
        filename=stored_name,
        original_filename=f"compliance_obligation_{row.id}.docx",
        file_path=str(stored_path),
        file_size=len(payload),
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        entity_type="compliance_obligation",
        entity_id=row.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return {
        "obligation_id": row.id,
        "template_id": row.template_id,
        "attachment_id": attachment.id,
        "download_url": f"/api/documents/{attachment.id}/download",
        "message": "의무사항 문서가 생성되었습니다.",
    }


@router.get("/api/compliance/dashboard")
def get_compliance_dashboard(db: Session = Depends(get_db)):
    today = date.today()
    week_end = today + timedelta(days=7)
    if today.month == 12:
        month_end = date(today.year, 12, 31)
    else:
        month_end = date(today.year, today.month + 1, 1) - timedelta(days=1)

    obligations = db.query(ComplianceObligation).all()
    overdue_count = sum(
        1
        for row in obligations
        if row.status == "overdue"
        or (
            row.status in ("pending", "in_progress")
            and row.due_date is not None
            and row.due_date < today
        )
    )
    due_this_week = sum(
        1
        for row in obligations
        if row.status in ("pending", "in_progress", "overdue")
        and row.due_date is not None
        and today <= row.due_date <= week_end
    )
    due_this_month = sum(
        1
        for row in obligations
        if row.status in ("pending", "in_progress", "overdue")
        and row.due_date is not None
        and today <= row.due_date <= month_end
    )
    completed_count = sum(1 for row in obligations if row.status == "completed")

    funds = db.query(Fund).order_by(Fund.id.asc()).all()
    fund_map = {fund.id: fund for fund in funds}

    by_fund: list[dict] = []
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

    new_rule_count = db.query(FundComplianceRule).count()
    active_rule_count = db.query(FundComplianceRule).filter(FundComplianceRule.is_active == True).count()
    checks_total = db.query(ComplianceCheck).count()
    checks_failed = (
        db.query(ComplianceCheck)
        .filter(ComplianceCheck.result.in_(["fail", "error"]))
        .count()
    )
    checks_recent = (
        db.query(ComplianceCheck)
        .filter(ComplianceCheck.checked_at >= datetime.utcnow() - timedelta(days=7))
        .count()
    )

    latest_checks = (
        db.query(ComplianceCheck)
        .order_by(ComplianceCheck.checked_at.desc(), ComplianceCheck.id.desc())
        .limit(200)
        .all()
    )
    latest_rule_ids = sorted({row.rule_id for row in latest_checks})
    latest_rules = (
        db.query(FundComplianceRule)
        .filter(FundComplianceRule.id.in_(latest_rule_ids))
        .all()
        if latest_rule_ids
        else []
    )
    rule_map = {row.id: row for row in latest_rules}

    active_violations = sum(1 for row in latest_checks if row.result in ("fail", "error"))
    warning_count = sum(1 for row in latest_checks if row.result == "warning")
    pass_count = sum(1 for row in latest_checks if row.result == "pass")
    summary = {
        "total_rules": active_rule_count,
        "active_violations": active_violations,
        "warnings": warning_count,
        "passed": pass_count,
        "compliance_rate": round((pass_count / max(len(latest_checks), 1)) * 100, 1),
    }

    checks_by_fund: dict[int, list[ComplianceCheck]] = {}
    for row in latest_checks:
        checks_by_fund.setdefault(row.fund_id, []).append(row)

    fund_status: list[dict[str, Any]] = []
    for fund in funds:
        fund_checks = checks_by_fund.get(fund.id, [])
        fund_passed = sum(1 for row in fund_checks if row.result == "pass")
        fund_failed = sum(1 for row in fund_checks if row.result in ("fail", "error"))
        fund_warnings = sum(1 for row in fund_checks if row.result == "warning")
        last_checked = max(
            (row.checked_at for row in fund_checks if row.checked_at is not None),
            default=None,
        )
        fund_status.append(
            {
                "fund_id": fund.id,
                "fund_name": fund.name,
                "total_rules": len(fund_checks),
                "passed": fund_passed,
                "failed": fund_failed,
                "warnings": fund_warnings,
                "violation_count": fund_failed,
                "compliance_rate": round((fund_passed / max(len(fund_checks), 1)) * 100, 1),
                "last_checked": last_checked.isoformat() if last_checked else None,
            }
        )

    recent_checks_data = []
    for row in latest_checks[:30]:
        rule = rule_map.get(row.rule_id)
        fund = fund_map.get(row.fund_id)
        recent_checks_data.append(
            {
                "id": row.id,
                "fund_id": row.fund_id,
                "fund_name": fund.name if fund else None,
                "rule_id": row.rule_id,
                "rule_code": rule.rule_code if rule else None,
                "rule_name": rule.rule_name if rule else None,
                "result": row.result,
                "detail": row.detail,
                "checked_at": row.checked_at.isoformat() if row.checked_at else None,
                "trigger_type": row.trigger_type,
                "trigger_source": row.trigger_source,
            }
        )

    amendment_rows = (
        db.query(ComplianceDocument)
        .filter(ComplianceDocument.document_type == "amendment_alert")
        .order_by(ComplianceDocument.created_at.desc(), ComplianceDocument.id.desc())
        .limit(10)
        .all()
    )
    amendment_alerts = []
    for row in amendment_rows:
        effective_day = row.effective_date.date() if row.effective_date else None
        days_remaining = (effective_day - today).days if effective_day else None
        law_name = (row.title or "").strip()
        if law_name.startswith("[") and "]" in law_name:
            law_name = law_name.split("]", 1)[1].strip()
        amendment_alerts.append(
            {
                "id": row.id,
                "law_name": law_name or row.title,
                "effective_date": row.effective_date.isoformat() if row.effective_date else None,
                "days_remaining": days_remaining,
                "summary": row.content_summary,
                "version": row.version,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
        )

    doc_stats = {
        "laws": 0,
        "regulations": 0,
        "guidelines": 0,
        "agreements": 0,
        "internal": 0,
        "total_chunks": 0,
    }
    try:
        vector_stats = VectorDBService().get_stats()
        for key in ("laws", "regulations", "guidelines", "agreements", "internal"):
            value = vector_stats.get(key, {}).get("count", 0)
            doc_stats[key] = int(value) if value is not None else 0
        doc_stats["total_chunks"] = int(sum(doc_stats[key] for key in vector_stats.keys() if key in doc_stats))
    except Exception:
        doc_stats["total_chunks"] = 0

    first_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_tokens = (
        db.query(sqla_func.coalesce(sqla_func.sum(LLMUsage.total_tokens), 0))
        .filter(LLMUsage.created_at >= first_of_month)
        .scalar()
        or 0
    )
    month_cost = (
        db.query(sqla_func.coalesce(sqla_func.sum(LLMUsage.estimated_cost_usd), 0.0))
        .filter(LLMUsage.created_at >= first_of_month)
        .scalar()
        or 0.0
    )
    llm_monthly_limit = int(os.getenv("LLM_MONTHLY_LIMIT", "500000"))
    llm_usage = {
        "month_total_tokens": int(month_tokens),
        "month_limit": llm_monthly_limit,
        "month_cost_usd": round(float(month_cost), 6),
        "usage_rate": round((int(month_tokens) / max(llm_monthly_limit, 1)) * 100, 2),
    }

    return {
        "summary": summary,
        "fund_status": fund_status,
        "recent_checks": recent_checks_data,
        "amendment_alerts": amendment_alerts,
        "document_stats": doc_stats,
        "llm_usage": llm_usage,
        "overdue_count": overdue_count,
        "due_this_week": due_this_week,
        "due_this_month": due_this_month,
        "completed_count": completed_count,
        "by_fund": by_fund,
        "rule_count": new_rule_count,
        "active_rule_count": active_rule_count,
        "check_count": checks_total,
        "failed_check_count": checks_failed,
        "recent_check_count": checks_recent,
    }


@router.post("/api/compliance/interpret")
async def interpret_legal_query(
    body: ComplianceInterpretBody = Body(...),
    db: Session = Depends(get_db),
):
    service = LegalRAGService()
    try:
        return await service.interpret(
            query=body.query,
            fund_id=body.fund_id,
            db=db,
            user_id=None,
        )
    except MonthlyTokenLimitExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/api/compliance/llm-usage")
def get_llm_usage(
    period: str = Query(default="month"),
    db: Session = Depends(get_db),
):
    service = LegalRAGService()
    try:
        return service.get_usage_summary(db=db, period=period)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/compliance/history/patterns", response_model=ViolationPatternsResponse)
def get_violation_patterns(
    fund_id: int = Query(..., ge=1),
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
):
    if not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="fund not found")
    analyzer = ComplianceHistoryAnalyzer()
    return analyzer.analyze_violation_patterns(fund_id=fund_id, db=db, months=months)


@router.get("/api/compliance/history/suggestions", response_model=list[RuleAdjustmentSuggestion])
def get_rule_suggestions(
    fund_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    if fund_id is not None and not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="fund not found")
    analyzer = ComplianceHistoryAnalyzer()
    return analyzer.suggest_rule_adjustments(db=db, fund_id=fund_id)


@router.get("/api/compliance/history/remediation", response_model=RemediationStatsResponse)
def get_remediation_stats(
    fund_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    if fund_id is not None and not db.get(Fund, fund_id):
        raise HTTPException(status_code=404, detail="fund not found")
    analyzer = ComplianceHistoryAnalyzer()
    return analyzer.get_remediation_stats(fund_id=fund_id, db=db)


@router.get("/api/compliance/report/monthly", response_model=MonthlyReportResponse)
def get_monthly_report(
    fund_id: int = Query(..., ge=1),
    year_month: str = Query(..., min_length=7, max_length=7),
    db: Session = Depends(get_db),
):
    analyzer = ComplianceHistoryAnalyzer()
    try:
        return analyzer.generate_monthly_report(fund_id=fund_id, year_month=year_month, db=db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/compliance/report/monthly/download")
def download_monthly_report(
    fund_id: int = Query(..., ge=1),
    year_month: str = Query(..., min_length=7, max_length=7),
    db: Session = Depends(get_db),
):
    analyzer = ComplianceHistoryAnalyzer()
    try:
        report = analyzer.generate_monthly_report(fund_id=fund_id, year_month=year_month, db=db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    content = analyzer.build_monthly_report_text(report)
    filename = f"compliance-report-{fund_id}-{year_month}.txt"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return PlainTextResponse(content=content, headers=headers)


@router.get("/api/compliance/scan-history")
def get_scan_history(
    period: str = Query(default="week"),
    db: Session = Depends(get_db),
):
    normalized_period = (period or "week").strip().lower()
    start_at: datetime | None = None
    if normalized_period == "week":
        start_at = datetime.utcnow() - timedelta(days=7)
    elif normalized_period == "month":
        start_at = datetime.utcnow() - timedelta(days=30)
    elif normalized_period != "all":
        raise HTTPException(status_code=400, detail="period must be one of: week, month, all")

    query = db.query(ComplianceCheck).filter(
        ComplianceCheck.trigger_type.in_(["scheduled", "manual"])
    )
    if start_at is not None:
        query = query.filter(ComplianceCheck.checked_at >= start_at)

    rows = query.order_by(ComplianceCheck.checked_at.desc(), ComplianceCheck.id.desc()).limit(500).all()

    history_map: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        checked_at = row.checked_at or datetime.utcnow()
        source = (row.trigger_source or "unknown").strip() or "unknown"
        date_key = checked_at.strftime("%Y-%m-%d")
        key = (source, date_key)
        item = history_map.get(key)
        if item is None:
            item = {
                "scan_type": source,
                "scan_date": date_key,
                "last_checked_at": checked_at.isoformat(),
                "checked_count": 0,
                "pass_count": 0,
                "warning_count": 0,
                "failed_count": 0,
                "fund_ids": set(),
            }
            history_map[key] = item
        item["checked_count"] += 1
        if row.result == "pass":
            item["pass_count"] += 1
        elif row.result == "warning":
            item["warning_count"] += 1
        elif row.result in {"fail", "error"}:
            item["failed_count"] += 1
        item["fund_ids"].add(row.fund_id)
        if checked_at.isoformat() > str(item["last_checked_at"]):
            item["last_checked_at"] = checked_at.isoformat()

    history = []
    for value in history_map.values():
        history.append(
            {
                "scan_type": value["scan_type"],
                "scan_date": value["scan_date"],
                "last_checked_at": value["last_checked_at"],
                "checked_count": value["checked_count"],
                "pass_count": value["pass_count"],
                "warning_count": value["warning_count"],
                "failed_count": value["failed_count"],
                "fund_count": len(value["fund_ids"]),
            }
        )

    history.sort(key=lambda row: row["last_checked_at"], reverse=True)

    scheduler_status = get_scheduler_service().get_schedule_status()
    return {
        "period": normalized_period,
        "schedules": scheduler_status,
        "history": history[:100],
    }


@router.get("/api/compliance/amendments")
def get_amendment_alerts(
    limit: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ComplianceDocument)
        .filter(ComplianceDocument.document_type == "amendment_alert")
        .order_by(ComplianceDocument.created_at.desc(), ComplianceDocument.id.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_document(row) for row in rows]


@router.post("/api/compliance/scan/manual")
async def trigger_manual_scan(
    body: ComplianceManualScanBody | None = Body(default=None),
):
    payload = body or ComplianceManualScanBody()
    scanner = PeriodicComplianceScanner()
    mode = (payload.mode or "daily").strip().lower()
    if payload.fund_id is not None:
        return await scanner.run_fund_scan(
            fund_id=payload.fund_id,
            trigger_type="manual",
            trigger_source="manual_scan",
        )
    if mode == "full":
        return await scanner.run_full_audit(
            trigger_type="manual",
            trigger_source="manual_full_audit",
        )
    if mode == "law":
        monitor = LawAmendmentMonitor()
        return await monitor.check_amendments(
            days=7,
            trigger_source="manual_law_amendment_check",
        )
    return await scanner.run_daily_scan(
        trigger_type="manual",
        trigger_source="manual_scan",
    )


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
