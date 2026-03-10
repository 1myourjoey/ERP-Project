from pathlib import Path
from urllib.parse import unquote
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request

import json

import re
from datetime import date, datetime, time

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from database import get_db
from dependencies.auth import get_current_user
from models.fund import Fund, LP, LPTransfer
from models.gp_entity import GPEntity
from models.investment import Investment, PortfolioCompany
from models.document_template import DocumentTemplate
from models.attachment import Attachment
from models.phase3 import CapitalCall, CapitalCallItem
from models.workflow import (
    Workflow,
    WorkflowStep,
    WorkflowStepDocument,
    WorkflowDocument,
    WorkflowWarning,
)
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance
from models.workflow_instance import WorkflowStepInstanceDocument
from models.task import Task
from models.task_category import TaskCategory
from models.user import User
from models.worklog import WorkLog
from schemas.workflow import (
    WorkflowResponse,
    WorkflowListItem,
    WorkflowCreateRequest,
    WorkflowDocumentInput,
    WorkflowDocumentResponse,
    WorkflowStepDocumentInput,
    WorkflowStepDocumentResponse,
    WorkflowUpdateRequest,
    WorkflowInstantiateRequest,
    WorkflowInstanceUpdateRequest,
    WorkflowInstanceResponse,
    WorkflowStepInstanceResponse,
    WorkflowStepInstanceDocumentInput,
    WorkflowStepInstanceDocumentUpdate,
    WorkflowStepInstanceDocumentResponse,
    WorkflowStepInstanceDocumentCheckRequest,
    WorkflowStepCompleteRequest,
    WorkflowInstanceSwapTemplateRequest,
    WorkflowStepLPPaidInInput,
)
from services.workflow_service import (
    calculate_step_date,
    instantiate_workflow,
    reconcile_workflow_instance_state,
)
from services.phase32_defaults import ensure_phase32_defaults
from services.lp_transfer_service import apply_transfer_by_workflow_instance_id
from services.auto_journal import create_event_journal_entry
from services.fund_integrity import (
    recalculate_fund_stats,
    validate_lp_paid_in_pair,
    validate_paid_in_deltas,
)
from services.erp_backbone import (
    archive_document_record,
    backbone_enabled,
    maybe_emit_mutation,
    record_snapshot,
    sync_task_graph,
    sync_workflow_instance_graph,
    sync_workflow_step_document_registry,
    sync_workflow_step_graph,
)
from services.notification_service import create_notification

router = APIRouter(tags=["workflows"])
_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

CAPITAL_CALL_ID_PATTERNS = [
    re.compile(r"\[linked\s*capitalcall\s*:\s*#?(\d+)\]", re.IGNORECASE),
    re.compile(r"\[capitalcall\s*:\s*#?(\d+)\]", re.IGNORECASE),
    re.compile(r"capital_call_id\s*[:=]\s*(\d+)", re.IGNORECASE),
]
FORMATION_SLOT_MEMO_PATTERN = re.compile(r"formation_slot\s*=\s*([^\s]+)", re.IGNORECASE)
TEMPLATE_ID_MEMO_PATTERN = re.compile(r"template_id\s*=\s*(\d+)", re.IGNORECASE)
FORMATION_LP_PAID_IN_SNAPSHOT_PREFIX = "[system:formation_lp_paid_in_snapshot]"
PAID_IN_EXCEEDS_COMMITMENT_DETAIL = "paid_in total cannot exceed commitment total"

def _normalize_keyword(value: str | None) -> str:
    return "".join((value or "").split()).lower()

def _normalize_category_name(value: str | None) -> str:
    return (value or "").strip()

def _ensure_task_category_exists(db: Session, category_name: str | None) -> str | None:
    normalized_name = _normalize_category_name(category_name)
    if not normalized_name:
        return None

    existing = (
        db.query(TaskCategory)
        .filter(func.lower(TaskCategory.name) == normalized_name.lower())
        .first()
    )
    if existing:
        return existing.name

    db.add(TaskCategory(name=normalized_name))
    return normalized_name

def _extract_capital_call_id(memo: str | None) -> int | None:
    if not memo:
        return None
    for pattern in CAPITAL_CALL_ID_PATTERNS:
        match = pattern.search(memo)
        if not match:
            continue
        try:
            return int(match.group(1))
        except (TypeError, ValueError):
            continue
    return None

def _is_capital_call_payment_step(step_name: str | None) -> bool:
    normalized = _normalize_keyword(step_name)
    return any(
        token in normalized
        for token in (
            "납입확인",
            "입금확인",
            "납부확인",
            "수납확인",
            "paymentconfirmed",
            "paymentconfirm",
        )
    )


def _match_event_journal_key(step_name: str | None, step_memo: str | None = None) -> str | None:
    text = f"{_normalize_keyword(step_name)} {_normalize_keyword(step_memo)}"
    if not text.strip():
        return None
    if any(token in text for token in ("출자금입금", "납입확인", "입금확인", "paymentconfirm")):
        return "capital_call_paid"
    if any(token in text for token in ("배분", "distribution")):
        return "distribution_exit"
    if any(token in text for token in ("관리보수청구", "managementfee")):
        return "management_fee"
    if any(token in text for token in ("관리보수수령", "fee_received")):
        return "management_fee_received"
    if any(token in text for token in ("성과보수", "performancefee")):
        return "performance_fee"
    return None


def _resolve_event_amount(db: Session, instance: WorkflowInstance, event_key: str) -> float:
    if event_key == "capital_call_paid":
        capital_call_id = _extract_capital_call_id(instance.memo)
        if capital_call_id is None:
            return 0.0
        call = db.get(CapitalCall, capital_call_id)
        return float(call.total_amount or 0) if call else 0.0

    # For non-capital-call events, amount source depends on domain data.
    # Keep safe default to avoid creating invalid journal entries.
    return 0.0

def _is_fund_formation_workflow(workflow: Workflow | None) -> bool:
    if workflow is None:
        return False
    category = _normalize_keyword(workflow.category)
    name = _normalize_keyword(workflow.name)
    return any(
        token in category or token in name
        for token in ("조합결성", "결성", "formation")
    )

def _is_formation_paid_in_confirmation_step(step_name: str | None) -> bool:
    normalized = _normalize_keyword(step_name)
    if not normalized:
        return False
    if normalized in {
        "출자금납입확인",
        "출자금입금확인",
        "출자금납부확인",
        "출자금수납확인",
        "paymentcheck",
        "paymentconfirm",
        "paymentconfirmed",
    }:
        return True
    has_paid_token = any(
        token in normalized
        for token in ("출자", "납입", "입금", "납부", "payment")
    )
    has_confirm_token = any(
        token in normalized
        for token in ("확인", "confirm", "check")
    )
    return has_paid_token and has_confirm_token

def _extract_formation_slot_token(memo: str | None) -> str | None:
    if not memo:
        return None
    matched = FORMATION_SLOT_MEMO_PATTERN.search(memo)
    if not matched:
        return None
    token = _normalize_keyword(matched.group(1))
    return token or None

def _is_formation_general_assembly_instance(instance: WorkflowInstance) -> bool:
    slot_token = _extract_formation_slot_token(instance.memo)
    if slot_token == _normalize_keyword("결성총회 개최"):
        return True
    workflow_name = _normalize_keyword(instance.workflow.name if instance.workflow else None)
    instance_name = _normalize_keyword(instance.name)
    return "결성총회" in workflow_name or "결성총회" in instance_name

def _template_supports_formation_paid_in_trigger(template: Workflow) -> bool:
    for step in template.steps or []:
        if _is_formation_paid_in_confirmation_step(step.name):
            return True
    return False

def _upsert_template_id_in_memo(memo: str | None, template_id: int) -> str:
    base = (memo or "").strip()
    token = f"template_id={template_id}"
    if not base:
        return token
    if TEMPLATE_ID_MEMO_PATTERN.search(base):
        return TEMPLATE_ID_MEMO_PATTERN.sub(token, base, count=1)
    return f"{base} {token}"

def _snapshot_fund_lp_paid_in(db: Session, fund_id: int) -> dict[int, int]:
    rows = (
        db.query(LP)
        .filter(LP.fund_id == fund_id)
        .order_by(LP.id.asc())
        .all()
    )
    return {int(row.id): int(row.paid_in or 0) for row in rows}

def _append_formation_snapshot_to_notes(
    notes: str | None,
    snapshot: dict[int, int],
) -> str:
    rows = [
        {"lp_id": lp_id, "paid_in": paid_in}
        for lp_id, paid_in in sorted(snapshot.items())
    ]
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    marker = f"{FORMATION_LP_PAID_IN_SNAPSHOT_PREFIX}{payload}"
    user_notes = (notes or "").strip()
    if user_notes:
        return f"{user_notes}\n{marker}"
    return marker

def _extract_formation_snapshot_from_notes(notes: str | None) -> dict[int, int] | None:
    if not notes:
        return None
    marker_index = notes.rfind(FORMATION_LP_PAID_IN_SNAPSHOT_PREFIX)
    if marker_index < 0:
        return None
    payload = notes[marker_index + len(FORMATION_LP_PAID_IN_SNAPSHOT_PREFIX):].strip()
    if not payload:
        return None
    try:
        decoded = json.loads(payload)
    except json.JSONDecodeError:
        return None
    if not isinstance(decoded, list):
        return None
    snapshot: dict[int, int] = {}
    for row in decoded:
        if not isinstance(row, dict):
            continue
        try:
            lp_id = int(row.get("lp_id"))
            paid_in = int(round(float(row.get("paid_in") or 0)))
        except (TypeError, ValueError):
            continue
        if lp_id <= 0 or paid_in < 0:
            continue
        snapshot[lp_id] = paid_in
    return snapshot or None

def _apply_formation_lp_paid_in_updates(
    db: Session,
    *,
    fund_id: int,
    updates: list[WorkflowStepLPPaidInInput],
) -> None:
    if not updates:
        return
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")

    update_map: dict[int, int] = {}
    for row in updates:
        lp_id = int(row.lp_id)
        paid_in = int(round(float(row.paid_in)))
        if paid_in < 0:
            raise HTTPException(status_code=400, detail="paid_in must be >= 0")
        update_map[lp_id] = paid_in
    if not update_map:
        return

    lps = (
        db.query(LP)
        .filter(LP.fund_id == fund_id)
        .order_by(LP.id.asc())
        .all()
    )
    lp_by_id = {int(lp.id): lp for lp in lps}
    missing_ids = sorted(lp_id for lp_id in update_map if lp_id not in lp_by_id)
    if missing_ids:
        missing_text = ", ".join(str(lp_id) for lp_id in missing_ids)
        raise HTTPException(status_code=404, detail=f"LP not found: {missing_text}")

    projected_total = 0
    for lp in lps:
        projected_paid_in = int(update_map.get(int(lp.id), int(lp.paid_in or 0)))
        validate_lp_paid_in_pair(
            commitment=lp.commitment,
            paid_in=projected_paid_in,
        )
        projected_total += projected_paid_in

    if fund.commitment_total is not None and projected_total > int(fund.commitment_total):
        raise HTTPException(status_code=400, detail=PAID_IN_EXCEEDS_COMMITMENT_DETAIL)

    for lp_id, paid_in in update_map.items():
        lp_by_id[lp_id].paid_in = paid_in
    db.flush()

def _restore_formation_lp_paid_in_snapshot(
    db: Session,
    *,
    fund_id: int,
    snapshot: dict[int, int] | None,
) -> None:
    if not snapshot:
        return

    lps = (
        db.query(LP)
        .filter(LP.fund_id == fund_id)
        .order_by(LP.id.asc())
        .all()
    )
    if not lps:
        return

    lp_by_id = {int(lp.id): lp for lp in lps}
    restore_map = {
        lp_id: paid_in
        for lp_id, paid_in in snapshot.items()
        if lp_id in lp_by_id
    }
    if not restore_map:
        return

    fund = db.get(Fund, fund_id)
    projected_total = 0
    for lp in lps:
        projected_paid_in = int(restore_map.get(int(lp.id), int(lp.paid_in or 0)))
        validate_lp_paid_in_pair(
            commitment=lp.commitment,
            paid_in=projected_paid_in,
        )
        projected_total += projected_paid_in

    if fund and fund.commitment_total is not None and projected_total > int(fund.commitment_total):
        raise HTTPException(status_code=400, detail=PAID_IN_EXCEEDS_COMMITMENT_DETAIL)

    for lp_id, paid_in in restore_map.items():
        lp_by_id[lp_id].paid_in = paid_in
    db.flush()

def _is_completed_status(status: str | None) -> bool:
    return (status or "").strip().lower() == "completed"

def _ordered_step_instances(instance: WorkflowInstance) -> list[WorkflowStepInstance]:
    return sorted(
        instance.step_instances,
        key=lambda row: (
            row.step.order if row.step and row.step.order is not None else 10**9,
            row.id or 0,
        ),
    )

def _sync_next_active_step(instance: WorkflowInstance, db: Session) -> None:
    next_open_found = False
    for step_instance in _ordered_step_instances(instance):
        if step_instance.status in ("completed", "skipped"):
            continue

        if not next_open_found:
            next_open_found = True
            if step_instance.status != "in_progress":
                step_instance.status = "in_progress"
            if step_instance.task_id:
                task = db.get(Task, step_instance.task_id)
                if task and task.status == "pending":
                    task.status = "in_progress"
            continue

        if step_instance.status != "pending":
            step_instance.status = "pending"
        if step_instance.task_id:
            task = db.get(Task, step_instance.task_id)
            if task and task.status == "in_progress":
                task.status = "pending"

def _resolve_step_document_payload(
    db: Session,
    data: WorkflowStepDocumentInput,
) -> tuple[int | None, str]:
    template_id = data.document_template_id
    template = None
    if template_id is not None:
        template = db.get(DocumentTemplate, template_id)
        if not template:
            raise HTTPException(status_code=404, detail="문서 템플릿을 찾을 수 없습니다")

    name = (data.name or "").strip()
    if not name and template:
        name = template.name
    if not name:
        raise HTTPException(status_code=400, detail="단계 서류명은 필수입니다")
    return template_id, name

def _append_step_documents(
    db: Session,
    step: WorkflowStep,
    documents: list[WorkflowStepDocumentInput] | None,
) -> None:
    for doc in documents or []:
        template_id, name = _resolve_step_document_payload(db, doc)
        step.step_documents.append(
            WorkflowStepDocument(
                document_template_id=template_id,
                name=name,
                required=bool(doc.required),
                timing=doc.timing,
                notes=doc.notes,
                attachment_ids=doc.attachment_ids,
            )
        )

def _clone_step_documents_to_instance_step(
    step_instance: WorkflowStepInstance,
    workflow_step: WorkflowStep | None,
) -> None:
    if workflow_step is None:
        return
    for doc in workflow_step.step_documents or []:
        step_instance.step_documents.append(
            WorkflowStepInstanceDocument(
                workflow_step_document_id=doc.id,
                document_template_id=doc.document_template_id,
                name=doc.name,
                required=bool(doc.required),
                timing=doc.timing,
                notes=doc.notes,
                checked=False,
                attachment_ids=list(doc.attachment_ids or []),
            )
        )

def _resolve_step_instance_for_document_mutation(
    db: Session,
    *,
    instance_id: int,
    step_instance_id: int,
    require_active: bool = True,
) -> WorkflowStepInstance:
    step_instance = db.get(WorkflowStepInstance, step_instance_id)
    if not step_instance or step_instance.instance_id != instance_id:
        raise HTTPException(status_code=404, detail="단계 인스턴스를 찾을 수 없습니다")
    instance = db.get(WorkflowInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")
    if require_active and instance.status != "active":
        raise HTTPException(status_code=400, detail="진행 중 인스턴스만 서류를 수정할 수 있습니다")
    return step_instance

def _resolve_step_instance_document(
    db: Session,
    *,
    step_instance_id: int,
    document_id: int,
) -> WorkflowStepInstanceDocument:
    document = (
        db.query(WorkflowStepInstanceDocument)
        .filter(
            WorkflowStepInstanceDocument.id == document_id,
            WorkflowStepInstanceDocument.step_instance_id == step_instance_id,
        )
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="단계 서류를 찾을 수 없습니다")
    return document


def _resolve_step_instance_document_by_id(
    db: Session,
    *,
    document_id: int,
    require_active: bool = True,
) -> WorkflowStepInstanceDocument:
    document = db.get(WorkflowStepInstanceDocument, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="단계 서류를 찾을 수 없습니다")
    step_instance = db.get(WorkflowStepInstance, document.step_instance_id)
    if not step_instance:
        raise HTTPException(status_code=404, detail="단계 인스턴스를 찾을 수 없습니다")
    if require_active:
        instance = db.get(WorkflowInstance, step_instance.instance_id)
        if not instance:
            raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")
        if instance.status != "active":
            raise HTTPException(status_code=400, detail="진행 중 인스턴스만 서류를 수정할 수 있습니다")
    return document

def _create_worklog_for_completed_step(
    *,
    db: Session,
    instance: WorkflowInstance,
    step_instance: WorkflowStepInstance,
    workflow: Workflow | None,
    workflow_step: WorkflowStep | None,
    task: Task | None,
    actual_time: str | None,
) -> None:
    workflow_name = (workflow.name if workflow else instance.name) or instance.name
    step_name = (
        workflow_step.name
        if workflow_step and workflow_step.name
        else (step_instance.step.name if step_instance.step else "단계")
    )
    estimated_time = (
        workflow_step.estimated_time
        if workflow_step and workflow_step.estimated_time
        else (step_instance.step.estimated_time if step_instance.step else None)
    )
    resolved_actual_time = actual_time or estimated_time
    category = (
        (task.category if task and task.category else None)
        or (workflow.category if workflow and workflow.category else None)
        or "업무"
    )
    _ensure_task_category_exists(db, category)

    db.add(
        WorkLog(
            date=date.today(),
            category=category,
            title=f"[{workflow_name}] - [{step_name}]",
            content=(task.memo if task else None),
            status="completed",
            estimated_time=estimated_time,
            actual_time=resolved_actual_time,
            task_id=task.id if task else None,
        )
    )

def _mark_capital_call_items_paid(db: Session, capital_call_id: int) -> None:
    call = db.get(CapitalCall, capital_call_id)
    if not call:
        return
    unpaid_items = (
        db.query(CapitalCallItem)
        .filter(
            CapitalCallItem.capital_call_id == capital_call_id,
            CapitalCallItem.paid == 0,
        )
        .all()
    )
    if not unpaid_items:
        return

    lp_paid_deltas: dict[int, int] = {}
    for item in unpaid_items:
        lp_paid_deltas[item.lp_id] = int(lp_paid_deltas.get(item.lp_id, 0)) + int(item.amount or 0)
    validate_paid_in_deltas(db, call.fund_id, lp_paid_deltas)

    paid_date = date.today()
    for item in unpaid_items:
        item.paid = 1
        item.paid_date = paid_date
    db.flush()
    recalculate_fund_stats(db, call.fund_id)

def _rollback_capital_call_items_paid(db: Session, capital_call_id: int) -> None:
    call = db.get(CapitalCall, capital_call_id)
    if not call:
        return
    paid_items = (
        db.query(CapitalCallItem)
        .filter(
            CapitalCallItem.capital_call_id == capital_call_id,
            CapitalCallItem.paid == 1,
        )
        .all()
    )
    if not paid_items:
        return
    for item in paid_items:
        item.paid = 0
        item.paid_date = None
    db.flush()
    recalculate_fund_stats(db, call.fund_id)

# --- Templates ---

@router.get("/api/workflows", response_model=list[WorkflowListItem])

def list_workflows(db: Session = Depends(get_db)):
    ensure_phase32_defaults(db, auto_commit=True)

    workflows = db.query(Workflow).order_by(Workflow.id.desc()).all()

    result = []

    for wf in workflows:

        item = WorkflowListItem(

            id=wf.id,

            name=wf.name,

            trigger_description=wf.trigger_description,

            category=wf.category,

            total_duration=wf.total_duration,

            step_count=len(wf.steps),

        )

        result.append(item)

    return result

@router.get("/api/workflows/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="워크플로우를 찾을 수 없습니다")
    return wf

@router.get("/api/workflows/{workflow_id}/documents", response_model=list[WorkflowDocumentResponse])
def list_workflow_documents(workflow_id: int, db: Session = Depends(get_db)):
    workflow = db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="워크플로우를 찾을 수 없습니다")
    return (
        db.query(WorkflowDocument)
        .filter(WorkflowDocument.workflow_id == workflow_id)
        .order_by(WorkflowDocument.id.asc())
        .all()
    )

@router.post("/api/workflows/{workflow_id}/documents", response_model=WorkflowDocumentResponse, status_code=201)
def add_workflow_document(
    workflow_id: int,
    data: WorkflowDocumentInput,
    db: Session = Depends(get_db),
):
    workflow = db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="워크플로우를 찾을 수 없습니다")

    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="서류명은 필수입니다")

    document = WorkflowDocument(
        workflow_id=workflow_id,
        name=name,
        required=bool(data.required),
        timing=data.timing,
        notes=data.notes,
    )
    db.add(document)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(document)
    return document

@router.delete("/api/workflows/{workflow_id}/documents/{document_id}")
def delete_workflow_document(
    workflow_id: int,
    document_id: int,
    db: Session = Depends(get_db),
):
    document = (
        db.query(WorkflowDocument)
        .filter(
            WorkflowDocument.id == document_id,
            WorkflowDocument.workflow_id == workflow_id,
        )
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="서류를 찾을 수 없습니다")
    db.delete(document)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"ok": True}

@router.get("/api/workflow-steps/{step_id}/documents", response_model=list[WorkflowStepDocumentResponse])
def list_step_documents(step_id: int, db: Session = Depends(get_db)):
    step = db.get(WorkflowStep, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="워크플로 단계를 찾을 수 없습니다")
    return (
        db.query(WorkflowStepDocument)
        .filter(WorkflowStepDocument.workflow_step_id == step_id)
        .order_by(WorkflowStepDocument.id.asc())
        .all()
    )

@router.post("/api/workflow-steps/{step_id}/documents", response_model=WorkflowStepDocumentResponse, status_code=201)
def add_step_document(
    step_id: int,
    data: WorkflowStepDocumentInput,
    db: Session = Depends(get_db),
):
    step = db.get(WorkflowStep, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="워크플로 단계를 찾을 수 없습니다")

    template_id, name = _resolve_step_document_payload(db, data)
    document = WorkflowStepDocument(
        workflow_step_id=step_id,
        document_template_id=template_id,
        name=name,
        required=bool(data.required),
        timing=data.timing,
        notes=data.notes,
        attachment_ids=data.attachment_ids,
    )
    db.add(document)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(document)
    return document

@router.delete("/api/workflow-steps/{step_id}/documents/{document_id}")
def delete_step_document(
    step_id: int,
    document_id: int,
    db: Session = Depends(get_db),
):
    document = (
        db.query(WorkflowStepDocument)
        .filter(
            WorkflowStepDocument.id == document_id,
            WorkflowStepDocument.workflow_step_id == step_id,
        )
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="서류를 찾을 수 없습니다")
    db.delete(document)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"ok": True}

@router.post("/api/workflows", response_model=WorkflowResponse, status_code=201)
def create_workflow(data: WorkflowCreateRequest, db: Session = Depends(get_db)):
    wf = Workflow(
        name=data.name,
        trigger_description=data.trigger_description,
        category=data.category,
        total_duration=data.total_duration,
    )

    for step in data.steps:
        wf_step = WorkflowStep(
            order=step.order,
            name=step.name,
            timing=step.timing,
            timing_offset_days=step.timing_offset_days,
            estimated_time=step.estimated_time,
            quadrant=step.quadrant,
            memo=step.memo,
            is_notice=step.is_notice,
            is_report=step.is_report,
        )
        _append_step_documents(db, wf_step, step.step_documents)
        wf.steps.append(wf_step)

    for doc in data.documents:
        wf.documents.append(
            WorkflowDocument(
                name=doc.name,
                required=doc.required,
                timing=doc.timing,
                notes=doc.notes,
            )
        )

    for warning in data.warnings:
        wf.warnings.append(
            WorkflowWarning(
                content=warning.content,
                category=warning.category or "warning",
            )
        )

    db.add(wf)
    _ensure_task_category_exists(db, data.category)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(wf)
    return wf

@router.put("/api/workflows/{workflow_id}", response_model=WorkflowResponse)

def update_workflow(workflow_id: int, data: WorkflowUpdateRequest, db: Session = Depends(get_db)):

    wf = db.get(Workflow, workflow_id)

    if not wf:

        raise HTTPException(status_code=404, detail="워크플로우를 찾을 수 없습니다")

    wf.name = data.name

    wf.trigger_description = data.trigger_description

    wf.category = data.category

    wf.total_duration = data.total_duration

    wf.steps.clear()

    for step in data.steps:
        wf_step = WorkflowStep(
            order=step.order,
            name=step.name,
            timing=step.timing,
            timing_offset_days=step.timing_offset_days,
            estimated_time=step.estimated_time,
            quadrant=step.quadrant,
            memo=step.memo,
            is_notice=step.is_notice,
            is_report=step.is_report,
        )
        _append_step_documents(db, wf_step, step.step_documents)
        wf.steps.append(wf_step)

    wf.documents.clear()

    for doc in data.documents:

        wf.documents.append(WorkflowDocument(

            name=doc.name,

            required=doc.required,

            timing=doc.timing,

            notes=doc.notes,

        ))

    wf.warnings.clear()

    for warning in data.warnings:

        wf.warnings.append(

            WorkflowWarning(

                content=warning.content,

                category=warning.category or "warning",

            )

        )

    _ensure_task_category_exists(db, data.category)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(wf)
    return wf

@router.delete("/api/workflows/{workflow_id}")

def delete_workflow(workflow_id: int, db: Session = Depends(get_db)):

    wf = db.get(Workflow, workflow_id)

    if not wf:

        raise HTTPException(status_code=404, detail="워크플로우를 찾을 수 없습니다")

    has_instances = (

        db.query(WorkflowInstance)

        .filter(WorkflowInstance.workflow_id == workflow_id)

        .count()

        > 0

    )

    if has_instances:

        raise HTTPException(status_code=409, detail="인스턴스가 있는 워크플로우 템플릿은 삭제할 수 없습니다")

    db.delete(wf)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {"ok": True}

@router.post("/api/workflows/{workflow_id}/instantiate", response_model=WorkflowInstanceResponse)
def instantiate(
    workflow_id: int,
    data: WorkflowInstantiateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wf = db.get(Workflow, workflow_id)

    if not wf:

        raise HTTPException(status_code=404, detail="워크플로우를 찾을 수 없습니다")

    investment_id = data.investment_id
    company_id = data.company_id
    fund_id = data.fund_id
    gp_entity_id = data.gp_entity_id

    if investment_id is not None:
        if gp_entity_id is not None:
            raise HTTPException(status_code=400, detail="투자 기반 워크플로우와 고유계정을 동시에 선택할 수 없습니다")
        investment = db.get(Investment, investment_id)
        if not investment:
            raise HTTPException(status_code=404, detail="투자를 찾을 수 없습니다")
        if company_id is not None and company_id != investment.company_id:

            raise HTTPException(status_code=400, detail="선택한 회사가 투자 정보와 일치하지 않습니다")

        if fund_id is not None and fund_id != investment.fund_id:

            raise HTTPException(status_code=400, detail="선택한 조합이 투자 정보와 일치하지 않습니다")

        company_id = investment.company_id
        fund_id = investment.fund_id
        gp_entity_id = None
    else:
        if gp_entity_id is not None and fund_id is not None:
            raise HTTPException(status_code=400, detail="조합과 고유계정을 동시에 선택할 수 없습니다")
        if company_id is not None and not db.get(PortfolioCompany, company_id):
            raise HTTPException(status_code=404, detail="회사를 찾을 수 없습니다")
        if fund_id is not None and not db.get(Fund, fund_id):
            raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
        if gp_entity_id is not None and not db.get(GPEntity, gp_entity_id):
            raise HTTPException(status_code=404, detail="고유계정을 찾을 수 없습니다")

    _ensure_task_category_exists(db, wf.category)
    try:
        instance = instantiate_workflow(
            db,
            wf,
            data.name,
            data.trigger_date,
            data.memo,
            investment_id=investment_id,
            company_id=company_id,
            fund_id=fund_id,
            gp_entity_id=gp_entity_id,
            created_by=current_user.id,
            auto_commit=False,
        )
        db.commit()
        db.refresh(instance)
        return _build_instance_response(instance, db)
    except Exception:
        db.rollback()
        raise

# --- Instances ---

@router.get("/api/workflow-instances", response_model=list[WorkflowInstanceResponse])

def list_instances(
    status: str = "active",
    investment_id: int | None = None,
    company_id: int | None = None,
    fund_id: int | None = None,
    gp_entity_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(WorkflowInstance).options(
        selectinload(WorkflowInstance.workflow),
        selectinload(WorkflowInstance.investment).selectinload(Investment.company),
        selectinload(WorkflowInstance.company),
        selectinload(WorkflowInstance.fund),
        selectinload(WorkflowInstance.gp_entity),
        selectinload(WorkflowInstance.step_instances).selectinload(WorkflowStepInstance.step),
        selectinload(WorkflowInstance.step_instances).selectinload(WorkflowStepInstance.step_documents),
    )
    if investment_id is not None:
        query = query.filter(WorkflowInstance.investment_id == investment_id)
    if company_id is not None:
        query = query.filter(WorkflowInstance.company_id == company_id)
    if fund_id is not None:
        query = query.filter(WorkflowInstance.fund_id == fund_id)
    if gp_entity_id is not None:
        query = query.filter(WorkflowInstance.gp_entity_id == gp_entity_id)

    instances = query.order_by(WorkflowInstance.created_at.desc()).all()

    needs_commit = False
    for instance in instances:
        if reconcile_workflow_instance_state(db, instance):
            needs_commit = True

    if needs_commit:
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise

    if status != "all":
        instances = [instance for instance in instances if instance.status == status]

    lookup_context = _build_instance_lookup_context(instances, db)
    return [_build_instance_response(i, db, lookup_context=lookup_context) for i in instances]

@router.get("/api/workflow-instances/{instance_id}", response_model=WorkflowInstanceResponse)
def get_instance(instance_id: int, db: Session = Depends(get_db)):
    instance = (
        db.query(WorkflowInstance)
        .options(
            selectinload(WorkflowInstance.workflow),
            selectinload(WorkflowInstance.investment).selectinload(Investment.company),
            selectinload(WorkflowInstance.company),
            selectinload(WorkflowInstance.fund),
            selectinload(WorkflowInstance.gp_entity),
            selectinload(WorkflowInstance.step_instances).selectinload(WorkflowStepInstance.step),
            selectinload(WorkflowInstance.step_instances).selectinload(WorkflowStepInstance.step_documents),
        )
        .filter(WorkflowInstance.id == instance_id)
        .first()
    )
    if not instance:
        raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")
    if reconcile_workflow_instance_state(db, instance):
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        db.refresh(instance)
    lookup_context = _build_instance_lookup_context([instance], db)
    return _build_instance_response(instance, db, lookup_context=lookup_context)

@router.put("/api/workflow-instances/{instance_id}", response_model=WorkflowInstanceResponse)
def update_instance(
    instance_id: int,
    data: WorkflowInstanceUpdateRequest,
    db: Session = Depends(get_db),
):
    instance = db.get(WorkflowInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")
    if instance.status != "active":
        raise HTTPException(status_code=400, detail="진행 중 인스턴스만 수정할 수 있습니다")

    before_instance = record_snapshot(instance)
    old_name = instance.name
    old_prefix = f"[{old_name}] "

    instance.name = data.name
    instance.trigger_date = data.trigger_date
    instance.memo = data.memo

    for step_instance in instance.step_instances:
        step = step_instance.step
        if step:
            recalculated = calculate_step_date(data.trigger_date, step.timing_offset_days)
            step_instance.calculated_date = recalculated
        else:
            recalculated = step_instance.calculated_date

        if step_instance.task_id:
            task = db.get(Task, step_instance.task_id)
            if task:
                if task.title.startswith(old_prefix):
                    task.title = f"[{data.name}] {task.title[len(old_prefix):]}"
                if task.status != "completed":
                    task.deadline = datetime.combine(recalculated, time.min)

    try:
        db.flush()
        if backbone_enabled():
            instance_subject = sync_workflow_instance_graph(db, instance)
            maybe_emit_mutation(
                db,
                subject=instance_subject,
                event_type="workflow_instance.updated",
                before=before_instance,
                after=record_snapshot(instance),
                origin_model="workflow_instance",
                origin_id=instance.id,
            )
            for step_instance in instance.step_instances:
                sync_workflow_step_graph(db, step_instance)
                if step_instance.task_id:
                    task = db.get(Task, step_instance.task_id)
                    if task is not None:
                        sync_task_graph(db, task)
                for document in step_instance.step_documents:
                    sync_workflow_step_document_registry(db, document)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(instance)

    return _build_instance_response(instance, db)

@router.put("/api/workflow-instances/{instance_id}/swap-template", response_model=WorkflowInstanceResponse)
@router.put("/api/workflows/{instance_id}/swap-template", response_model=WorkflowInstanceResponse)
def swap_instance_template(
    instance_id: int,
    data: WorkflowInstanceSwapTemplateRequest,
    db: Session = Depends(get_db),
):
    instance = db.get(WorkflowInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")
    if instance.status != "active":
        raise HTTPException(status_code=400, detail="진행 중 인스턴스만 템플릿을 교체할 수 있습니다")

    before_instance = record_snapshot(instance)
    template = db.get(Workflow, data.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")

    ordered_template_steps = sorted(
        template.steps,
        key=lambda row: (
            row.order if row.order is not None else 10**9,
            row.id or 0,
        ),
    )
    if not ordered_template_steps:
        raise HTTPException(status_code=400, detail="단계가 없는 템플릿으로는 교체할 수 없습니다")

    completed_count = sum(
        1
        for row in instance.step_instances
        if row.status in ("completed", "skipped")
    )
    if completed_count > 0:
        raise HTTPException(status_code=400, detail="이미 진행된 워크플로는 템플릿 교체를 할 수 없습니다")

    if (
        _is_formation_general_assembly_instance(instance)
        and not _template_supports_formation_paid_in_trigger(template)
    ):
        raise HTTPException(
            status_code=400,
            detail="결성총회 템플릿에는 '출자금 납입 확인' 등 납입/출자 확인 단계가 필요합니다",
        )

    _ensure_task_category_exists(db, template.category)

    handled_task_ids: set[int] = set()
    for step_instance in list(instance.step_instances):
        for document in step_instance.step_documents:
            if backbone_enabled():
                archive_document_record(
                    db,
                    origin_model="workflow_step_instance_document",
                    origin_id=document.id,
                )
        if step_instance.task_id:
            task = db.get(Task, step_instance.task_id)
            step_instance.task_id = None
            if task:
                if _is_completed_status(task.status):
                    task.workflow_instance_id = None
                    task.workflow_step_order = None
                else:
                    db.delete(task)
                handled_task_ids.add(task.id)
        db.delete(step_instance)

    linked_tasks = db.query(Task).filter(Task.workflow_instance_id == instance_id).all()
    for task in linked_tasks:
        if task.id in handled_task_ids:
            continue
        if _is_completed_status(task.status):
            task.workflow_instance_id = None
            task.workflow_step_order = None
            continue
        db.delete(task)

    instance.workflow_id = template.id
    instance.status = "active"
    instance.completed_at = None
    instance.memo = _upsert_template_id_in_memo(instance.memo, template.id)

    created_step_instances: list[WorkflowStepInstance] = []
    for idx, step in enumerate(ordered_template_steps):
        calc_date = calculate_step_date(instance.trigger_date, step.timing_offset_days)
        step_status = "in_progress" if idx == 0 else "pending"
        task = Task(
            title=f"[{instance.name}] {step.name}",
            deadline=datetime.combine(calc_date, time.min),
            estimated_time=step.estimated_time,
            quadrant=step.quadrant or "Q1",
            memo=step.memo,
            status=step_status,
            workflow_instance_id=instance.id,
            workflow_step_order=step.order,
            category=(template.category or "").strip() or None,
            fund_id=instance.fund_id,
            investment_id=instance.investment_id,
            gp_entity_id=instance.gp_entity_id,
            is_notice=step.is_notice,
            is_report=step.is_report,
        )
        db.add(task)
        db.flush()

        step_instance = WorkflowStepInstance(
            instance_id=instance.id,
            workflow_step_id=step.id,
            calculated_date=calc_date,
            status=step_status,
            task_id=task.id,
        )
        _clone_step_documents_to_instance_step(step_instance, step)
        db.add(step_instance)
        created_step_instances.append(step_instance)

    try:
        db.flush()
        if backbone_enabled():
            instance_subject = sync_workflow_instance_graph(db, instance)
            maybe_emit_mutation(
                db,
                subject=instance_subject,
                event_type="workflow_instance.updated",
                before=before_instance,
                after=record_snapshot(instance),
                payload={"template_id": template.id},
                origin_model="workflow_instance",
                origin_id=instance.id,
            )
            for step_instance in created_step_instances:
                sync_workflow_step_graph(db, step_instance)
                if step_instance.task_id:
                    task = db.get(Task, step_instance.task_id)
                    if task is not None:
                        sync_task_graph(db, task)
                for document in step_instance.step_documents:
                    sync_workflow_step_document_registry(db, document)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(instance)

    return _build_instance_response(instance, db)

@router.get(
    "/api/workflow-instances/{instance_id}/steps/{step_instance_id}/documents",
    response_model=list[WorkflowStepInstanceDocumentResponse],
)
def list_step_instance_documents(
    instance_id: int,
    step_instance_id: int,
    db: Session = Depends(get_db),
):
    step_instance = _resolve_step_instance_for_document_mutation(
        db,
        instance_id=instance_id,
        step_instance_id=step_instance_id,
        require_active=False,
    )
    return (
        db.query(WorkflowStepInstanceDocument)
        .filter(WorkflowStepInstanceDocument.step_instance_id == step_instance.id)
        .order_by(WorkflowStepInstanceDocument.id.asc())
        .all()
    )

@router.post(
    "/api/workflow-instances/{instance_id}/steps/{step_instance_id}/documents",
    response_model=WorkflowStepInstanceDocumentResponse,
    status_code=201,
)
def add_step_instance_document(
    instance_id: int,
    step_instance_id: int,
    data: WorkflowStepInstanceDocumentInput,
    db: Session = Depends(get_db),
):
    step_instance = _resolve_step_instance_for_document_mutation(
        db,
        instance_id=instance_id,
        step_instance_id=step_instance_id,
    )
    document_payload = WorkflowStepDocumentInput(
        name=data.name,
        required=data.required,
        timing=data.timing,
        notes=data.notes,
        document_template_id=data.document_template_id,
        attachment_ids=data.attachment_ids,
    )
    template_id, name = _resolve_step_document_payload(db, document_payload)

    document = WorkflowStepInstanceDocument(
        step_instance_id=step_instance.id,
        workflow_step_document_id=None,
        document_template_id=template_id,
        name=name,
        required=bool(data.required),
        timing=data.timing,
        notes=data.notes,
        checked=bool(data.checked),
        attachment_ids=data.attachment_ids,
    )
    db.add(document)
    try:
        db.flush()
        if backbone_enabled():
            sync_workflow_step_document_registry(db, document)
            subject = sync_workflow_step_graph(db, step_instance)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="workflow_step_document.created",
                after=record_snapshot(document),
                payload={"document_id": document.id},
                origin_model="workflow_step_instance_document",
                origin_id=document.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(document)
    return document

@router.put(
    "/api/workflow-instances/{instance_id}/steps/{step_instance_id}/documents/{document_id}",
    response_model=WorkflowStepInstanceDocumentResponse,
)
def update_step_instance_document(
    instance_id: int,
    step_instance_id: int,
    document_id: int,
    data: WorkflowStepInstanceDocumentUpdate,
    db: Session = Depends(get_db),
):
    step_instance = _resolve_step_instance_for_document_mutation(
        db,
        instance_id=instance_id,
        step_instance_id=step_instance_id,
    )
    document = _resolve_step_instance_document(
        db,
        step_instance_id=step_instance.id,
        document_id=document_id,
    )

    before = record_snapshot(document)
    payload = data.model_dump(exclude_unset=True)
    if "name" in payload or "document_template_id" in payload:
        document_payload = WorkflowStepDocumentInput(
            name=payload.get("name", document.name),
            required=payload.get("required", document.required),
            timing=payload.get("timing", document.timing),
            notes=payload.get("notes", document.notes),
            document_template_id=payload.get("document_template_id", document.document_template_id),
            attachment_ids=payload.get("attachment_ids", document.attachment_ids),
        )
        template_id, name = _resolve_step_document_payload(db, document_payload)
        document.document_template_id = template_id
        document.name = name

    if "required" in payload:
        document.required = bool(payload["required"])
    if "timing" in payload:
        document.timing = payload["timing"]
    if "notes" in payload:
        document.notes = payload["notes"]
    if "checked" in payload:
        document.checked = bool(payload["checked"])
    if "attachment_ids" in payload:
        document.attachment_ids = payload["attachment_ids"]

    try:
        if backbone_enabled():
            sync_workflow_step_document_registry(db, document)
            subject = sync_workflow_step_graph(db, step_instance)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="workflow_step_document.updated",
                before=before,
                after=record_snapshot(document),
                payload={"document_id": document.id},
                origin_model="workflow_step_instance_document",
                origin_id=document.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(document)
    return document

@router.delete("/api/workflow-instances/{instance_id}/steps/{step_instance_id}/documents/{document_id}")
def delete_step_instance_document(
    instance_id: int,
    step_instance_id: int,
    document_id: int,
    db: Session = Depends(get_db),
):
    step_instance = _resolve_step_instance_for_document_mutation(
        db,
        instance_id=instance_id,
        step_instance_id=step_instance_id,
    )
    document = _resolve_step_instance_document(
        db,
        step_instance_id=step_instance.id,
        document_id=document_id,
    )
    before = record_snapshot(document)
    if backbone_enabled():
        archive_document_record(db, origin_model="workflow_step_instance_document", origin_id=document.id)
        subject = sync_workflow_step_graph(db, step_instance)
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="workflow_step_document.deleted",
            before=before,
            payload={"document_id": document.id},
            origin_model="workflow_step_instance_document",
            origin_id=document.id,
        )
    db.delete(document)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"ok": True}

@router.patch(
    "/api/workflow-instances/{instance_id}/steps/{step_instance_id}/documents/{document_id}/check",
    response_model=WorkflowStepInstanceDocumentResponse,
)
def check_step_instance_document(
    instance_id: int,
    step_instance_id: int,
    document_id: int,
    data: WorkflowStepInstanceDocumentCheckRequest,
    db: Session = Depends(get_db),
):
    step_instance = _resolve_step_instance_for_document_mutation(
        db,
        instance_id=instance_id,
        step_instance_id=step_instance_id,
    )
    document = _resolve_step_instance_document(
        db,
        step_instance_id=step_instance.id,
        document_id=document_id,
    )
    before = record_snapshot(document)
    document.checked = bool(data.checked)
    try:
        if backbone_enabled():
            sync_workflow_step_document_registry(db, document)
            subject = sync_workflow_step_graph(db, step_instance)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="workflow_step_document.updated",
                before=before,
                after=record_snapshot(document),
                payload={"document_id": document.id},
                origin_model="workflow_step_instance_document",
                origin_id=document.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(document)
    return document


@router.patch(
    "/api/workflow-step-instance-documents/{document_id}/check",
    response_model=WorkflowStepInstanceDocumentResponse,
)
def check_step_instance_document_by_id(
    document_id: int,
    db: Session = Depends(get_db),
):
    document = _resolve_step_instance_document_by_id(
        db,
        document_id=document_id,
    )
    before = record_snapshot(document)
    document.checked = True
    try:
        if backbone_enabled():
            sync_workflow_step_document_registry(db, document)
            step_instance = db.get(WorkflowStepInstance, document.step_instance_id)
            if step_instance is not None:
                subject = sync_workflow_step_graph(db, step_instance)
                maybe_emit_mutation(
                    db,
                    subject=subject,
                    event_type="workflow_step_document.updated",
                    before=before,
                    after=record_snapshot(document),
                    payload={"document_id": document.id},
                    origin_model="workflow_step_instance_document",
                    origin_id=document.id,
                )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(document)
    return document


@router.patch(
    "/api/workflow-step-instance-documents/{document_id}/uncheck",
    response_model=WorkflowStepInstanceDocumentResponse,
)
def uncheck_step_instance_document_by_id(
    document_id: int,
    db: Session = Depends(get_db),
):
    document = _resolve_step_instance_document_by_id(
        db,
        document_id=document_id,
    )
    before = record_snapshot(document)
    document.checked = False
    try:
        if backbone_enabled():
            sync_workflow_step_document_registry(db, document)
            step_instance = db.get(WorkflowStepInstance, document.step_instance_id)
            if step_instance is not None:
                subject = sync_workflow_step_graph(db, step_instance)
                maybe_emit_mutation(
                    db,
                    subject=subject,
                    event_type="workflow_step_document.updated",
                    before=before,
                    after=record_snapshot(document),
                    payload={"document_id": document.id},
                    origin_model="workflow_step_instance_document",
                    origin_id=document.id,
                )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(document)
    return document


@router.post(
    "/api/workflow-step-instance-documents/{document_id}/attach",
    response_model=WorkflowStepInstanceDocumentResponse,
)
async def attach_step_instance_document_by_id(
    document_id: int,
    request: Request,
    x_file_name: str | None = Header(default=None, alias="X-File-Name"),
    attachment_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    document = _resolve_step_instance_document_by_id(
        db,
        document_id=document_id,
    )
    before = record_snapshot(document)

    uploaded_path: Path | None = None
    resolved_attachment_id: int | None = None
    if attachment_id is not None:
        attachment = db.get(Attachment, attachment_id)
        if not attachment:
            raise HTTPException(status_code=404, detail="첨부 파일을 찾을 수 없습니다")
        attachment.entity_type = "workflow_step_instance_document"
        attachment.entity_id = document.id
        resolved_attachment_id = attachment.id
    else:
        original_name = unquote((x_file_name or "").strip())
        if not original_name:
            raise HTTPException(status_code=400, detail="파일명이 비어 있습니다")
        payload = await request.body()
        if not payload:
            raise HTTPException(status_code=400, detail="빈 파일은 업로드할 수 없습니다")

        suffix = Path(original_name).suffix.lower()
        stored_name = f"{uuid4().hex}{suffix}"
        uploaded_path = _UPLOAD_DIR / stored_name
        with uploaded_path.open("wb") as stream:
            stream.write(payload)

        attachment = Attachment(
            filename=stored_name,
            original_filename=original_name,
            file_path=str(uploaded_path),
            file_size=len(payload),
            mime_type=request.headers.get("content-type"),
            entity_type="workflow_step_instance_document",
            entity_id=document.id,
        )
        db.add(attachment)
        db.flush()
        resolved_attachment_id = attachment.id

    attachment_ids = document.attachment_ids or []
    if resolved_attachment_id is not None and resolved_attachment_id not in attachment_ids:
        attachment_ids.append(resolved_attachment_id)
    document.attachment_ids = attachment_ids

    try:
        if backbone_enabled():
            sync_workflow_step_document_registry(db, document)
            step_instance = db.get(WorkflowStepInstance, document.step_instance_id)
            if step_instance is not None:
                subject = sync_workflow_step_graph(db, step_instance)
                maybe_emit_mutation(
                    db,
                    subject=subject,
                    event_type="workflow_step_document.updated",
                    before=before,
                    after=record_snapshot(document),
                    payload={"document_id": document.id},
                    origin_model="workflow_step_instance_document",
                    origin_id=document.id,
                )
        db.commit()
    except Exception:
        db.rollback()
        if uploaded_path is not None and uploaded_path.exists():
            uploaded_path.unlink(missing_ok=True)
        raise
    db.refresh(document)
    return document

@router.patch("/api/workflow-instances/{instance_id}/steps/{step_instance_id}/complete")
async def complete_step(
    instance_id: int,
    step_instance_id: int,
    data: WorkflowStepCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    si = db.get(WorkflowStepInstance, step_instance_id)
    if not si or si.instance_id != instance_id:
        raise HTTPException(status_code=404, detail="단계 인스턴스를 찾을 수 없습니다")

    instance = db.get(WorkflowInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")
    if instance.status != "active":
        raise HTTPException(status_code=400, detail="진행 중 인스턴스만 단계 완료할 수 있습니다")

    ordered_steps = _ordered_step_instances(instance)
    target_index = next((idx for idx, row in enumerate(ordered_steps) if row.id == si.id), None)
    if target_index is None:
        raise HTTPException(status_code=404, detail="단계 인스턴스를 찾을 수 없습니다")
    for prev in ordered_steps[:target_index]:
        if prev.status not in ("completed", "skipped"):
            raise HTTPException(status_code=400, detail="이전 단계를 먼저 완료해야 합니다")
    if si.status in ("completed", "skipped"):
        raise HTTPException(status_code=400, detail="이미 완료된 단계입니다")

    before_step = record_snapshot(si)
    before_instance = record_snapshot(instance)
    si.status = "completed"
    si.completed_at = datetime.now()
    si.actual_time = data.actual_time

    completed_wf_step = db.get(WorkflowStep, si.workflow_step_id)
    workflow_template = db.get(Workflow, instance.workflow_id)

    formation_snapshot: dict[int, int] | None = None
    if (
        instance.fund_id is not None
        and completed_wf_step is not None
        and _is_fund_formation_workflow(workflow_template)
        and _is_formation_paid_in_confirmation_step(completed_wf_step.name)
        and data.lp_paid_in_updates
    ):
        formation_snapshot = _snapshot_fund_lp_paid_in(db, instance.fund_id)
        _apply_formation_lp_paid_in_updates(
            db,
            fund_id=instance.fund_id,
            updates=data.lp_paid_in_updates,
        )

    if formation_snapshot:
        si.notes = _append_formation_snapshot_to_notes(data.notes, formation_snapshot)
    else:
        si.notes = data.notes

    linked_task: Task | None = None
    if si.task_id:
        linked_task = db.get(Task, si.task_id)
        if linked_task:
            linked_task.status = "completed"
            linked_task.completed_at = datetime.now()
            linked_task.actual_time = data.actual_time
            if data.notes:
                existing_memo = linked_task.memo or ""
                linked_task.memo = f"{existing_memo}\n[완료 메모] {data.notes}".strip()

    _create_worklog_for_completed_step(
        db=db,
        instance=instance,
        step_instance=si,
        workflow=workflow_template,
        workflow_step=completed_wf_step,
        task=linked_task,
        actual_time=data.actual_time,
    )

    # Session autoflush is disabled globally, so persist current-step completion
    # before querying for the next pending step.
    db.flush()
    _sync_next_active_step(instance, db)

    if completed_wf_step and _is_capital_call_payment_step(completed_wf_step.name):
        capital_call_id = _extract_capital_call_id(instance.memo)
        if capital_call_id is not None:
            _mark_capital_call_items_paid(db, capital_call_id)

    event_key = _match_event_journal_key(
        completed_wf_step.name if completed_wf_step else None,
        completed_wf_step.memo if completed_wf_step else None,
    )
    if event_key and instance.fund_id is not None:
        event_amount = _resolve_event_amount(db, instance, event_key)
        if event_amount > 0:
            create_event_journal_entry(
                db,
                event_key=event_key,
                fund_id=instance.fund_id,
                amount=event_amount,
                entry_date=date.today(),
                source_type="workflow_step_instance",
                source_id=si.id,
                description_override=f"워크플로우 단계 자동분개: {completed_wf_step.name if completed_wf_step else si.id}",
                status="미결재",
            )

    all_done = all(
        s.status in ("completed", "skipped")
        for s in instance.step_instances
    )
    if all_done:
        instance.status = "completed"
        instance.completed_at = datetime.now()
        if workflow_template and workflow_template.category == "LP교체":
            try:
                apply_transfer_by_workflow_instance_id(db, instance.id)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        if instance.fund_id:
            fund = db.get(Fund, instance.fund_id)
            if (
                fund
                and fund.status == "forming"
                and workflow_template
                and workflow_template.category == "조합결성"
            ):
                fund.status = "active"
                if not fund.formation_date:
                    fund.formation_date = datetime.now().date()

    try:
        db.flush()
        if backbone_enabled():
            step_subject = sync_workflow_step_graph(db, si)
            maybe_emit_mutation(
                db,
                subject=step_subject,
                event_type="workflow_step_instance.completed",
                before=before_step,
                after=record_snapshot(si),
                actor_user_id=current_user.id,
                origin_model="workflow_step_instance",
                origin_id=si.id,
            )
            instance_subject = sync_workflow_instance_graph(db, instance)
            maybe_emit_mutation(
                db,
                subject=instance_subject,
                event_type="workflow_instance.updated",
                before=before_instance,
                after=record_snapshot(instance),
                actor_user_id=current_user.id,
                origin_model="workflow_instance",
                origin_id=instance.id,
            )
            if linked_task is not None:
                sync_task_graph(db, linked_task)
            for document in si.step_documents:
                sync_workflow_step_document_registry(db, document)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(instance)

    try:
        await create_notification(
            db,
            user_id=current_user.id,
            category="workflow",
            severity="info",
            title=f"워크플로우 단계 완료: {completed_wf_step.name if completed_wf_step else si.id}",
            message=f"{instance.name}의 다음 단계를 진행해 주세요.",
            target_type="workflow_instance",
            target_id=instance.id,
            action_url=f"/workflows?instanceId={instance.id}",
        )
    except Exception:
        # Notification should never block primary workflow progress.
        pass

    return _build_instance_response(instance, db)

@router.put("/api/workflow-instances/{instance_id}/steps/{step_instance_id}/undo", response_model=WorkflowInstanceResponse)
def undo_step_completion(
    instance_id: int,
    step_instance_id: int,
    db: Session = Depends(get_db),
):
    instance = db.get(WorkflowInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")

    step_instance = db.get(WorkflowStepInstance, step_instance_id)
    if not step_instance or step_instance.instance_id != instance_id:
        raise HTTPException(status_code=404, detail="단계 인스턴스를 찾을 수 없습니다")
    if step_instance.status != "completed":
        raise HTTPException(status_code=400, detail="완료된 단계만 되돌릴 수 있습니다")

    before_step = record_snapshot(step_instance)
    before_instance = record_snapshot(instance)
    previous_notes = step_instance.notes
    step_instance.status = "pending"
    step_instance.completed_at = None
    step_instance.actual_time = None
    step_instance.notes = None

    if step_instance.task_id:
        task = db.get(Task, step_instance.task_id)
        if task:
            task.status = "pending"
            task.completed_at = None
            task.actual_time = None

    completed_wf_step = db.get(WorkflowStep, step_instance.workflow_step_id)
    workflow_template = db.get(Workflow, instance.workflow_id)

    if completed_wf_step and _is_capital_call_payment_step(completed_wf_step.name):
        capital_call_id = _extract_capital_call_id(instance.memo)
        if capital_call_id is not None:
            _rollback_capital_call_items_paid(db, capital_call_id)

    if (
        instance.fund_id is not None
        and completed_wf_step is not None
        and _is_fund_formation_workflow(workflow_template)
        and _is_formation_paid_in_confirmation_step(completed_wf_step.name)
    ):
        _restore_formation_lp_paid_in_snapshot(
            db,
            fund_id=instance.fund_id,
            snapshot=_extract_formation_snapshot_from_notes(previous_notes),
        )

    if instance.status == "completed":
        instance.status = "active"
        instance.completed_at = None

    _sync_next_active_step(instance, db)

    try:
        db.flush()
        if backbone_enabled():
            step_subject = sync_workflow_step_graph(db, step_instance)
            maybe_emit_mutation(
                db,
                subject=step_subject,
                event_type="workflow_step_instance.reopened",
                before=before_step,
                after=record_snapshot(step_instance),
                origin_model="workflow_step_instance",
                origin_id=step_instance.id,
            )
            instance_subject = sync_workflow_instance_graph(db, instance)
            maybe_emit_mutation(
                db,
                subject=instance_subject,
                event_type="workflow_instance.updated",
                before=before_instance,
                after=record_snapshot(instance),
                origin_model="workflow_instance",
                origin_id=instance.id,
            )
            if step_instance.task_id:
                task = db.get(Task, step_instance.task_id)
                if task is not None:
                    sync_task_graph(db, task)
            for document in step_instance.step_documents:
                sync_workflow_step_document_registry(db, document)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(instance)
    return _build_instance_response(instance, db)

@router.delete("/api/workflow-instances/{instance_id}", status_code=204)
def delete_instance(instance_id: int, db: Session = Depends(get_db)):
    instance = db.get(WorkflowInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")
    if (instance.status or "").strip().lower() != "active":
        raise HTTPException(status_code=400, detail="진행 중 인스턴스만 삭제할 수 있습니다")

    (
        db.query(CapitalCall)
        .filter(CapitalCall.linked_workflow_instance_id == instance_id)
        .update({CapitalCall.linked_workflow_instance_id: None}, synchronize_session=False)
    )
    (
        db.query(LPTransfer)
        .filter(LPTransfer.workflow_instance_id == instance_id)
        .update({LPTransfer.workflow_instance_id: None}, synchronize_session=False)
    )

    handled_task_ids: set[int] = set()
    for step_instance in instance.step_instances:
        for document in step_instance.step_documents:
            if backbone_enabled():
                archive_document_record(
                    db,
                    origin_model="workflow_step_instance_document",
                    origin_id=document.id,
                )
        if not step_instance.task_id:
            continue
        task = db.get(Task, step_instance.task_id)
        step_instance.task_id = None
        if not task:
            continue
        if _is_completed_status(task.status):
            task.workflow_instance_id = None
            task.workflow_step_order = None
        else:
            db.delete(task)
        handled_task_ids.add(task.id)

    linked_tasks = db.query(Task).filter(Task.workflow_instance_id == instance_id).all()
    for task in linked_tasks:
        if task.id in handled_task_ids:
            continue
        if _is_completed_status(task.status):
            task.workflow_instance_id = None
            task.workflow_step_order = None
            continue
        (
            db.query(WorkflowStepInstance)
            .filter(WorkflowStepInstance.task_id == task.id)
            .update({WorkflowStepInstance.task_id: None}, synchronize_session=False)
        )
        db.delete(task)

    db.delete(instance)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

@router.patch("/api/workflow-instances/{instance_id}/cancel")
def cancel_instance(instance_id: int, db: Session = Depends(get_db)):
    instance = db.get(WorkflowInstance, instance_id)

    if not instance:

        raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")

    instance.status = "cancelled"

    for si in instance.step_instances:

        if si.task_id and si.status == "pending":

            task = db.get(Task, si.task_id)

            if task and task.status == "pending":

                db.delete(task)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(instance)

    return _build_instance_response(instance, db)

def _build_instance_lookup_context(
    instances: list[WorkflowInstance],
    db: Session,
) -> dict[str, dict[int, object]]:
    investment_ids = {row.investment_id for row in instances if row.investment_id is not None}
    company_ids = {row.company_id for row in instances if row.company_id is not None}
    fund_ids = {row.fund_id for row in instances if row.fund_id is not None}
    gp_entity_ids = {row.gp_entity_id for row in instances if row.gp_entity_id is not None}

    investments: list[Investment] = []
    if investment_ids:
        investments = db.query(Investment).filter(Investment.id.in_(investment_ids)).all()
        company_ids.update(row.company_id for row in investments if row.company_id is not None)
        fund_ids.update(row.fund_id for row in investments if row.fund_id is not None)

    companies: list[PortfolioCompany] = []
    if company_ids:
        companies = db.query(PortfolioCompany).filter(PortfolioCompany.id.in_(company_ids)).all()

    funds: list[Fund] = []
    if fund_ids:
        funds = db.query(Fund).filter(Fund.id.in_(fund_ids)).all()

    gp_entities: list[GPEntity] = []
    if gp_entity_ids:
        gp_entities = db.query(GPEntity).filter(GPEntity.id.in_(gp_entity_ids)).all()

    return {
        "investments": {row.id: row for row in investments},
        "companies": {row.id: row for row in companies},
        "funds": {row.id: row for row in funds},
        "gp_entities": {row.id: row for row in gp_entities},
    }


def _build_instance_response(
    instance: WorkflowInstance,
    db: Session,
    lookup_context: dict[str, dict[int, object]] | None = None,
) -> WorkflowInstanceResponse:
    ordered_steps = sorted(
        instance.step_instances,
        key=lambda s: (
            s.step.order if s.step and s.step.order is not None else 10**9,
            s.id or 0,
        ),
    )
    total = len(ordered_steps)
    completed = sum(1 for s in ordered_steps if s.status in ("completed", "skipped"))

    step_responses = []
    for si in ordered_steps:
        documents = sorted(
            si.step_documents or [],
            key=lambda row: (row.id or 0),
        )
        step_responses.append(WorkflowStepInstanceResponse(
            id=si.id,
            instance_id=si.instance_id,
            workflow_step_id=si.workflow_step_id,
            step_name=si.step.name if si.step else "",
            step_timing=si.step.timing if si.step else "",

            calculated_date=si.calculated_date,

            status=si.status,

            completed_at=si.completed_at,

            actual_time=si.actual_time,

            notes=si.notes,

            task_id=si.task_id,

            estimated_time=si.step.estimated_time if si.step else None,

            memo=si.step.memo if si.step else None,
            step_documents=[
                WorkflowStepInstanceDocumentResponse(
                    id=document.id,
                    step_instance_id=document.step_instance_id,
                    workflow_step_document_id=document.workflow_step_document_id,
                    document_template_id=document.document_template_id,
                    name=document.name,
                    required=document.required,
                    timing=document.timing,
                    notes=document.notes,
                    checked=document.checked,
                    template_name=document.template_name,
                    template_category=document.template_category,
                    attachment_ids=document.attachment_ids,
                )
                for document in documents
            ],

        ))

    context = lookup_context or {}
    investment_by_id: dict[int, Investment] = context.get("investments", {})  # type: ignore[assignment]
    company_by_id: dict[int, PortfolioCompany] = context.get("companies", {})  # type: ignore[assignment]
    fund_by_id: dict[int, Fund] = context.get("funds", {})  # type: ignore[assignment]
    gp_entity_by_id: dict[int, GPEntity] = context.get("gp_entities", {})  # type: ignore[assignment]

    investment_name = None
    company_name = None
    fund_name = None
    gp_entity_name = None

    investment: Investment | None = None
    if instance.investment_id is not None:
        investment = investment_by_id.get(instance.investment_id) or instance.investment
        if investment is None:
            investment = db.get(Investment, instance.investment_id)

    company: PortfolioCompany | None = instance.company
    if company is None and investment and investment.company_id is not None:
        company = (
            company_by_id.get(investment.company_id)
            or getattr(investment, "company", None)
            or db.get(PortfolioCompany, investment.company_id)
        )
    if company is None and instance.company_id is not None:
        company = company_by_id.get(instance.company_id) or db.get(PortfolioCompany, instance.company_id)
    if company:
        company_name = company.name

    fund: Fund | None = instance.fund
    if fund is None and investment and investment.fund_id is not None:
        fund = fund_by_id.get(investment.fund_id) or db.get(Fund, investment.fund_id)
    if fund is None and instance.fund_id is not None:
        fund = fund_by_id.get(instance.fund_id) or db.get(Fund, instance.fund_id)
    if fund:
        fund_name = fund.name

    gp_entity: GPEntity | None = instance.gp_entity
    if gp_entity is None and instance.gp_entity_id is not None:
        gp_entity = gp_entity_by_id.get(instance.gp_entity_id) or db.get(GPEntity, instance.gp_entity_id)
    if gp_entity:
        gp_entity_name = gp_entity.name

    if investment:
        investment_name = f"{company_name} 투자건" if company_name else f"투자 #{investment.id}"

    return WorkflowInstanceResponse(
        id=instance.id,

        workflow_id=instance.workflow_id,

        workflow_name=instance.workflow.name if instance.workflow else "",

        name=instance.name,

        trigger_date=instance.trigger_date,

        status=instance.status,

        created_at=instance.created_at,

        completed_at=instance.completed_at,

        memo=instance.memo,

        investment_id=instance.investment_id,
        company_id=instance.company_id,
        fund_id=instance.fund_id,
        gp_entity_id=instance.gp_entity_id,
        investment_name=investment_name,
        company_name=company_name,
        fund_name=fund_name or gp_entity_name,
        gp_entity_name=gp_entity_name,
        step_instances=step_responses,
        progress=f"{completed}/{total}",
    )


