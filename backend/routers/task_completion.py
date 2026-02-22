from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.document_template import DocumentTemplate
from models.investment import Investment
from models.phase3 import CapitalCall
from models.task import Task
from models.workflow import WorkflowStep, WorkflowStepDocument
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

CAPITAL_CALL_KEYWORDS = ("캐피탈콜", "출자", "납입")
CAPITAL_CALL_WARNING_MESSAGE = (
    "⚠️ 연결된 캐피탈콜의 청구 금액 또는 납입 기일이 비어있습니다. 펀드 상세에서 확인해주세요."
)
BACKEND_ROOT = Path(__file__).resolve().parents[1]


class TaskCompletionCheckResponse(BaseModel):
    can_complete: bool
    missing_documents: list[str]
    warnings: list[str]


def _find_workflow_step_instance_for_task(db: Session, task: Task) -> WorkflowStepInstance | None:
    if not task.workflow_instance_id:
        return None

    linked = (
        db.query(WorkflowStepInstance)
        .filter(
            WorkflowStepInstance.instance_id == task.workflow_instance_id,
            WorkflowStepInstance.task_id == task.id,
        )
        .first()
    )
    if linked:
        return linked

    if task.workflow_step_order is None:
        return None

    return (
        db.query(WorkflowStepInstance)
        .join(WorkflowStep, WorkflowStep.id == WorkflowStepInstance.workflow_step_id)
        .filter(
            WorkflowStepInstance.instance_id == task.workflow_instance_id,
            WorkflowStep.order == task.workflow_step_order,
        )
        .order_by(WorkflowStepInstance.id.asc())
        .first()
    )


def _resolve_step_for_task(db: Session, task: Task) -> WorkflowStep | None:
    step_instance = _find_workflow_step_instance_for_task(db, task)
    if step_instance and step_instance.workflow_step_id:
        return db.get(WorkflowStep, step_instance.workflow_step_id)

    if not task.workflow_instance_id or task.workflow_step_order is None:
        return None

    return (
        db.query(WorkflowStep)
        .join(WorkflowStepInstance, WorkflowStep.id == WorkflowStepInstance.workflow_step_id)
        .filter(
            WorkflowStepInstance.instance_id == task.workflow_instance_id,
            WorkflowStep.order == task.workflow_step_order,
        )
        .order_by(WorkflowStep.id.asc())
        .first()
    )


def _template_exists_on_disk(template: DocumentTemplate | None) -> bool:
    if template is None:
        return False

    if (template.builder_name or "").strip():
        return True

    file_path = (template.file_path or "").strip()
    if not file_path:
        return False

    candidate = Path(file_path)
    if not candidate.is_absolute():
        candidate = BACKEND_ROOT / candidate
    return candidate.exists()


def _resolve_template_for_required_doc(
    db: Session,
    *,
    doc: WorkflowStepDocument,
) -> DocumentTemplate | None:
    if doc.document_template_id:
        return db.get(DocumentTemplate, doc.document_template_id)

    doc_name = (doc.name or "").strip()
    if doc_name:
        exact = (
            db.query(DocumentTemplate)
            .filter(DocumentTemplate.name == doc_name)
            .order_by(DocumentTemplate.id.asc())
            .first()
        )
        if exact:
            return exact

    return None


def _collect_missing_required_documents(db: Session, task: Task) -> list[str]:
    step = _resolve_step_for_task(db, task)
    if not step:
        return []

    required_docs = (
        db.query(WorkflowStepDocument)
        .filter(
            WorkflowStepDocument.workflow_step_id == step.id,
            WorkflowStepDocument.required.is_(True),
        )
        .order_by(WorkflowStepDocument.id.asc())
        .all()
    )

    missing: list[str] = []
    for doc in required_docs:
        template = _resolve_template_for_required_doc(db, doc=doc)
        if _template_exists_on_disk(template):
            continue
        if doc.name not in missing:
            missing.append(doc.name)

    return missing


def _is_capital_call_related_task(task: Task) -> bool:
    if (task.category or "").strip() == "투자실행":
        return True
    title = task.title or ""
    return any(keyword in title for keyword in CAPITAL_CALL_KEYWORDS)


def _resolve_task_fund_id(db: Session, task: Task) -> int | None:
    if task.fund_id:
        return task.fund_id

    if task.investment_id:
        investment = db.get(Investment, task.investment_id)
        if investment and investment.fund_id:
            return investment.fund_id

    if task.workflow_instance_id:
        instance = db.get(WorkflowInstance, task.workflow_instance_id)
        if instance and instance.fund_id:
            return instance.fund_id

    return None


def _collect_completion_warnings(db: Session, task: Task) -> list[str]:
    if not _is_capital_call_related_task(task):
        return []

    fund_id = _resolve_task_fund_id(db, task)
    if not fund_id:
        return [CAPITAL_CALL_WARNING_MESSAGE]

    latest_call = (
        db.query(CapitalCall)
        .filter(CapitalCall.fund_id == fund_id)
        .order_by(CapitalCall.call_date.desc(), CapitalCall.id.desc())
        .first()
    )
    if latest_call is None:
        return [CAPITAL_CALL_WARNING_MESSAGE]

    total_amount = float(latest_call.total_amount or 0)
    # The current CapitalCall schema uses call_date as the due-date field.
    if total_amount <= 0 or latest_call.call_date is None:
        return [CAPITAL_CALL_WARNING_MESSAGE]

    return []


@router.get("/{task_id}/completion-check", response_model=TaskCompletionCheckResponse)
def get_task_completion_check(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    missing_documents = _collect_missing_required_documents(db, task)
    warnings = _collect_completion_warnings(db, task)

    return TaskCompletionCheckResponse(
        can_complete=len(missing_documents) == 0,
        missing_documents=missing_documents,
        warnings=warnings,
    )
