from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models.investment import Investment
from models.phase3 import CapitalCall
from models.task import Task
from models.workflow import WorkflowStep
from models.workflow_instance import (
    WorkflowInstance,
    WorkflowStepInstance,
    WorkflowStepInstanceDocument,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

CAPITAL_CALL_KEYWORDS = ("캐피탈콜", "출자", "납입")
CAPITAL_CALL_WARNING_MESSAGE = (
    "해당 완료는 캐피탈콜 청구 금액 또는 납입 기일이 비어있습니다. 자본 탭에서 확인해주세요."
)


class TaskCompletionDocumentItem(BaseModel):
    id: int
    name: str
    required: bool
    checked: bool
    has_attachment: bool
    attachment_ids: list[int] = Field(default_factory=list)


class TaskCompletionCheckResponse(BaseModel):
    can_complete: bool
    documents: list[TaskCompletionDocumentItem] = Field(default_factory=list)
    missing_documents: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


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


def _collect_step_instance_documents(db: Session, task: Task) -> list[WorkflowStepInstanceDocument]:
    step_instance = _find_workflow_step_instance_for_task(db, task)
    if step_instance is None:
        return []
    return (
        db.query(WorkflowStepInstanceDocument)
        .filter(WorkflowStepInstanceDocument.step_instance_id == step_instance.id)
        .order_by(
            WorkflowStepInstanceDocument.required.desc(),
            WorkflowStepInstanceDocument.id.asc(),
        )
        .all()
    )


def _is_capital_call_related_task(task: Task) -> bool:
    if (task.category or "").strip() == "투자집행":
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

    documents = _collect_step_instance_documents(db, task)
    document_items = [
        TaskCompletionDocumentItem(
            id=row.id,
            name=row.name,
            required=bool(row.required),
            checked=bool(row.checked),
            has_attachment=len(row.attachment_ids or []) > 0,
            attachment_ids=row.attachment_ids or [],
        )
        for row in documents
    ]
    missing_documents = [
        row.name
        for row in document_items
        if row.required and not row.checked
    ]
    warnings = _collect_completion_warnings(db, task)

    return TaskCompletionCheckResponse(
        can_complete=len(missing_documents) == 0,
        documents=document_items,
        missing_documents=missing_documents,
        warnings=warnings,
    )
