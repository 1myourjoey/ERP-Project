from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models.workflow import Workflow, WorkflowStep, WorkflowDocument, WorkflowWarning
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance
from models.task import Task
from schemas.workflow import (
    WorkflowResponse,
    WorkflowListItem,
    WorkflowCreateRequest,
    WorkflowUpdateRequest,
    WorkflowInstantiateRequest,
    WorkflowInstanceResponse,
    WorkflowStepInstanceResponse,
    WorkflowStepCompleteRequest,
)
from services.workflow_service import instantiate_workflow

router = APIRouter(tags=["workflows"])


# --- Templates ---

@router.get("/api/workflows", response_model=list[WorkflowListItem])
def list_workflows(db: Session = Depends(get_db)):
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


@router.post("/api/workflows", response_model=WorkflowResponse, status_code=201)
def create_workflow(data: WorkflowCreateRequest, db: Session = Depends(get_db)):
    wf = Workflow(
        name=data.name,
        trigger_description=data.trigger_description,
        category=data.category,
        total_duration=data.total_duration,
    )

    for step in data.steps:
        wf.steps.append(WorkflowStep(
            order=step.order,
            name=step.name,
            timing=step.timing,
            timing_offset_days=step.timing_offset_days,
            estimated_time=step.estimated_time,
            quadrant=step.quadrant,
            memo=step.memo,
        ))

    for doc in data.documents:
        wf.documents.append(WorkflowDocument(
            name=doc.name,
            required=doc.required,
            timing=doc.timing,
            notes=doc.notes,
        ))

    for warning in data.warnings:
        wf.warnings.append(
            WorkflowWarning(
                content=warning.content,
                category=warning.category or "warning",
            )
        )

    db.add(wf)
    db.commit()
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
        wf.steps.append(WorkflowStep(
            order=step.order,
            name=step.name,
            timing=step.timing,
            timing_offset_days=step.timing_offset_days,
            estimated_time=step.estimated_time,
            quadrant=step.quadrant,
            memo=step.memo,
        ))

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

    db.commit()
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
    db.commit()
    return {"ok": True}


@router.post("/api/workflows/{workflow_id}/instantiate", response_model=WorkflowInstanceResponse)
def instantiate(workflow_id: int, data: WorkflowInstantiateRequest, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="워크플로우를 찾을 수 없습니다")

    instance = instantiate_workflow(db, wf, data.name, data.trigger_date, data.memo)
    return _build_instance_response(instance)


# --- Instances ---

@router.get("/api/workflow-instances", response_model=list[WorkflowInstanceResponse])
def list_instances(status: str = "active", db: Session = Depends(get_db)):
    query = db.query(WorkflowInstance)
    if status != "all":
        query = query.filter(WorkflowInstance.status == status)
    instances = query.order_by(WorkflowInstance.created_at.desc()).all()
    return [_build_instance_response(i) for i in instances]


@router.get("/api/workflow-instances/{instance_id}", response_model=WorkflowInstanceResponse)
def get_instance(instance_id: int, db: Session = Depends(get_db)):
    instance = db.get(WorkflowInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")
    return _build_instance_response(instance)


@router.patch("/api/workflow-instances/{instance_id}/steps/{step_instance_id}/complete")
def complete_step(
    instance_id: int,
    step_instance_id: int,
    data: WorkflowStepCompleteRequest,
    db: Session = Depends(get_db),
):
    si = db.get(WorkflowStepInstance, step_instance_id)
    if not si or si.instance_id != instance_id:
        raise HTTPException(status_code=404, detail="단계 인스턴스를 찾을 수 없습니다")

    si.status = "completed"
    si.completed_at = datetime.now()
    si.actual_time = data.actual_time
    si.notes = data.notes

    if si.task_id:
        task = db.get(Task, si.task_id)
        if task:
            task.status = "completed"
            task.completed_at = datetime.now()
            task.actual_time = data.actual_time

    instance = db.get(WorkflowInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")

    next_step = (
        db.query(WorkflowStepInstance)
        .join(WorkflowStep, WorkflowStep.id == WorkflowStepInstance.workflow_step_id)
        .filter(
            WorkflowStepInstance.instance_id == instance_id,
            WorkflowStepInstance.status == "pending",
        )
        .order_by(WorkflowStep.order.asc(), WorkflowStepInstance.id.asc())
        .first()
    )
    if next_step:
        next_step.status = "in_progress"
        if next_step.task_id:
            next_task = db.get(Task, next_step.task_id)
            if next_task and next_task.status == "pending":
                next_task.status = "in_progress"

    all_done = all(
        s.status in ("completed", "skipped")
        for s in instance.step_instances
    )
    if all_done:
        instance.status = "completed"
        instance.completed_at = datetime.now()

    db.commit()
    db.refresh(instance)
    return _build_instance_response(instance)


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

    db.commit()
    db.refresh(instance)
    return _build_instance_response(instance)


def _build_instance_response(instance: WorkflowInstance) -> WorkflowInstanceResponse:
    total = len(instance.step_instances)
    completed = sum(1 for s in instance.step_instances if s.status in ("completed", "skipped"))

    step_responses = []
    for si in instance.step_instances:
        step_responses.append(WorkflowStepInstanceResponse(
            id=si.id,
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
        ))

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
        step_instances=step_responses,
        progress=f"{completed}/{total}",
    )


