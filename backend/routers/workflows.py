from fastapi import APIRouter, Depends, HTTPException
import re
from datetime import date, datetime, time

from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP
from models.gp_entity import GPEntity
from models.investment import Investment, PortfolioCompany
from models.phase3 import CapitalCall, CapitalCallItem
from models.workflow import Workflow, WorkflowStep, WorkflowDocument, WorkflowWarning
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance
from models.task import Task
from schemas.workflow import (
    WorkflowResponse,
    WorkflowListItem,
    WorkflowCreateRequest,
    WorkflowDocumentInput,
    WorkflowDocumentResponse,
    WorkflowUpdateRequest,
    WorkflowInstantiateRequest,
    WorkflowInstanceUpdateRequest,
    WorkflowInstanceResponse,
    WorkflowStepInstanceResponse,
    WorkflowStepCompleteRequest,
)
from services.workflow_service import (
    calculate_step_date,
    instantiate_workflow,
    reconcile_workflow_instance_state,
)
from services.lp_transfer_service import apply_transfer_by_workflow_instance_id

router = APIRouter(tags=["workflows"])


CAPITAL_CALL_ID_PATTERN = re.compile(r"capital_call_id\s*[:=]\s*(\d+)")


def _extract_capital_call_id(memo: str | None) -> int | None:
    if not memo:
        return None
    match = CAPITAL_CALL_ID_PATTERN.search(memo)
    if not match:
        return None
    try:
        return int(match.group(1))
    except (TypeError, ValueError):
        return None


def _is_capital_call_payment_step(step_name: str | None) -> bool:
    normalized = "".join((step_name or "").split())
    return "납입확인" in normalized


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
    paid_date = date.today()
    for item in unpaid_items:
        lp = db.get(LP, item.lp_id)
        item.paid = 1
        item.paid_date = paid_date
        if lp:
            lp.paid_in = int((lp.paid_in or 0) + (item.amount or 0))


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
        lp = db.get(LP, item.lp_id)
        if lp:
            lp.paid_in = max(0, int((lp.paid_in or 0) - (item.amount or 0)))
        item.paid = 0
        item.paid_date = None


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
    db.commit()
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
    db.commit()
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
        wf.steps.append(WorkflowStep(
            order=step.order,
            name=step.name,
            timing=step.timing,
            timing_offset_days=step.timing_offset_days,
            estimated_time=step.estimated_time,
            quadrant=step.quadrant,
            memo=step.memo,
            is_notice=step.is_notice,
            is_report=step.is_report,
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
            is_notice=step.is_notice,
            is_report=step.is_report,
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
    )
    return _build_instance_response(instance, db)


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
    query = db.query(WorkflowInstance)
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
        db.commit()

    if status != "all":
        instances = [instance for instance in instances if instance.status == status]

    return [_build_instance_response(i, db) for i in instances]


@router.get("/api/workflow-instances/{instance_id}", response_model=WorkflowInstanceResponse)
def get_instance(instance_id: int, db: Session = Depends(get_db)):
    instance = db.get(WorkflowInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")
    if reconcile_workflow_instance_state(db, instance):
        db.commit()
        db.refresh(instance)
    return _build_instance_response(instance, db)


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

    db.commit()
    db.refresh(instance)
    return _build_instance_response(instance, db)


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
            if data.notes:
                existing_memo = task.memo or ""
                task.memo = f"{existing_memo}\n[완료 메모] {data.notes}".strip()

    # Session autoflush is disabled globally, so persist current-step completion
    # before querying for the next pending step.
    db.flush()

    instance = db.get(WorkflowInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다")

    next_step = (
        db.query(WorkflowStepInstance)
        .join(WorkflowStep, WorkflowStep.id == WorkflowStepInstance.workflow_step_id)
        .filter(
            WorkflowStepInstance.instance_id == instance_id,
            WorkflowStepInstance.status == "pending",
            WorkflowStepInstance.id != step_instance_id,
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

    completed_wf_step = db.get(WorkflowStep, si.workflow_step_id)
    if completed_wf_step and _is_capital_call_payment_step(completed_wf_step.name):
        capital_call_id = _extract_capital_call_id(instance.memo)
        if capital_call_id is not None:
            _mark_capital_call_items_paid(db, capital_call_id)
    workflow_template = db.get(Workflow, instance.workflow_id)

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

    db.commit()
    db.refresh(instance)
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
    if completed_wf_step and _is_capital_call_payment_step(completed_wf_step.name):
        capital_call_id = _extract_capital_call_id(instance.memo)
        if capital_call_id is not None:
            _rollback_capital_call_items_paid(db, capital_call_id)

    if instance.status == "completed":
        instance.status = "active"
        instance.completed_at = None

    db.commit()
    db.refresh(instance)
    return _build_instance_response(instance, db)


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
    return _build_instance_response(instance, db)


def _build_instance_response(instance: WorkflowInstance, db: Session) -> WorkflowInstanceResponse:
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
        ))

    investment_name = None
    company_name = None
    fund_name = None
    gp_entity_name = None

    if instance.investment_id is not None:
        investment = db.get(Investment, instance.investment_id)
        if investment:
            company = db.get(PortfolioCompany, investment.company_id)
            fund = db.get(Fund, investment.fund_id)
            investment_name = f"{company.name} 투자건" if company else f"투자 #{investment.id}"
            if company:
                company_name = company.name
            if fund:
                fund_name = fund.name

    if company_name is None and instance.company_id is not None:
        company = db.get(PortfolioCompany, instance.company_id)
        if company:
            company_name = company.name

    if fund_name is None and instance.fund_id is not None:
        fund = db.get(Fund, instance.fund_id)
        if fund:
            fund_name = fund.name
    if instance.gp_entity_id is not None:
        gp_entity = db.get(GPEntity, instance.gp_entity_id)
        if gp_entity:
            gp_entity_name = gp_entity.name

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


