import re
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import get_current_user
from models.attachment import Attachment
from models.calendar_event import CalendarEvent
from models.fund import Fund
from models.gp_entity import GPEntity
from models.investment import Investment, PortfolioCompany
from models.task import Task
from models.task_category import TaskCategory
from models.user import User
from models.workflow import Workflow, WorkflowStep
from models.workflow_instance import (
    WorkflowInstance,
    WorkflowStepInstance,
    WorkflowStepInstanceDocument,
)
from services.lp_transfer_service import apply_transfer_by_workflow_instance_id
from services.erp_backbone import backbone_enabled, mark_subject_deleted, maybe_emit_mutation, record_snapshot, sync_task_graph
from schemas.attachment import AttachmentResponse
from schemas.task import (
    TaskBoardResponse,
    TaskComplete,
    TaskCreate,
    TaskMove,
    TaskResponse,
    TaskUpdate,
)

router = APIRouter(prefix='/api/tasks', tags=['tasks'])

MONTHLY_REMINDER_TITLES = (
    '농금원 월보고 ({year_month})',
    '벤처협회 VICS 월보고 ({year_month})',
)


class TaskAttachmentLinkRequest(BaseModel):
    attachment_id: int
    workflow_doc_id: int | None = None


def _normalize_category_name(value: str | None) -> str:
    return (value or '').strip()


def _attachment_to_response(row: Attachment) -> AttachmentResponse:
    return AttachmentResponse(
        id=row.id,
        filename=row.filename,
        original_filename=row.original_filename,
        file_size=row.file_size,
        mime_type=row.mime_type,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        created_at=row.created_at,
        url=f'/api/attachments/{row.id}',
    )


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


def _resolve_task_links(
    db: Session,
    fund_id: int | None,
    investment_id: int | None,
    gp_entity_id: int | None,
) -> tuple[int | None, int | None, int | None]:
    fund = db.get(Fund, fund_id) if fund_id else None
    if fund_id and not fund:
        raise HTTPException(status_code=404, detail='조합을 찾을 수 없습니다')

    investment = db.get(Investment, investment_id) if investment_id else None
    if investment_id and not investment:
        raise HTTPException(status_code=404, detail='투자 건을 찾을 수 없습니다')

    gp_entity = db.get(GPEntity, gp_entity_id) if gp_entity_id else None
    if gp_entity_id and not gp_entity:
        raise HTTPException(status_code=404, detail='고유계정을 찾을 수 없습니다')

    if gp_entity_id and investment_id:
        raise HTTPException(status_code=409, detail='투자 건과 고유계정을 동시에 연결할 수 없습니다')
    if gp_entity_id and fund_id:
        raise HTTPException(status_code=409, detail='조합과 고유계정을 동시에 연결할 수 없습니다')

    if investment and fund_id and investment.fund_id != fund_id:
        raise HTTPException(status_code=409, detail='투자 건과 조합이 일치하지 않습니다')

    resolved_fund_id = fund_id
    if investment and resolved_fund_id is None:
        resolved_fund_id = investment.fund_id

    resolved_gp_entity_id = gp_entity_id
    if resolved_fund_id is not None:
        resolved_gp_entity_id = None

    return resolved_fund_id, investment_id, resolved_gp_entity_id


def _build_task_lookup_context(db: Session, tasks: list[Task]) -> dict[str, dict[int, object]]:
    task_ids = {row.id for row in tasks if row.id is not None}
    investment_ids = {row.investment_id for row in tasks if row.investment_id is not None}
    workflow_instance_ids = {row.workflow_instance_id for row in tasks if row.workflow_instance_id is not None}
    fund_ids = {row.fund_id for row in tasks if row.fund_id is not None}
    gp_entity_ids = {row.gp_entity_id for row in tasks if row.gp_entity_id is not None}
    company_ids: set[int] = set()

    investments: list[Investment] = []
    if investment_ids:
        investments = db.query(Investment).filter(Investment.id.in_(investment_ids)).all()
        fund_ids.update(row.fund_id for row in investments if row.fund_id is not None)
        company_ids.update(row.company_id for row in investments if row.company_id is not None)

    instances: list[WorkflowInstance] = []
    if workflow_instance_ids:
        instances = db.query(WorkflowInstance).filter(WorkflowInstance.id.in_(workflow_instance_ids)).all()
        fund_ids.update(row.fund_id for row in instances if row.fund_id is not None)
        gp_entity_ids.update(row.gp_entity_id for row in instances if row.gp_entity_id is not None)
        company_ids.update(row.company_id for row in instances if row.company_id is not None)

    funds: list[Fund] = []
    if fund_ids:
        funds = db.query(Fund).filter(Fund.id.in_(fund_ids)).all()

    gp_entities: list[GPEntity] = []
    if gp_entity_ids:
        gp_entities = db.query(GPEntity).filter(GPEntity.id.in_(gp_entity_ids)).all()

    companies: list[PortfolioCompany] = []
    if company_ids:
        companies = db.query(PortfolioCompany).filter(PortfolioCompany.id.in_(company_ids)).all()

    attachment_counts: dict[int, int] = {}
    if task_ids:
        attachment_rows = (
            db.query(Attachment.entity_id, func.count(Attachment.id))
            .filter(
                Attachment.entity_type == 'task',
                Attachment.entity_id.in_(task_ids),
            )
            .group_by(Attachment.entity_id)
            .all()
        )
        attachment_counts = {
            int(task_id): int(count)
            for task_id, count in attachment_rows
            if task_id is not None
        }

    return {
        'investments': {row.id: row for row in investments},
        'instances': {row.id: row for row in instances},
        'funds': {row.id: row for row in funds},
        'gp_entities': {row.id: row for row in gp_entities},
        'companies': {row.id: row for row in companies},
        'attachment_counts': attachment_counts,
    }


def _parse_time_to_minutes(value: str | None) -> int:
    if not value:
        return 0
    total = 0
    normalized = value.split('~')[0] if '~' in value else value
    h_match = re.search(r'(\d+)h', normalized)
    m_match = re.search(r'(\d+)m', normalized)
    d_match = re.search(r'(\d+)d', normalized)
    if h_match:
        total += int(h_match.group(1)) * 60
    if m_match:
        total += int(m_match.group(1))
    if d_match:
        total += int(d_match.group(1)) * 480
    return total


def _task_date(value: datetime | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value


def _compute_stale_days(task: Task, now_dt: datetime) -> int | None:
    if task.status == 'completed':
        return None
    reference = task.updated_at or task.created_at
    if reference is None:
        return None
    delta = now_dt - reference
    return max(0, delta.days)


def _resolve_task_work_score(db: Session, today: date) -> int:
    try:
        from services.health_score import build_dashboard_health
    except Exception:
        return 0
    try:
        payload = build_dashboard_health(db, today)
        score = int((payload.get('domains') or {}).get('tasks', {}).get('score', 0))
        return max(0, min(100, score))
    except Exception:
        return 0


def _select_workflow_representative_task(tasks: list[Task]) -> Task | None:
    if not tasks:
        return None

    in_progress_tasks = [task for task in tasks if task.status == 'in_progress']
    candidates = in_progress_tasks or tasks

    def sort_key(task: Task) -> tuple[int, datetime, int]:
        step_order = task.workflow_step_order if task.workflow_step_order is not None else 10**9
        deadline_value = task.deadline if task.deadline is not None else datetime.max
        task_id = task.id if task.id is not None else 10**9
        return (step_order, deadline_value, task_id)

    return sorted(candidates, key=sort_key)[0]


def _build_actionable_pending_tasks(pending_tasks: list[Task]) -> list[Task]:
    standalone_tasks: list[Task] = []
    workflow_task_map: dict[int, list[Task]] = {}

    for task in pending_tasks:
        workflow_instance_id = task.workflow_instance_id
        if workflow_instance_id is None:
            standalone_tasks.append(task)
            continue
        workflow_task_map.setdefault(workflow_instance_id, []).append(task)

    actionable_tasks = list(standalone_tasks)
    for workflow_tasks in workflow_task_map.values():
        representative = _select_workflow_representative_task(workflow_tasks)
        if representative is not None:
            actionable_tasks.append(representative)

    return actionable_tasks


def _build_task_board_summary(db: Session, tasks: list[Task]) -> dict[str, int]:
    today = date.today()
    now_dt = datetime.now()
    week_end = today + timedelta(days=7)

    pending_statuses = {'pending', 'in_progress'}
    pending_tasks = [task for task in tasks if task.status in pending_statuses]
    actionable_pending_tasks = _build_actionable_pending_tasks(pending_tasks)
    completed_today_tasks = [
        task
        for task in tasks
        if task.status == 'completed' and _task_date(task.completed_at) == today
    ]

    overdue_count = 0
    today_count = 0
    this_week_count = 0
    stale_count = 0

    for task in actionable_pending_tasks:
        deadline_date = _task_date(task.deadline)
        if deadline_date is not None:
            if deadline_date < today:
                overdue_count += 1
            elif deadline_date == today:
                today_count += 1
            elif deadline_date <= week_end:
                this_week_count += 1

        stale_days = _compute_stale_days(task, now_dt)
        if stale_days is not None and stale_days >= 3:
            stale_count += 1

    today_due_pending_tasks = [
        task
        for task in actionable_pending_tasks
        if (deadline_date := _task_date(task.deadline)) is not None and deadline_date <= today
    ]
    completed_today_due_tasks = [
        task
        for task in completed_today_tasks
        if (deadline_date := _task_date(task.deadline)) is not None and deadline_date <= today
    ]
    completed_estimated_minutes = sum(
        _parse_time_to_minutes(task.estimated_time)
        for task in completed_today_due_tasks
    )
    total_estimated_minutes = sum(
        _parse_time_to_minutes(task.estimated_time)
        for task in [*today_due_pending_tasks, *completed_today_due_tasks]
    )

    today_scope_count = len(today_due_pending_tasks) + len(completed_today_due_tasks)
    progress_count_pct = int(round((len(completed_today_due_tasks) / today_scope_count) * 100)) if today_scope_count else 100
    if not today_scope_count:
        progress_time_pct = 100
    elif total_estimated_minutes:
        progress_time_pct = int(round((completed_estimated_minutes / total_estimated_minutes) * 100))
    else:
        progress_time_pct = progress_count_pct

    return {
        'overdue_count': overdue_count,
        'today_count': today_count,
        'this_week_count': this_week_count,
        'completed_today_count': len(completed_today_tasks),
        'total_pending_count': len(actionable_pending_tasks),
        'total_estimated_minutes': total_estimated_minutes,
        'completed_estimated_minutes': completed_estimated_minutes,
        'stale_count': stale_count,
        'work_score': _resolve_task_work_score(db, today),
        'progress_count_pct': progress_count_pct,
        'progress_time_pct': progress_time_pct,
    }


def _to_task_response(
    db: Session,
    task: Task,
    lookup_context: dict[str, dict[int, object]] | None = None,
) -> TaskResponse:
    now_dt = datetime.now()
    context = lookup_context or {}
    investment_by_id: dict[int, Investment] = context.get('investments', {})  # type: ignore[assignment]
    instance_by_id: dict[int, WorkflowInstance] = context.get('instances', {})  # type: ignore[assignment]
    fund_by_id: dict[int, Fund] = context.get('funds', {})  # type: ignore[assignment]
    gp_entity_by_id: dict[int, GPEntity] = context.get('gp_entities', {})  # type: ignore[assignment]
    company_by_id: dict[int, PortfolioCompany] = context.get('companies', {})  # type: ignore[assignment]
    attachment_count_by_task: dict[int, int] = context.get('attachment_counts', {})  # type: ignore[assignment]

    payload = TaskResponse.model_validate(task).model_dump()

    investment = None
    if task.investment_id:
        investment = investment_by_id.get(task.investment_id) or db.get(Investment, task.investment_id)

    fund_id = task.fund_id or (investment.fund_id if investment else None)
    gp_entity_id = task.gp_entity_id

    fund_name = None
    if fund_id:
        fund = fund_by_id.get(fund_id) or db.get(Fund, fund_id)
        fund_name = fund.name if fund else None

    gp_entity_name = None
    if gp_entity_id:
        gp_entity = gp_entity_by_id.get(gp_entity_id) or db.get(GPEntity, gp_entity_id)
        gp_entity_name = gp_entity.name if gp_entity else None

    company_name = None
    if investment:
        company = company_by_id.get(investment.company_id) or db.get(PortfolioCompany, investment.company_id)
        company_name = company.name if company else None

    workflow_instance = None
    if task.workflow_instance_id:
        workflow_instance = (
            instance_by_id.get(task.workflow_instance_id)
            or db.get(WorkflowInstance, task.workflow_instance_id)
        )

    if (not fund_name or not company_name or not gp_entity_name) and workflow_instance:
        instance = workflow_instance
        if not fund_name and instance.fund_id:
            wf_fund = fund_by_id.get(instance.fund_id) or db.get(Fund, instance.fund_id)
            fund_name = wf_fund.name if wf_fund else None
            if fund_id is None:
                fund_id = instance.fund_id
        if not gp_entity_name and instance.gp_entity_id:
            gp_entity = (
                gp_entity_by_id.get(instance.gp_entity_id)
                or db.get(GPEntity, instance.gp_entity_id)
            )
            gp_entity_name = gp_entity.name if gp_entity else None
            if gp_entity_id is None:
                gp_entity_id = instance.gp_entity_id
        if not company_name and instance.company_id:
            wf_company = (
                company_by_id.get(instance.company_id)
                or db.get(PortfolioCompany, instance.company_id)
            )
            company_name = wf_company.name if wf_company else None

    payload['fund_id'] = fund_id
    payload['gp_entity_id'] = gp_entity_id
    payload['fund_name'] = fund_name or gp_entity_name
    payload['gp_entity_name'] = gp_entity_name
    payload['company_name'] = company_name
    payload['workflow_name'] = workflow_instance.name if workflow_instance else None
    payload['stale_days'] = _compute_stale_days(task, now_dt)
    payload['attachment_count'] = int(
        attachment_count_by_task.get(task.id)
        if task.id in attachment_count_by_task
        else (
            db.query(func.count(Attachment.id))
            .filter(
                Attachment.entity_type == 'task',
                Attachment.entity_id == task.id,
            )
            .scalar()
            or 0
        )
    )
    return TaskResponse(**payload)


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

    # Backward compatibility for legacy data created before task_id linkage.
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


def _sync_workflow_on_task_complete(
    db: Session,
    task: Task,
    actual_time: str | None,
    notes: str | None,
) -> None:
    if not task.workflow_instance_id:
        return

    instance = db.get(WorkflowInstance, task.workflow_instance_id)
    if not instance:
        return

    step_instance = _find_workflow_step_instance_for_task(db, task)
    if not step_instance:
        return

    step_instance.status = 'completed'
    step_instance.completed_at = task.completed_at
    step_instance.actual_time = actual_time
    step_instance.notes = notes

    # Session autoflush is disabled globally, so persist step completion
    # before finding the next pending step.
    db.flush()

    next_step = (
        db.query(WorkflowStepInstance)
        .join(WorkflowStep, WorkflowStep.id == WorkflowStepInstance.workflow_step_id)
        .filter(
            WorkflowStepInstance.instance_id == instance.id,
            WorkflowStepInstance.status == 'pending',
            WorkflowStepInstance.id != step_instance.id,
        )
        .order_by(WorkflowStep.order.asc(), WorkflowStepInstance.id.asc())
        .first()
    )
    if next_step:
        next_step.status = 'in_progress'
        if next_step.task_id:
            next_task = db.get(Task, next_step.task_id)
            if next_task and next_task.status == 'pending':
                next_task.status = 'in_progress'

    all_done = all(
        row.status in ('completed', 'skipped')
        for row in instance.step_instances
    )
    if all_done:
        instance.status = 'completed'
        instance.completed_at = datetime.now()
        workflow_template = db.get(Workflow, instance.workflow_id)
        if workflow_template and workflow_template.category == 'LP교체':
            try:
                apply_transfer_by_workflow_instance_id(db, instance.id)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        if instance.fund_id:
            fund = db.get(Fund, instance.fund_id)
            if (
                fund
                and fund.status == 'forming'
                and workflow_template
                and workflow_template.category == '조합결성'
            ):
                fund.status = 'active'
                if not fund.formation_date:
                    fund.formation_date = datetime.now().date()


def _sync_workflow_on_task_undo(db: Session, task: Task) -> None:
    if not task.workflow_instance_id:
        return

    instance = db.get(WorkflowInstance, task.workflow_instance_id)
    if not instance:
        return

    step_instance = _find_workflow_step_instance_for_task(db, task)
    if not step_instance:
        return

    step_instance.status = 'pending'
    step_instance.completed_at = None
    step_instance.actual_time = None
    step_instance.notes = None

    if instance.status == 'completed':
        instance.status = 'active'
        instance.completed_at = None


@router.get('/board', response_model=TaskBoardResponse)
def get_task_board(
    status: str = 'pending',
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
):
    summary_source_tasks = db.query(Task).all()
    summary = _build_task_board_summary(db, summary_source_tasks)

    query = db.query(Task)
    if status != 'all':
        if status == 'pending':
            query = query.filter(Task.status.in_(('pending', 'in_progress')))
        else:
            query = query.filter(Task.status == status)
    if status == 'completed' and (year or month):
        query = query.filter(Task.completed_at.isnot(None))
        if year:
            query = query.filter(extract('year', Task.completed_at) == year)
        if month:
            query = query.filter(extract('month', Task.completed_at) == month)

    tasks = query.order_by(Task.deadline.asc().nullslast(), Task.created_at.asc()).all()
    lookup_context = _build_task_lookup_context(db, tasks)

    board: dict[str, list[TaskResponse]] = {'Q1': [], 'Q2': [], 'Q3': [], 'Q4': []}
    for task in tasks:
        if task.quadrant in board:
            board[task.quadrant].append(_to_task_response(db, task, lookup_context))
    return {
        'summary': summary,
        **board,
    }


@router.get('', response_model=list[TaskResponse])
def list_tasks(
    quadrant: str | None = None,
    status: str | None = None,
    fund_id: int | None = None,
    gp_entity_id: int | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Task)
    if quadrant:
        query = query.filter(Task.quadrant == quadrant)
    if status and status != 'all':
        query = query.filter(Task.status == status)
    if fund_id:
        query = query.filter(Task.fund_id == fund_id)
    if gp_entity_id:
        query = query.filter(Task.gp_entity_id == gp_entity_id)
    if category:
        query = query.filter(Task.category == category)

    rows = query.order_by(Task.deadline.asc().nullslast(), Task.created_at.asc()).all()
    lookup_context = _build_task_lookup_context(db, rows)
    return [_to_task_response(db, row, lookup_context) for row in rows]


@router.get('/{task_id}', response_model=TaskResponse)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='작업을 찾을 수 없습니다')
    return _to_task_response(db, task)


@router.get('/{task_id}/attachments', response_model=list[AttachmentResponse])
def get_task_attachments(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='작업을 찾을 수 없습니다')

    rows = (
        db.query(Attachment)
        .filter(
            Attachment.entity_type == 'task',
            Attachment.entity_id == task.id,
        )
        .order_by(Attachment.id.desc())
        .all()
    )
    return [_attachment_to_response(row) for row in rows]


@router.post('/{task_id}/link-attachment')
def link_attachment_to_task(
    task_id: int,
    body: TaskAttachmentLinkRequest,
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='작업을 찾을 수 없습니다')

    attachment = db.get(Attachment, body.attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail='첨부 파일을 찾을 수 없습니다')

    if body.workflow_doc_id is not None and not task.workflow_instance_id:
        raise HTTPException(
            status_code=400,
            detail='워크플로 업무가 아니어서 workflow_doc_id를 사용할 수 없습니다',
        )

    attachment.entity_type = 'task'
    attachment.entity_id = task.id

    linked_workflow_doc: dict[str, object] | None = None
    linked_document_row: WorkflowStepInstanceDocument | None = None

    if task.workflow_instance_id:
        step_instance = _find_workflow_step_instance_for_task(db, task)
        if body.workflow_doc_id is not None and not step_instance:
            raise HTTPException(status_code=404, detail='워크플로 단계 인스턴스를 찾을 수 없습니다')
        if step_instance:
            step_documents = (
                db.query(WorkflowStepInstanceDocument)
                .filter(WorkflowStepInstanceDocument.step_instance_id == step_instance.id)
                .order_by(
                    WorkflowStepInstanceDocument.required.desc(),
                    WorkflowStepInstanceDocument.id.asc(),
                )
                .all()
            )
            target_document: WorkflowStepInstanceDocument | None = None
            if body.workflow_doc_id is not None:
                target_document = next(
                    (row for row in step_documents if row.id == body.workflow_doc_id),
                    None,
                )
                if not target_document:
                    raise HTTPException(status_code=404, detail='워크플로 서류를 찾을 수 없습니다')
            else:
                target_document = next(
                    (
                        row
                        for row in step_documents
                        if row.required and len(row.attachment_ids or []) == 0
                    ),
                    None,
                )
                if not target_document:
                    target_document = next(
                        (row for row in step_documents if row.required and not row.checked),
                        None,
                    )

            if target_document:
                attachment_ids = list(target_document.attachment_ids or [])
                if attachment.id not in attachment_ids:
                    attachment_ids.append(attachment.id)
                target_document.attachment_ids = attachment_ids
                target_document.checked = True
                linked_document_row = target_document

    try:
        db.flush()
        if backbone_enabled():
            subject = sync_task_graph(db, task)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="task.updated",
                before=before,
                after=record_snapshot(task),
                origin_model="task",
                origin_id=task.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(attachment)
    if linked_document_row is not None:
        db.refresh(linked_document_row)
        linked_workflow_doc = {
            'id': linked_document_row.id,
            'name': linked_document_row.name,
            'required': bool(linked_document_row.required),
            'checked': bool(linked_document_row.checked),
            'attachment_ids': linked_document_row.attachment_ids or [],
        }

    return {
        'attachment': _attachment_to_response(attachment),
        'linked_workflow_doc': linked_workflow_doc,
    }


@router.delete('/{task_id}/unlink-attachment/{attachment_id}', status_code=204)
def unlink_attachment_from_task(task_id: int, attachment_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='작업을 찾을 수 없습니다')

    attachment = db.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail='첨부 파일을 찾을 수 없습니다')
    if attachment.entity_type != 'task' or attachment.entity_id != task.id:
        raise HTTPException(status_code=404, detail='해당 업무에 연결된 첨부 파일이 아닙니다')

    if task.workflow_instance_id:
        step_instance = _find_workflow_step_instance_for_task(db, task)
        if step_instance:
            step_documents = (
                db.query(WorkflowStepInstanceDocument)
                .filter(WorkflowStepInstanceDocument.step_instance_id == step_instance.id)
                .all()
            )
            for document in step_documents:
                attachment_ids = list(document.attachment_ids or [])
                if attachment_id not in attachment_ids:
                    continue
                next_ids = [row for row in attachment_ids if row != attachment_id]
                document.attachment_ids = next_ids
                if len(next_ids) == 0:
                    document.checked = False

    file_path = Path(attachment.file_path)
    db.delete(attachment)
    try:
        db.flush()
        if backbone_enabled():
            subject = sync_task_graph(db, task)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="task.updated",
                before=before,
                after=record_snapshot(task),
                origin_model="task",
                origin_id=task.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise

    if file_path.exists():
        file_path.unlink(missing_ok=True)


@router.post('/generate-monthly-reminders')
def generate_monthly_reminders(
    year_month: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not re.fullmatch(r'\d{4}-\d{2}', year_month):
        raise HTTPException(status_code=400, detail='year_month는 YYYY-MM 형식이어야 합니다')

    year, month = map(int, year_month.split('-'))
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail='유효하지 않은 월입니다')

    deadline = datetime(year, month, 5)
    created: list[str] = []
    created_tasks: list[Task] = []
    skipped: list[str] = []

    for title_template in MONTHLY_REMINDER_TITLES:
        title = title_template.format(year_month=year_month)
        existing = db.query(Task).filter(Task.title == title).first()
        if existing:
            skipped.append(title)
            continue

        task = Task(
            title=title,
            deadline=deadline,
            estimated_time='2h',
            quadrant='Q1',
            status='pending',
            created_by=current_user.id,
            category='보고',
        )
        _ensure_task_category_exists(db, task.category)
        db.add(task)
        db.flush()
        created_tasks.append(task)

        db.add(
            CalendarEvent(
                title=title,
                date=deadline.date(),
                status='pending',
                task_id=task.id,
            )
        )
        created.append(title)

    try:
        if backbone_enabled():
            for task in created_tasks:
                subject = sync_task_graph(db, task)
                maybe_emit_mutation(
                    db,
                    subject=subject,
                    event_type="task.created",
                    after=record_snapshot(task),
                    actor_user_id=current_user.id,
                    origin_model="task",
                    origin_id=task.id,
                )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {'year_month': year_month, 'created': created, 'skipped': skipped}


@router.post('', response_model=TaskResponse, status_code=201)
def create_task(
    data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = data.model_dump()
    resolved_fund_id, resolved_investment_id, resolved_gp_entity_id = _resolve_task_links(
        db,
        payload.get('fund_id'),
        payload.get('investment_id'),
        payload.get('gp_entity_id'),
    )
    payload['fund_id'] = resolved_fund_id
    payload['investment_id'] = resolved_investment_id
    payload['gp_entity_id'] = resolved_gp_entity_id
    payload['created_by'] = current_user.id

    _ensure_task_category_exists(db, payload.get('category'))
    task = Task(**payload)
    db.add(task)
    db.flush()

    if task.deadline:
        db.add(
            CalendarEvent(
                title=task.title,
                date=task.deadline.date(),
                status='pending',
                task_id=task.id,
            )
        )

    try:
        if backbone_enabled():
            subject = sync_task_graph(db, task)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="task.created",
                after=record_snapshot(task),
                actor_user_id=current_user.id,
                origin_model="task",
                origin_id=task.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(task)
    return _to_task_response(db, task)


@router.put('/{task_id}', response_model=TaskResponse)
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='작업을 찾을 수 없습니다')

    before = record_snapshot(task)
    payload = data.model_dump(exclude_unset=True)
    next_fund_id = payload.get('fund_id', task.fund_id)
    next_investment_id = payload.get('investment_id', task.investment_id)
    next_gp_entity_id = payload.get('gp_entity_id', task.gp_entity_id)
    resolved_fund_id, resolved_investment_id, resolved_gp_entity_id = _resolve_task_links(
        db,
        next_fund_id,
        next_investment_id,
        next_gp_entity_id,
    )

    payload['fund_id'] = resolved_fund_id
    payload['investment_id'] = resolved_investment_id
    payload['gp_entity_id'] = resolved_gp_entity_id

    _ensure_task_category_exists(db, payload.get('category', task.category))
    for key, val in payload.items():
        setattr(task, key, val)

    linked_event = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.task_id == task.id)
        .order_by(CalendarEvent.id.asc())
        .first()
    )

    if task.deadline:
        if linked_event:
            linked_event.title = task.title
            linked_event.date = task.deadline.date()
        else:
            db.add(
                CalendarEvent(
                    title=task.title,
                    date=task.deadline.date(),
                    status='pending',
                    task_id=task.id,
                )
            )
    elif linked_event:
        db.delete(linked_event)

    try:
        db.flush()
        if backbone_enabled():
            subject = sync_task_graph(db, task)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="task.updated",
                before=before,
                after=record_snapshot(task),
                origin_model="task",
                origin_id=task.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(task)
    return _to_task_response(db, task)


@router.patch('/{task_id}/move', response_model=TaskResponse)
def move_task(task_id: int, data: TaskMove, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='작업을 찾을 수 없습니다')
    if data.quadrant not in ('Q1', 'Q2', 'Q3', 'Q4'):
        raise HTTPException(status_code=400, detail='유효하지 않은 사분면입니다')

    before = record_snapshot(task)
    task.quadrant = data.quadrant
    try:
        if backbone_enabled():
            subject = sync_task_graph(db, task)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="task.moved",
                before=before,
                after=record_snapshot(task),
                origin_model="task",
                origin_id=task.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(task)
    return _to_task_response(db, task)


@router.patch('/{task_id}/complete', response_model=TaskResponse)
def complete_task(task_id: int, data: TaskComplete, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='작업을 찾을 수 없습니다')

    before = record_snapshot(task)
    task.status = 'completed'
    task.completed_at = datetime.now()
    task.actual_time = data.actual_time
    _sync_workflow_on_task_complete(
        db=db,
        task=task,
        actual_time=data.actual_time,
        notes=data.memo,
    )

    if data.auto_worklog:
        from models.worklog import WorkLog, WorkLogDetail
        worklog_category = _ensure_task_category_exists(db, task.category) or "업무"

        worklog_content = data.memo or task.memo or f'{task.title} 완료'
        worklog = WorkLog(
            date=date.today(),
            category=worklog_category,
            title=f'[완료] {task.title}',
            content=worklog_content,
            status='완료',
            actual_time=data.actual_time,
            task_id=task.id,
        )
        db.add(worklog)
        db.flush()

        if data.memo:
            db.add(WorkLogDetail(worklog_id=worklog.id, content=data.memo, order=0))
        elif task.memo:
            db.add(WorkLogDetail(worklog_id=worklog.id, content=task.memo, order=0))

    try:
        db.flush()
        if backbone_enabled():
            subject = sync_task_graph(db, task)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="task.completed",
                before=before,
                after=record_snapshot(task),
                origin_model="task",
                origin_id=task.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(task)
    return _to_task_response(db, task)


@router.patch('/{task_id}/undo-complete', response_model=TaskResponse)
def undo_complete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='작업을 찾을 수 없습니다')
    if task.status != 'completed':
        raise HTTPException(status_code=400, detail='완료된 작업이 아닙니다')

    before = record_snapshot(task)
    task.status = 'pending'
    task.completed_at = None
    task.actual_time = None
    _sync_workflow_on_task_undo(db=db, task=task)
    try:
        db.flush()
        if backbone_enabled():
            subject = sync_task_graph(db, task)
            maybe_emit_mutation(
                db,
                subject=subject,
                event_type="task.reopened",
                before=before,
                after=record_snapshot(task),
                origin_model="task",
                origin_id=task.id,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(task)
    return _to_task_response(db, task)


@router.delete('/{task_id}', status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail='작업을 찾을 수 없습니다')

    before = record_snapshot(task)
    db.query(CalendarEvent).filter(CalendarEvent.task_id == task.id).delete()
    if backbone_enabled():
        subject = mark_subject_deleted(db, subject_type="task", native_id=task.id, payload=before)
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="task.deleted",
            before=before,
            origin_model="task",
            origin_id=task.id,
        )
    db.delete(task)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
