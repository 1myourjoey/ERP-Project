from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models.workflow import Workflow
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance
from models.task import Task
from schemas.workflow import (
    WorkflowResponse, WorkflowListItem,
    WorkflowInstantiateRequest, WorkflowInstanceResponse,
    WorkflowStepInstanceResponse, WorkflowStepCompleteRequest,
)
from services.workflow_service import instantiate_workflow

router = APIRouter(tags=["workflows"])


# --- Templates ---

@router.get("/api/workflows", response_model=list[WorkflowListItem])
def list_workflows(db: Session = Depends(get_db)):
    workflows = db.query(Workflow).all()
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
        raise HTTPException(404, "Workflow not found")
    return wf


@router.post("/api/workflows/{workflow_id}/instantiate", response_model=WorkflowInstanceResponse)
def instantiate(workflow_id: int, data: WorkflowInstantiateRequest, db: Session = Depends(get_db)):
    wf = db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")

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
        raise HTTPException(404, "Instance not found")
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
        raise HTTPException(404, "Step instance not found")

    si.status = "completed"
    si.completed_at = datetime.now()
    si.actual_time = data.actual_time
    si.notes = data.notes

    # 연결된 Task도 완료 처리
    if si.task_id:
        task = db.get(Task, si.task_id)
        if task:
            task.status = "completed"
            task.completed_at = datetime.now()
            task.actual_time = data.actual_time

    # 모든 step 완료 시 instance도 완료
    instance = db.get(WorkflowInstance, instance_id)
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
        raise HTTPException(404, "Instance not found")
    instance.status = "cancelled"
    # 미완료 Task도 삭제
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
