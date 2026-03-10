from __future__ import annotations

import json
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from config import settings
from models.biz_report import BizReport, BizReportRequest
from models.compliance import ComplianceDocument, ComplianceObligation
from models.erp_backbone import (
    ErpAutomationOutbox,
    ErpDocumentLink,
    ErpDocumentRecord,
    ErpEvent,
    ErpRelation,
    ErpSubject,
)
from models.fund import Fund, FundKeyTerm, FundNoticePeriod, LP
from models.gp_entity import GPEntity
from models.investment import Investment, InvestmentDocument, PortfolioCompany
from models.investment_review import InvestmentReview
from models.task import Task
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance, WorkflowStepInstanceDocument
from schemas.erp_backbone import (
    DocumentRecordResponse,
    ErpEntityContextResponse,
    ErpEventResponse,
    ErpRelationResponse,
    ErpSubjectResponse,
    ErpTimelineResponse,
)

SUBJECT_GP = "gp_entity"
SUBJECT_FUND = "fund"
SUBJECT_LP = "lp"
SUBJECT_COMPANY = "company"
SUBJECT_INVESTMENT = "investment"
SUBJECT_INVESTMENT_REVIEW = "investment_review"
SUBJECT_TASK = "task"
SUBJECT_WORKFLOW_INSTANCE = "workflow_instance"
SUBJECT_WORKFLOW_STEP = "workflow_step_instance"
SUBJECT_COMPLIANCE_OBLIGATION = "compliance_obligation"

_BIZ_REPORT_DOC_COLUMNS: dict[str, str] = {
    "financial_statement": "doc_financial_statement",
    "biz_registration": "doc_biz_registration",
    "shareholder_list": "doc_shareholder_list",
    "corp_registry": "doc_corp_registry",
    "insurance_cert": "doc_insurance_cert",
    "credit_report": "doc_credit_report",
    "other_changes": "doc_other_changes",
}
_BIZ_REPORT_DOC_LABELS: dict[str, str] = {
    "financial_statement": "Financial Statement",
    "biz_registration": "Business Registration",
    "shareholder_list": "Shareholder List",
    "corp_registry": "Corporate Registry",
    "insurance_cert": "Insurance Certificate",
    "credit_report": "Credit Report",
    "other_changes": "Other Changes",
}
_BIZ_REPORT_RECEIVED_STATUSES = {"collected", "received", "verified"}


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=_json_default, sort_keys=True)


def _loads(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _now() -> datetime:
    return datetime.utcnow()


def _as_datetime(value: date | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.combine(value, time.min)


def _lifecycle_from_status(status: str | None) -> str:
    normalized = (status or "").strip().lower()
    if normalized in {"", "draft", "pending", "planned", "requested", "preparing", "forming", "active"}:
        return "active"
    if normalized in {"in_progress", "reviewing", "executing"}:
        return "active"
    if normalized in {"completed", "done", "collected", "verified", "waived"}:
        return "done"
    if normalized in {"cancelled", "canceled", "stopped", "archived", "deleted"}:
        return "archived"
    return "active"


def _document_lifecycle(status: str | None) -> str:
    normalized = (status or "").strip().lower()
    if normalized in {"collected", "verified", "received", "checked", "completed"}:
        return "done"
    if normalized in {"reviewing"}:
        return "active"
    if normalized in {"pending", "requested", "not_requested"}:
        return "open"
    if normalized in {"deleted", "archived"}:
        return "archived"
    return "open"


def _record_snapshot(row: Any, include: set[str] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for column in row.__table__.columns:
        key = column.name
        if include is not None and key not in include:
            continue
        payload[key] = getattr(row, key)
    return payload


def _subject_metadata(subject_type: str, row: Any, db: Session) -> dict[str, Any]:
    if subject_type == SUBJECT_GP:
        return {"entity_type": getattr(row, "entity_type", None), "is_primary": bool(getattr(row, "is_primary", False))}
    if subject_type == SUBJECT_FUND:
        notice_periods = db.query(FundNoticePeriod).filter(FundNoticePeriod.fund_id == row.id).count()
        key_terms = db.query(FundKeyTerm).filter(FundKeyTerm.fund_id == row.id).count()
        return {"type": row.type, "status": row.status, "notice_period_count": int(notice_periods), "key_term_count": int(key_terms)}
    if subject_type == SUBJECT_LP:
        return {"type": row.type, "commitment": row.commitment, "paid_in": row.paid_in}
    if subject_type == SUBJECT_COMPANY:
        return {"industry": row.industry, "ceo": row.ceo, "analyst": row.analyst}
    if subject_type == SUBJECT_INVESTMENT:
        return {"status": row.status, "instrument": row.instrument, "amount": row.amount, "investment_date": row.investment_date}
    if subject_type == SUBJECT_INVESTMENT_REVIEW:
        return {"status": row.status, "decision_result": row.decision_result, "target_amount": row.target_amount}
    if subject_type == SUBJECT_TASK:
        return {"quadrant": row.quadrant, "category": row.category, "deadline": row.deadline, "source": row.source}
    if subject_type == SUBJECT_WORKFLOW_INSTANCE:
        return {"status": row.status, "trigger_date": row.trigger_date, "name": row.name}
    if subject_type == SUBJECT_WORKFLOW_STEP:
        return {"status": row.status, "calculated_date": row.calculated_date, "task_id": row.task_id}
    if subject_type == SUBJECT_COMPLIANCE_OBLIGATION:
        return {"status": row.status, "due_date": row.due_date, "period_type": row.period_type, "template_id": row.template_id}
    return {}


def _subject_context(subject_type: str, row: Any, db: Session) -> dict[str, Any]:
    if subject_type == SUBJECT_GP:
        return {"gp_entity_id": row.id}
    if subject_type == SUBJECT_FUND:
        return {"fund_id": row.id, "gp_entity_id": row.gp_entity_id}
    if subject_type == SUBJECT_LP:
        return {"fund_id": row.fund_id, "lp_id": row.id}
    if subject_type == SUBJECT_COMPANY:
        return {"company_id": row.id}
    if subject_type == SUBJECT_INVESTMENT:
        gp_entity_id = None
        if row.fund_id:
            fund = db.get(Fund, row.fund_id)
            gp_entity_id = fund.gp_entity_id if fund else None
        return {"fund_id": row.fund_id, "company_id": row.company_id, "investment_id": row.id, "gp_entity_id": gp_entity_id}
    if subject_type == SUBJECT_INVESTMENT_REVIEW:
        gp_entity_id = None
        if row.fund_id:
            fund = db.get(Fund, row.fund_id)
            gp_entity_id = fund.gp_entity_id if fund else None
        investment = db.get(Investment, row.investment_id) if row.investment_id else None
        return {
            "fund_id": row.fund_id or (investment.fund_id if investment else None),
            "investment_id": row.investment_id,
            "company_id": investment.company_id if investment else None,
            "gp_entity_id": gp_entity_id,
        }
    if subject_type == SUBJECT_TASK:
        company_id = None
        gp_entity_id = row.gp_entity_id
        if row.investment_id:
            investment = db.get(Investment, row.investment_id)
            if investment:
                company_id = investment.company_id
                if gp_entity_id is None and investment.fund_id:
                    fund = db.get(Fund, investment.fund_id)
                    gp_entity_id = fund.gp_entity_id if fund else None
        return {
            "fund_id": row.fund_id,
            "investment_id": row.investment_id,
            "company_id": company_id,
            "gp_entity_id": gp_entity_id,
            "task_id": row.id,
            "workflow_instance_id": row.workflow_instance_id,
            "obligation_id": row.obligation_id,
        }
    if subject_type == SUBJECT_WORKFLOW_INSTANCE:
        return {
            "fund_id": row.fund_id,
            "investment_id": row.investment_id,
            "company_id": row.company_id,
            "gp_entity_id": row.gp_entity_id,
            "workflow_instance_id": row.id,
        }
    if subject_type == SUBJECT_WORKFLOW_STEP:
        instance = db.get(WorkflowInstance, row.instance_id) if row.instance_id else None
        return {
            "fund_id": instance.fund_id if instance else None,
            "investment_id": instance.investment_id if instance else None,
            "company_id": instance.company_id if instance else None,
            "gp_entity_id": instance.gp_entity_id if instance else None,
            "workflow_instance_id": row.instance_id,
            "task_id": row.task_id,
        }
    if subject_type == SUBJECT_COMPLIANCE_OBLIGATION:
        company_id = None
        gp_entity_id = None
        if row.investment_id:
            investment = db.get(Investment, row.investment_id)
            if investment:
                company_id = investment.company_id
                if investment.fund_id:
                    fund = db.get(Fund, investment.fund_id)
                    gp_entity_id = fund.gp_entity_id if fund else None
        elif row.fund_id:
            fund = db.get(Fund, row.fund_id)
            gp_entity_id = fund.gp_entity_id if fund else None
        return {
            "fund_id": row.fund_id,
            "investment_id": row.investment_id,
            "company_id": company_id,
            "gp_entity_id": gp_entity_id,
            "task_id": row.task_id,
            "obligation_id": row.id,
        }
    return {}


def _subject_display_name(subject_type: str, row: Any, db: Session) -> str | None:
    if subject_type in {SUBJECT_GP, SUBJECT_FUND, SUBJECT_LP, SUBJECT_COMPANY}:
        return getattr(row, "name", None)
    if subject_type == SUBJECT_INVESTMENT:
        company = db.get(PortfolioCompany, row.company_id) if row.company_id else None
        return company.name if company else f"investment:{row.id}"
    if subject_type == SUBJECT_INVESTMENT_REVIEW:
        return row.company_name or f"investment_review:{row.id}"
    if subject_type == SUBJECT_TASK:
        return row.title
    if subject_type == SUBJECT_WORKFLOW_INSTANCE:
        return row.name
    if subject_type == SUBJECT_WORKFLOW_STEP:
        if getattr(row, "step", None) is not None and getattr(row.step, "name", None):
            return row.step.name
        return f"workflow_step:{row.id}"
    if subject_type == SUBJECT_COMPLIANCE_OBLIGATION:
        return f"obligation:{row.id}"
    return f"{subject_type}:{getattr(row, 'id', 'unknown')}"


def _ensure_subject(
    db: Session,
    *,
    subject_type: str,
    native_id: int,
    display_name: str | None,
    state_code: str | None,
    lifecycle_stage: str,
    metadata: dict[str, Any] | None,
    context: dict[str, Any] | None,
) -> ErpSubject:
    subject = (
        db.query(ErpSubject)
        .filter(ErpSubject.subject_type == subject_type, ErpSubject.native_id == native_id)
        .first()
    )
    if subject is None:
        subject = ErpSubject(subject_type=subject_type, native_id=native_id)
        db.add(subject)
    subject.display_name = display_name
    subject.state_code = state_code
    subject.lifecycle_stage = lifecycle_stage
    context = context or {}
    subject.fund_id = context.get("fund_id")
    subject.gp_entity_id = context.get("gp_entity_id")
    subject.company_id = context.get("company_id")
    subject.investment_id = context.get("investment_id")
    subject.lp_id = context.get("lp_id")
    subject.task_id = context.get("task_id")
    subject.workflow_instance_id = context.get("workflow_instance_id")
    subject.obligation_id = context.get("obligation_id")
    subject.metadata_json = _dumps(metadata or {})
    db.flush()
    return subject


def sync_subject(
    db: Session,
    *,
    subject_type: str,
    row: Any,
    state_code: str | None = None,
    lifecycle_stage: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> ErpSubject:
    resolved_state = state_code if state_code is not None else getattr(row, "status", None)
    resolved_lifecycle = lifecycle_stage or _lifecycle_from_status(resolved_state)
    resolved_metadata = metadata if metadata is not None else _subject_metadata(subject_type, row, db)
    return _ensure_subject(
        db,
        subject_type=subject_type,
        native_id=int(row.id),
        display_name=_subject_display_name(subject_type, row, db),
        state_code=resolved_state,
        lifecycle_stage=resolved_lifecycle,
        metadata=resolved_metadata,
        context=_subject_context(subject_type, row, db),
    )


def get_subject(db: Session, subject_type: str, native_id: int) -> ErpSubject | None:
    return (
        db.query(ErpSubject)
        .filter(ErpSubject.subject_type == subject_type, ErpSubject.native_id == native_id)
        .first()
    )


def mark_subject_deleted(db: Session, *, subject_type: str, native_id: int, payload: dict[str, Any] | None = None) -> ErpSubject:
    return _ensure_subject(
        db,
        subject_type=subject_type,
        native_id=native_id,
        display_name=f"{subject_type}:{native_id}",
        state_code="deleted",
        lifecycle_stage="archived",
        metadata=payload or {},
        context={},
    )


def replace_relations(db: Session, *, parent: ErpSubject, relation_type: str, child_subjects: list[ErpSubject]) -> None:
    desired_ids = {child.id for child in child_subjects}
    existing = (
        db.query(ErpRelation)
        .filter(ErpRelation.parent_subject_id == parent.id, ErpRelation.relation_type == relation_type)
        .all()
    )
    for row in existing:
        if row.child_subject_id not in desired_ids:
            db.delete(row)
    existing_ids = {row.child_subject_id for row in existing}
    for child in child_subjects:
        if child.id in existing_ids:
            continue
        db.add(ErpRelation(parent_subject_id=parent.id, child_subject_id=child.id, relation_type=relation_type))
    db.flush()


def emit_event(
    db: Session,
    *,
    subject: ErpSubject,
    event_type: str,
    actor_user_id: int | None = None,
    correlation_key: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
    origin_model: str | None = None,
    origin_id: int | None = None,
) -> ErpEvent:
    event = ErpEvent(
        subject_id=subject.id,
        event_type=event_type,
        actor_user_id=actor_user_id,
        correlation_key=correlation_key,
        origin_model=origin_model,
        origin_id=origin_id,
        fund_id=subject.fund_id,
        investment_id=subject.investment_id,
        before_json=_dumps(before) if before is not None else None,
        after_json=_dumps(after) if after is not None else None,
        payload_json=_dumps(payload) if payload is not None else None,
    )
    db.add(event)
    db.flush()

    if settings.ERP_BACKBONE_OUTBOX_ENABLED:
        db.add(
            ErpAutomationOutbox(
                event_id=event.id,
                subject_id=subject.id,
                channel="internal_rpa",
                status="pending",
                payload_json=_dumps(
                    {
                        "event_id": event.id,
                        "subject_id": subject.id,
                        "subject_type": subject.subject_type,
                        "native_id": subject.native_id,
                        "event_type": event.event_type,
                        "fund_id": subject.fund_id,
                        "investment_id": subject.investment_id,
                    }
                ),
            )
        )
        db.flush()
    return event


def backbone_enabled() -> bool:
    return settings.ERP_BACKBONE_WRITE_THROUGH


def record_snapshot(row: Any, include: set[str] | None = None) -> dict[str, Any]:
    return _record_snapshot(row, include=include)


def _enter_walk(
    visited: set[tuple[str, int]] | None,
    subject_type: str,
    native_id: int | None,
) -> tuple[set[tuple[str, int]], bool]:
    bucket = visited if visited is not None else set()
    if native_id is None:
        return bucket, False
    key = (subject_type, int(native_id))
    if key in bucket:
        return bucket, False
    bucket.add(key)
    return bucket, True


def _ensure_gp_subject(db: Session, gp_entity_id: int | None) -> ErpSubject | None:
    if gp_entity_id is None:
        return None
    entity = db.get(GPEntity, gp_entity_id)
    if entity is None:
        return None
    return sync_subject(db, subject_type=SUBJECT_GP, row=entity)


def sync_gp_entity_graph(
    db: Session,
    entity: GPEntity,
    *,
    _visited: set[tuple[str, int]] | None = None,
) -> ErpSubject:
    gp_subject = sync_subject(db, subject_type=SUBJECT_GP, row=entity)
    visited, should_expand = _enter_walk(_visited, SUBJECT_GP, entity.id)
    if not should_expand:
        return gp_subject

    fund_subjects = [
        sync_subject(db, subject_type=SUBJECT_FUND, row=row)
        for row in db.query(Fund).filter(Fund.gp_entity_id == entity.id).all()
    ]
    replace_relations(db, parent=gp_subject, relation_type="gp_manages_fund", child_subjects=fund_subjects)
    return gp_subject


def sync_fund_graph(
    db: Session,
    fund: Fund,
    *,
    _visited: set[tuple[str, int]] | None = None,
) -> ErpSubject:
    fund_subject = sync_subject(db, subject_type=SUBJECT_FUND, row=fund)
    visited, should_expand = _enter_walk(_visited, SUBJECT_FUND, fund.id)
    if not should_expand:
        return fund_subject

    gp_subject = _ensure_gp_subject(db, fund.gp_entity_id)
    replace_relations(db, parent=fund_subject, relation_type="fund_managed_by_gp", child_subjects=[gp_subject] if gp_subject else [])
    if gp_subject is not None:
        gp_fund_subjects = [
            sync_subject(db, subject_type=SUBJECT_FUND, row=row)
            for row in db.query(Fund).filter(Fund.gp_entity_id == fund.gp_entity_id).all()
        ]
        replace_relations(db, parent=gp_subject, relation_type="gp_manages_fund", child_subjects=gp_fund_subjects)

    lp_subjects = [
        sync_subject(db, subject_type=SUBJECT_LP, row=row)
        for row in db.query(LP).filter(LP.fund_id == fund.id).all()
    ]
    replace_relations(db, parent=fund_subject, relation_type="fund_has_lp", child_subjects=lp_subjects)

    investment_subjects = [
        sync_subject(db, subject_type=SUBJECT_INVESTMENT, row=row)
        for row in db.query(Investment).filter(Investment.fund_id == fund.id).all()
    ]
    replace_relations(db, parent=fund_subject, relation_type="fund_has_investment", child_subjects=investment_subjects)

    task_subjects = [
        sync_subject(db, subject_type=SUBJECT_TASK, row=row)
        for row in db.query(Task).filter(Task.fund_id == fund.id).all()
    ]
    replace_relations(db, parent=fund_subject, relation_type="fund_has_task", child_subjects=task_subjects)

    workflow_subjects = [
        sync_subject(db, subject_type=SUBJECT_WORKFLOW_INSTANCE, row=row)
        for row in db.query(WorkflowInstance).filter(WorkflowInstance.fund_id == fund.id).all()
    ]
    replace_relations(
        db,
        parent=fund_subject,
        relation_type="fund_has_workflow_instance",
        child_subjects=workflow_subjects,
    )

    obligation_subjects = [
        sync_subject(db, subject_type=SUBJECT_COMPLIANCE_OBLIGATION, row=row)
        for row in db.query(ComplianceObligation).filter(ComplianceObligation.fund_id == fund.id).all()
    ]
    replace_relations(
        db,
        parent=fund_subject,
        relation_type="fund_has_obligation",
        child_subjects=obligation_subjects,
    )
    return fund_subject


def sync_lp_graph(
    db: Session,
    lp: LP,
    *,
    _visited: set[tuple[str, int]] | None = None,
) -> ErpSubject:
    lp_subject = sync_subject(db, subject_type=SUBJECT_LP, row=lp)
    visited, should_expand = _enter_walk(_visited, SUBJECT_LP, lp.id)
    if not should_expand:
        return lp_subject

    fund = db.get(Fund, lp.fund_id)
    if fund is not None:
        fund_subject = sync_fund_graph(db, fund, _visited=visited)
        replace_relations(db, parent=lp_subject, relation_type="lp_commits_to_fund", child_subjects=[fund_subject])
    else:
        replace_relations(db, parent=lp_subject, relation_type="lp_commits_to_fund", child_subjects=[])
    return lp_subject


def sync_company_graph(
    db: Session,
    company: PortfolioCompany,
    *,
    _visited: set[tuple[str, int]] | None = None,
) -> ErpSubject:
    company_subject = sync_subject(db, subject_type=SUBJECT_COMPANY, row=company)
    _, should_expand = _enter_walk(_visited, SUBJECT_COMPANY, company.id)
    if not should_expand:
        return company_subject

    investment_subjects = [
        sync_subject(db, subject_type=SUBJECT_INVESTMENT, row=row)
        for row in db.query(Investment).filter(Investment.company_id == company.id).all()
    ]
    replace_relations(
        db,
        parent=company_subject,
        relation_type="company_has_investment",
        child_subjects=investment_subjects,
    )
    return company_subject


def sync_investment_graph(
    db: Session,
    investment: Investment,
    *,
    _visited: set[tuple[str, int]] | None = None,
) -> ErpSubject:
    investment_subject = sync_subject(db, subject_type=SUBJECT_INVESTMENT, row=investment)
    visited, should_expand = _enter_walk(_visited, SUBJECT_INVESTMENT, investment.id)
    if not should_expand:
        return investment_subject

    if investment.fund_id:
        fund = db.get(Fund, investment.fund_id)
        if fund is not None:
            fund_subject = sync_fund_graph(db, fund, _visited=visited)
            replace_relations(db, parent=investment_subject, relation_type="investment_scoped_to_fund", child_subjects=[fund_subject])
    else:
        replace_relations(db, parent=investment_subject, relation_type="investment_scoped_to_fund", child_subjects=[])

    if investment.company_id:
        company = db.get(PortfolioCompany, investment.company_id)
        if company is not None:
            company_subject = sync_company_graph(db, company, _visited=visited)
            replace_relations(
                db,
                parent=investment_subject,
                relation_type="investment_targets_company",
                child_subjects=[company_subject],
            )
    else:
        replace_relations(db, parent=investment_subject, relation_type="investment_targets_company", child_subjects=[])

    review_subjects = [
        sync_subject(db, subject_type=SUBJECT_INVESTMENT_REVIEW, row=row)
        for row in db.query(InvestmentReview).filter(InvestmentReview.investment_id == investment.id).all()
    ]
    replace_relations(
        db,
        parent=investment_subject,
        relation_type="investment_originates_from_review",
        child_subjects=review_subjects,
    )
    return investment_subject


def sync_investment_review_graph(
    db: Session,
    review: InvestmentReview,
    *,
    _visited: set[tuple[str, int]] | None = None,
) -> ErpSubject:
    review_subject = sync_subject(db, subject_type=SUBJECT_INVESTMENT_REVIEW, row=review)
    visited, should_expand = _enter_walk(_visited, SUBJECT_INVESTMENT_REVIEW, review.id)
    if not should_expand:
        return review_subject

    if review.fund_id:
        fund = db.get(Fund, review.fund_id)
        if fund is not None:
            fund_subject = sync_fund_graph(db, fund, _visited=visited)
            replace_relations(
                db,
                parent=review_subject,
                relation_type="review_targets_fund",
                child_subjects=[fund_subject],
            )
    else:
        replace_relations(db, parent=review_subject, relation_type="review_targets_fund", child_subjects=[])

    if review.investment_id:
        investment = db.get(Investment, review.investment_id)
        if investment is not None:
            investment_subject = sync_investment_graph(db, investment, _visited=visited)
            replace_relations(
                db,
                parent=review_subject,
                relation_type="review_converts_to_investment",
                child_subjects=[investment_subject],
            )
    else:
        replace_relations(db, parent=review_subject, relation_type="review_converts_to_investment", child_subjects=[])
    return review_subject


def sync_task_graph(
    db: Session,
    task: Task,
    *,
    _visited: set[tuple[str, int]] | None = None,
) -> ErpSubject:
    task_subject = sync_subject(db, subject_type=SUBJECT_TASK, row=task)
    visited, should_expand = _enter_walk(_visited, SUBJECT_TASK, task.id)
    if not should_expand:
        return task_subject

    if task.fund_id:
        fund = db.get(Fund, task.fund_id)
        if fund is not None:
            fund_subject = sync_fund_graph(db, fund, _visited=visited)
            replace_relations(db, parent=task_subject, relation_type="task_scoped_to_fund", child_subjects=[fund_subject])
    else:
        replace_relations(db, parent=task_subject, relation_type="task_scoped_to_fund", child_subjects=[])

    if task.investment_id:
        investment = db.get(Investment, task.investment_id)
        if investment is not None:
            investment_subject = sync_investment_graph(db, investment, _visited=visited)
            replace_relations(
                db,
                parent=task_subject,
                relation_type="task_scoped_to_investment",
                child_subjects=[investment_subject],
            )
    else:
        replace_relations(db, parent=task_subject, relation_type="task_scoped_to_investment", child_subjects=[])

    if task.gp_entity_id:
        gp_subject = _ensure_gp_subject(db, task.gp_entity_id)
        replace_relations(db, parent=task_subject, relation_type="task_scoped_to_gp", child_subjects=[gp_subject] if gp_subject else [])
    else:
        replace_relations(db, parent=task_subject, relation_type="task_scoped_to_gp", child_subjects=[])

    if task.workflow_instance_id:
        instance = db.get(WorkflowInstance, task.workflow_instance_id)
        if instance is not None:
            instance_subject = sync_workflow_instance_graph(db, instance, _visited=visited)
            replace_relations(
                db,
                parent=task_subject,
                relation_type="task_implements_workflow_instance",
                child_subjects=[instance_subject],
            )
    else:
        replace_relations(db, parent=task_subject, relation_type="task_implements_workflow_instance", child_subjects=[])

    if task.obligation_id:
        obligation = db.get(ComplianceObligation, task.obligation_id)
        if obligation is not None:
            obligation_subject = sync_compliance_obligation_graph(db, obligation, _visited=visited)
            replace_relations(
                db,
                parent=task_subject,
                relation_type="task_tracks_obligation",
                child_subjects=[obligation_subject],
            )
    else:
        replace_relations(db, parent=task_subject, relation_type="task_tracks_obligation", child_subjects=[])
    return task_subject


def sync_workflow_step_graph(
    db: Session,
    step_instance: WorkflowStepInstance,
    *,
    _visited: set[tuple[str, int]] | None = None,
) -> ErpSubject:
    step_subject = sync_subject(db, subject_type=SUBJECT_WORKFLOW_STEP, row=step_instance)
    visited, should_expand = _enter_walk(_visited, SUBJECT_WORKFLOW_STEP, step_instance.id)
    if not should_expand:
        return step_subject

    instance = db.get(WorkflowInstance, step_instance.instance_id)
    if instance is not None:
        instance_subject = sync_workflow_instance_graph(db, instance, _visited=visited)
        replace_relations(
            db,
            parent=step_subject,
            relation_type="workflow_step_belongs_to_instance",
            child_subjects=[instance_subject],
        )
    else:
        replace_relations(db, parent=step_subject, relation_type="workflow_step_belongs_to_instance", child_subjects=[])

    if step_instance.task_id:
        task = db.get(Task, step_instance.task_id)
        if task is not None:
            task_subject = sync_task_graph(db, task, _visited=visited)
            replace_relations(
                db,
                parent=step_subject,
                relation_type="workflow_step_tracks_task",
                child_subjects=[task_subject],
            )
    else:
        replace_relations(db, parent=step_subject, relation_type="workflow_step_tracks_task", child_subjects=[])
    return step_subject


def sync_workflow_instance_graph(
    db: Session,
    instance: WorkflowInstance,
    *,
    _visited: set[tuple[str, int]] | None = None,
) -> ErpSubject:
    instance_subject = sync_subject(db, subject_type=SUBJECT_WORKFLOW_INSTANCE, row=instance)
    visited, should_expand = _enter_walk(_visited, SUBJECT_WORKFLOW_INSTANCE, instance.id)
    if not should_expand:
        return instance_subject

    if instance.fund_id:
        fund = db.get(Fund, instance.fund_id)
        if fund is not None:
            fund_subject = sync_fund_graph(db, fund, _visited=visited)
            replace_relations(
                db,
                parent=instance_subject,
                relation_type="workflow_instance_scoped_to_fund",
                child_subjects=[fund_subject],
            )
    else:
        replace_relations(db, parent=instance_subject, relation_type="workflow_instance_scoped_to_fund", child_subjects=[])

    if instance.investment_id:
        investment = db.get(Investment, instance.investment_id)
        if investment is not None:
            investment_subject = sync_investment_graph(db, investment, _visited=visited)
            replace_relations(
                db,
                parent=instance_subject,
                relation_type="workflow_instance_scoped_to_investment",
                child_subjects=[investment_subject],
            )
    else:
        replace_relations(db, parent=instance_subject, relation_type="workflow_instance_scoped_to_investment", child_subjects=[])

    if instance.company_id:
        company = db.get(PortfolioCompany, instance.company_id)
        if company is not None:
            company_subject = sync_company_graph(db, company, _visited=visited)
            replace_relations(
                db,
                parent=instance_subject,
                relation_type="workflow_instance_scoped_to_company",
                child_subjects=[company_subject],
            )
    else:
        replace_relations(db, parent=instance_subject, relation_type="workflow_instance_scoped_to_company", child_subjects=[])

    if instance.gp_entity_id:
        gp_subject = _ensure_gp_subject(db, instance.gp_entity_id)
        replace_relations(
            db,
            parent=instance_subject,
            relation_type="workflow_instance_scoped_to_gp",
            child_subjects=[gp_subject] if gp_subject else [],
        )
    else:
        replace_relations(db, parent=instance_subject, relation_type="workflow_instance_scoped_to_gp", child_subjects=[])

    step_subjects = [sync_subject(db, subject_type=SUBJECT_WORKFLOW_STEP, row=row) for row in instance.step_instances]
    replace_relations(
        db,
        parent=instance_subject,
        relation_type="workflow_instance_has_step",
        child_subjects=step_subjects,
    )
    return instance_subject


def sync_compliance_obligation_graph(
    db: Session,
    obligation: ComplianceObligation,
    *,
    _visited: set[tuple[str, int]] | None = None,
) -> ErpSubject:
    obligation_subject = sync_subject(db, subject_type=SUBJECT_COMPLIANCE_OBLIGATION, row=obligation)
    visited, should_expand = _enter_walk(_visited, SUBJECT_COMPLIANCE_OBLIGATION, obligation.id)
    if not should_expand:
        return obligation_subject

    if obligation.fund_id:
        fund = db.get(Fund, obligation.fund_id)
        if fund is not None:
            fund_subject = sync_fund_graph(db, fund, _visited=visited)
            replace_relations(
                db,
                parent=obligation_subject,
                relation_type="obligation_scoped_to_fund",
                child_subjects=[fund_subject],
            )
    else:
        replace_relations(db, parent=obligation_subject, relation_type="obligation_scoped_to_fund", child_subjects=[])

    if obligation.investment_id:
        investment = db.get(Investment, obligation.investment_id)
        if investment is not None:
            investment_subject = sync_investment_graph(db, investment, _visited=visited)
            replace_relations(
                db,
                parent=obligation_subject,
                relation_type="obligation_scoped_to_investment",
                child_subjects=[investment_subject],
            )
    else:
        replace_relations(db, parent=obligation_subject, relation_type="obligation_scoped_to_investment", child_subjects=[])

    if obligation.task_id:
        task = db.get(Task, obligation.task_id)
        if task is not None:
            task_subject = sync_task_graph(db, task, _visited=visited)
            replace_relations(
                db,
                parent=obligation_subject,
                relation_type="obligation_generates_task",
                child_subjects=[task_subject],
            )
    else:
        replace_relations(db, parent=obligation_subject, relation_type="obligation_generates_task", child_subjects=[])
    return obligation_subject


def _ensure_document_record(
    db: Session,
    *,
    origin_model: str,
    origin_id: int,
    origin_key: str = "",
    title: str,
    document_role: str = "artifact",
    document_type: str | None = None,
    status_code: str = "pending",
    lifecycle_stage: str | None = None,
    template_id: int | None = None,
    attachment_id: int | None = None,
    due_date: date | None = None,
    requested_at: date | datetime | None = None,
    received_at: date | datetime | None = None,
    verified_at: date | datetime | None = None,
    note: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> ErpDocumentRecord:
    record = (
        db.query(ErpDocumentRecord)
        .filter(
            ErpDocumentRecord.origin_model == origin_model,
            ErpDocumentRecord.origin_id == origin_id,
            ErpDocumentRecord.origin_key == origin_key,
        )
        .first()
    )
    if record is None:
        record = ErpDocumentRecord(origin_model=origin_model, origin_id=origin_id, origin_key=origin_key)
        db.add(record)
    record.document_role = document_role
    record.title = title
    record.document_type = document_type
    record.status_code = status_code
    record.lifecycle_stage = lifecycle_stage or _document_lifecycle(status_code)
    record.template_id = template_id
    record.attachment_id = attachment_id
    record.due_date = due_date
    record.requested_at = _as_datetime(requested_at)
    record.received_at = _as_datetime(received_at)
    record.verified_at = _as_datetime(verified_at)
    record.note = note
    record.metadata_json = _dumps(metadata or {})
    db.flush()
    return record


def _replace_document_links(
    db: Session,
    *,
    record: ErpDocumentRecord,
    links: list[tuple[ErpSubject, str]],
) -> None:
    desired = {(subject.id, link_type) for subject, link_type in links if subject is not None}
    existing = db.query(ErpDocumentLink).filter(ErpDocumentLink.document_record_id == record.id).all()
    for row in existing:
        if (row.subject_id, row.link_type) not in desired:
            db.delete(row)
    existing_keys = {(row.subject_id, row.link_type) for row in existing}
    for subject, link_type in links:
        if subject is None:
            continue
        key = (subject.id, link_type)
        if key in existing_keys:
            continue
        db.add(ErpDocumentLink(document_record_id=record.id, subject_id=subject.id, link_type=link_type))
    db.flush()


def archive_document_record(
    db: Session,
    *,
    origin_model: str,
    origin_id: int,
    origin_key: str = "",
) -> ErpDocumentRecord | None:
    record = (
        db.query(ErpDocumentRecord)
        .filter(
            ErpDocumentRecord.origin_model == origin_model,
            ErpDocumentRecord.origin_id == origin_id,
            ErpDocumentRecord.origin_key == origin_key,
        )
        .first()
    )
    if record is None:
        return None
    record.status_code = "deleted"
    record.lifecycle_stage = "archived"
    db.flush()
    return record


def sync_investment_document_registry(db: Session, document: InvestmentDocument) -> ErpDocumentRecord:
    investment = db.get(Investment, document.investment_id)
    if investment is None:
        raise ValueError(f"Investment {document.investment_id} not found for document {document.id}")
    investment_subject = sync_investment_graph(db, investment)
    links: list[tuple[ErpSubject, str]] = [(investment_subject, "primary")]
    company = db.get(PortfolioCompany, investment.company_id) if investment.company_id else None
    if company is not None:
        links.append((sync_company_graph(db, company), "company_context"))
    fund = db.get(Fund, investment.fund_id) if investment.fund_id else None
    if fund is not None:
        links.append((sync_fund_graph(db, fund), "fund_context"))

    record = _ensure_document_record(
        db,
        origin_model="investment_document",
        origin_id=document.id,
        title=document.name,
        document_role="requirement",
        document_type=document.doc_type,
        status_code=document.status or "pending",
        due_date=document.due_date,
        note=document.note,
        received_at=_now() if _document_lifecycle(document.status) == "done" else None,
        metadata={"investment_id": investment.id, "company_id": investment.company_id, "fund_id": investment.fund_id},
    )
    _replace_document_links(db, record=record, links=links)
    return record


def sync_workflow_step_document_registry(db: Session, document: WorkflowStepInstanceDocument) -> ErpDocumentRecord:
    step_instance = db.get(WorkflowStepInstance, document.step_instance_id)
    if step_instance is None:
        raise ValueError(f"Workflow step instance {document.step_instance_id} not found")
    step_subject = sync_workflow_step_graph(db, step_instance)
    links: list[tuple[ErpSubject, str]] = [(step_subject, "primary")]
    instance = db.get(WorkflowInstance, step_instance.instance_id)
    if instance is not None:
        links.append((sync_workflow_instance_graph(db, instance), "workflow_context"))
    if step_instance.task_id:
        task = db.get(Task, step_instance.task_id)
        if task is not None:
            links.append((sync_task_graph(db, task), "task_context"))

    attachment_ids = document.attachment_ids
    attachment_id = attachment_ids[-1] if attachment_ids else None
    status_code = "collected" if document.checked else "pending"
    record = _ensure_document_record(
        db,
        origin_model="workflow_step_instance_document",
        origin_id=document.id,
        title=document.name,
        document_role="requirement",
        document_type=document.timing,
        status_code=status_code,
        template_id=document.document_template_id,
        attachment_id=attachment_id,
        note=document.notes,
        received_at=_now() if document.checked else None,
        metadata={
            "required": bool(document.required),
            "workflow_step_document_id": document.workflow_step_document_id,
            "attachment_ids": attachment_ids,
        },
    )
    _replace_document_links(db, record=record, links=links)
    return record


def sync_compliance_document_registry(db: Session, document: ComplianceDocument) -> ErpDocumentRecord:
    links: list[tuple[ErpSubject, str]] = []
    if document.fund_id:
        fund = db.get(Fund, document.fund_id)
        if fund is not None:
            links.append((sync_fund_graph(db, fund), "fund_context"))
    status_code = "active" if document.is_active else "archived"
    record = _ensure_document_record(
        db,
        origin_model="compliance_document",
        origin_id=document.id,
        title=document.title,
        document_role="reference",
        document_type=document.document_type,
        status_code=status_code,
        lifecycle_stage="active" if document.is_active else "archived",
        note=document.content_summary,
        metadata={
            "scope": document.scope,
            "fund_type_filter": document.fund_type_filter,
            "version": document.version,
            "file_path": document.file_path,
        },
    )
    _replace_document_links(db, record=record, links=links)
    return record


def sync_biz_report_request_document_registry(db: Session, row: BizReportRequest) -> list[ErpDocumentRecord]:
    report = db.get(BizReport, row.biz_report_id)
    investment = db.get(Investment, row.investment_id)
    if report is None or investment is None:
        raise ValueError(f"Biz report request {row.id} is missing report or investment context")

    investment_subject = sync_investment_graph(db, investment)
    links: list[tuple[ErpSubject, str]] = [(investment_subject, "primary")]
    company = db.get(PortfolioCompany, investment.company_id) if investment.company_id else None
    if company is not None:
        links.append((sync_company_graph(db, company), "company_context"))
    fund = db.get(Fund, report.fund_id)
    if fund is not None:
        links.append((sync_fund_graph(db, fund), "fund_context"))

    records: list[ErpDocumentRecord] = []
    company_name = company.name if company is not None else f"investment:{investment.id}"
    for origin_key, column_name in _BIZ_REPORT_DOC_COLUMNS.items():
        status_code = getattr(row, column_name, None) or "not_requested"
        received_at = _as_datetime(row.all_docs_received_date) if status_code in _BIZ_REPORT_RECEIVED_STATUSES else None
        verified_at = _as_datetime(row.all_docs_received_date) if status_code == "verified" else None
        record = _ensure_document_record(
            db,
            origin_model="biz_report_request",
            origin_id=row.id,
            origin_key=origin_key,
            title=f"{company_name} - {_BIZ_REPORT_DOC_LABELS[origin_key]}",
            document_role="requirement",
            document_type=origin_key,
            status_code=status_code,
            due_date=row.request_deadline or row.deadline,
            requested_at=row.request_sent_date if status_code != "not_requested" else None,
            received_at=received_at,
            verified_at=verified_at,
            note=row.comment,
            metadata={
                "biz_report_id": row.biz_report_id,
                "fund_id": report.fund_id,
                "investment_id": row.investment_id,
                "risk_flag": row.risk_flag,
            },
        )
        _replace_document_links(db, record=record, links=links)
        records.append(record)
    return records


def serialize_subject(subject: ErpSubject) -> ErpSubjectResponse:
    return ErpSubjectResponse(
        id=subject.id,
        subject_type=subject.subject_type,
        native_id=subject.native_id,
        display_name=subject.display_name,
        state_code=subject.state_code,
        lifecycle_stage=subject.lifecycle_stage,
        fund_id=subject.fund_id,
        gp_entity_id=subject.gp_entity_id,
        company_id=subject.company_id,
        investment_id=subject.investment_id,
        lp_id=subject.lp_id,
        task_id=subject.task_id,
        workflow_instance_id=subject.workflow_instance_id,
        obligation_id=subject.obligation_id,
        metadata=_loads(subject.metadata_json, {}),
        created_at=subject.created_at,
        updated_at=subject.updated_at,
    )


def serialize_relation(relation: ErpRelation) -> ErpRelationResponse:
    return ErpRelationResponse(
        id=relation.id,
        parent_subject_id=relation.parent_subject_id,
        child_subject_id=relation.child_subject_id,
        relation_type=relation.relation_type,
        metadata=_loads(relation.metadata_json, {}),
        created_at=relation.created_at,
        updated_at=relation.updated_at,
    )


def serialize_event(event: ErpEvent) -> ErpEventResponse:
    return ErpEventResponse(
        id=event.id,
        subject_id=event.subject_id,
        event_type=event.event_type,
        actor_user_id=event.actor_user_id,
        correlation_key=event.correlation_key,
        origin_model=event.origin_model,
        origin_id=event.origin_id,
        fund_id=event.fund_id,
        investment_id=event.investment_id,
        occurred_at=event.occurred_at,
        before=_loads(event.before_json, None),
        after=_loads(event.after_json, None),
        payload=_loads(event.payload_json, None),
    )


def serialize_document_record(db: Session, record: ErpDocumentRecord) -> DocumentRecordResponse:
    links = (
        db.query(ErpDocumentLink)
        .filter(ErpDocumentLink.document_record_id == record.id)
        .order_by(ErpDocumentLink.id.asc())
        .all()
    )
    return DocumentRecordResponse(
        id=record.id,
        document_role=record.document_role,
        origin_model=record.origin_model,
        origin_id=record.origin_id,
        origin_key=record.origin_key,
        title=record.title,
        document_type=record.document_type,
        status_code=record.status_code,
        lifecycle_stage=record.lifecycle_stage,
        template_id=record.template_id,
        attachment_id=record.attachment_id,
        due_date=record.due_date,
        requested_at=record.requested_at,
        received_at=record.received_at,
        verified_at=record.verified_at,
        note=record.note,
        metadata=_loads(record.metadata_json, {}),
        linked_subject_ids=[row.subject_id for row in links],
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def build_entity_context(db: Session, *, subject_type: str, native_id: int) -> ErpEntityContextResponse:
    subject = get_subject(db, subject_type, native_id)
    if subject is None:
        raise LookupError(f"ERP subject not found for {subject_type}:{native_id}")

    relations = (
        db.query(ErpRelation)
        .filter((ErpRelation.parent_subject_id == subject.id) | (ErpRelation.child_subject_id == subject.id))
        .order_by(ErpRelation.id.asc())
        .all()
    )
    related_ids = {
        row.child_subject_id if row.parent_subject_id == subject.id else row.parent_subject_id
        for row in relations
    }
    related_subjects = (
        db.query(ErpSubject)
        .filter(ErpSubject.id.in_(related_ids))
        .order_by(ErpSubject.subject_type.asc(), ErpSubject.native_id.asc())
        .all()
        if related_ids
        else []
    )
    document_subject_ids = {subject.id, *related_ids}
    documents = (
        db.query(ErpDocumentRecord)
        .join(ErpDocumentLink, ErpDocumentLink.document_record_id == ErpDocumentRecord.id)
        .filter(ErpDocumentLink.subject_id.in_(document_subject_ids))
        .filter(ErpDocumentRecord.lifecycle_stage != "archived")
        .distinct()
        .order_by(ErpDocumentRecord.updated_at.desc(), ErpDocumentRecord.id.desc())
        .limit(100)
        .all()
        if document_subject_ids
        else []
    )
    events = (
        db.query(ErpEvent)
        .filter(ErpEvent.subject_id == subject.id)
        .order_by(ErpEvent.occurred_at.desc(), ErpEvent.id.desc())
        .limit(100)
        .all()
    )
    return ErpEntityContextResponse(
        subject=serialize_subject(subject),
        related_subjects=[serialize_subject(row) for row in related_subjects],
        relations=[serialize_relation(row) for row in relations],
        documents=[serialize_document_record(db, row) for row in documents],
        events=[serialize_event(row) for row in events],
    )


def build_timeline(db: Session, *, subject_type: str, native_id: int) -> ErpTimelineResponse:
    subject = get_subject(db, subject_type, native_id)
    if subject is None:
        raise LookupError(f"ERP subject not found for {subject_type}:{native_id}")
    events = (
        db.query(ErpEvent)
        .filter(ErpEvent.subject_id == subject.id)
        .order_by(ErpEvent.occurred_at.desc(), ErpEvent.id.desc())
        .limit(200)
        .all()
    )
    return ErpTimelineResponse(
        subject=serialize_subject(subject),
        events=[serialize_event(row) for row in events],
    )


def list_document_registry(
    db: Session,
    *,
    subject_type: str | None = None,
    native_id: int | None = None,
    fund_id: int | None = None,
    gp_entity_id: int | None = None,
    company_id: int | None = None,
    investment_id: int | None = None,
    status_code: str | None = None,
    lifecycle_stage: str | None = None,
    document_role: str | None = None,
    origin_model: str | None = None,
) -> list[DocumentRecordResponse]:
    query = db.query(ErpDocumentRecord)
    if status_code:
        query = query.filter(ErpDocumentRecord.status_code == status_code)
    if lifecycle_stage:
        query = query.filter(ErpDocumentRecord.lifecycle_stage == lifecycle_stage)
    else:
        query = query.filter(ErpDocumentRecord.lifecycle_stage != "archived")
    if document_role:
        query = query.filter(ErpDocumentRecord.document_role == document_role)
    if origin_model:
        query = query.filter(ErpDocumentRecord.origin_model == origin_model)

    subject_ids: list[int] = []
    if subject_type and native_id is not None:
        subject = get_subject(db, subject_type, native_id)
        if subject is None:
            return []
        subject_ids = [subject.id]
    elif any(value is not None for value in (fund_id, gp_entity_id, company_id, investment_id)):
        subject_query = db.query(ErpSubject.id)
        if fund_id is not None:
            subject_query = subject_query.filter(ErpSubject.fund_id == fund_id)
        if gp_entity_id is not None:
            subject_query = subject_query.filter(ErpSubject.gp_entity_id == gp_entity_id)
        if company_id is not None:
            subject_query = subject_query.filter(ErpSubject.company_id == company_id)
        if investment_id is not None:
            subject_query = subject_query.filter(ErpSubject.investment_id == investment_id)
        subject_ids = [row[0] for row in subject_query.distinct().all()]

    if subject_ids:
        query = (
            query.join(ErpDocumentLink, ErpDocumentLink.document_record_id == ErpDocumentRecord.id)
            .filter(ErpDocumentLink.subject_id.in_(subject_ids))
            .distinct()
        )

    rows = query.order_by(ErpDocumentRecord.updated_at.desc(), ErpDocumentRecord.id.desc()).all()
    return [serialize_document_record(db, row) for row in rows]


def sync_backbone_seed_event(db: Session, *, subject: ErpSubject, payload: dict[str, Any] | None = None) -> ErpEvent | None:
    existing = (
        db.query(ErpEvent)
        .filter(ErpEvent.subject_id == subject.id, ErpEvent.event_type == "seed.backfill")
        .first()
    )
    if existing is not None:
        return existing
    return emit_event(
        db,
        subject=subject,
        event_type="seed.backfill",
        payload=payload or {"subject_type": subject.subject_type, "native_id": subject.native_id},
        origin_model="erp_backbone",
        origin_id=subject.id,
    )


def backfill_backbone(db: Session, *, emit_seed_events: bool = True) -> dict[str, int]:
    subject_count_before = db.query(ErpSubject).count()
    relation_count_before = db.query(ErpRelation).count()
    event_count_before = db.query(ErpEvent).count()
    document_count_before = db.query(ErpDocumentRecord).count()

    for row in db.query(GPEntity).order_by(GPEntity.id.asc()).all():
        subject = sync_gp_entity_graph(db, row)
        if emit_seed_events:
            sync_backbone_seed_event(db, subject=subject)
    for row in db.query(Fund).order_by(Fund.id.asc()).all():
        subject = sync_fund_graph(db, row)
        if emit_seed_events:
            sync_backbone_seed_event(db, subject=subject)
    for row in db.query(LP).order_by(LP.id.asc()).all():
        subject = sync_lp_graph(db, row)
        if emit_seed_events:
            sync_backbone_seed_event(db, subject=subject)
    for row in db.query(PortfolioCompany).order_by(PortfolioCompany.id.asc()).all():
        subject = sync_company_graph(db, row)
        if emit_seed_events:
            sync_backbone_seed_event(db, subject=subject)
    for row in db.query(Investment).order_by(Investment.id.asc()).all():
        subject = sync_investment_graph(db, row)
        if emit_seed_events:
            sync_backbone_seed_event(db, subject=subject)
    for row in db.query(InvestmentReview).order_by(InvestmentReview.id.asc()).all():
        subject = sync_investment_review_graph(db, row)
        if emit_seed_events:
            sync_backbone_seed_event(db, subject=subject)
    for row in db.query(Task).order_by(Task.id.asc()).all():
        subject = sync_task_graph(db, row)
        if emit_seed_events:
            sync_backbone_seed_event(db, subject=subject)
    for row in db.query(WorkflowInstance).order_by(WorkflowInstance.id.asc()).all():
        subject = sync_workflow_instance_graph(db, row)
        if emit_seed_events:
            sync_backbone_seed_event(db, subject=subject)
    for row in db.query(WorkflowStepInstance).order_by(WorkflowStepInstance.id.asc()).all():
        subject = sync_workflow_step_graph(db, row)
        if emit_seed_events:
            sync_backbone_seed_event(db, subject=subject)
    for row in db.query(ComplianceObligation).order_by(ComplianceObligation.id.asc()).all():
        subject = sync_compliance_obligation_graph(db, row)
        if emit_seed_events:
            sync_backbone_seed_event(db, subject=subject)

    for row in db.query(InvestmentDocument).order_by(InvestmentDocument.id.asc()).all():
        sync_investment_document_registry(db, row)
    for row in db.query(WorkflowStepInstanceDocument).order_by(WorkflowStepInstanceDocument.id.asc()).all():
        sync_workflow_step_document_registry(db, row)
    for row in db.query(ComplianceDocument).order_by(ComplianceDocument.id.asc()).all():
        sync_compliance_document_registry(db, row)
    for row in db.query(BizReportRequest).order_by(BizReportRequest.id.asc()).all():
        sync_biz_report_request_document_registry(db, row)

    return {
        "subjects_created": db.query(ErpSubject).count() - subject_count_before,
        "relations_created": db.query(ErpRelation).count() - relation_count_before,
        "events_created": db.query(ErpEvent).count() - event_count_before,
        "documents_created": db.query(ErpDocumentRecord).count() - document_count_before,
    }


def maybe_emit_mutation(
    db: Session,
    *,
    subject: ErpSubject,
    event_type: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
    actor_user_id: int | None = None,
    correlation_key: str | None = None,
    origin_model: str | None = None,
    origin_id: int | None = None,
) -> ErpEvent | None:
    if not backbone_enabled():
        return None
    if event_type.endswith(".updated") and before is not None and after is not None and before == after:
        return None
    return emit_event(
        db,
        subject=subject,
        event_type=event_type,
        actor_user_id=actor_user_id,
        correlation_key=correlation_key,
        before=before,
        after=after,
        payload=payload,
        origin_model=origin_model,
        origin_id=origin_id,
    )
