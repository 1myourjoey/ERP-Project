import re
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from database import get_db
from models.calendar_event import CalendarEvent
from models.fund import Fund
from models.gp_entity import GPEntity
from models.investment import Investment, PortfolioCompany
from models.task import Task
from models.task_category import TaskCategory
from models.workflow import Workflow, WorkflowStep
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance
from services.lp_transfer_service import apply_transfer_by_workflow_instance_id
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


def _normalize_category_name(value: str | None) -> str:
    return (value or '').strip()


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

    return {
        'investments': {row.id: row for row in investments},
        'instances': {row.id: row for row in instances},
        'funds': {row.id: row for row in funds},
        'gp_entities': {row.id: row for row in gp_entities},
        'companies': {row.id: row for row in companies},
    }


def _to_task_response(
    db: Session,
    task: Task,
    lookup_context: dict[str, dict[int, object]] | None = None,
) -> TaskResponse:
    context = lookup_context or {}
    investment_by_id: dict[int, Investment] = context.get('investments', {})  # type: ignore[assignment]
    instance_by_id: dict[int, WorkflowInstance] = context.get('instances', {})  # type: ignore[assignment]
    fund_by_id: dict[int, Fund] = context.get('funds', {})  # type: ignore[assignment]
    gp_entity_by_id: dict[int, GPEntity] = context.get('gp_entities', {})  # type: ignore[assignment]
    company_by_id: dict[int, PortfolioCompany] = context.get('companies', {})  # type: ignore[assignment]

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

    if (not fund_name or not company_name or not gp_entity_name) and task.workflow_instance_id:
        instance = (
            instance_by_id.get(task.workflow_instance_id)
            or db.get(WorkflowInstance, task.workflow_instance_id)
        )
        if instance:
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
    query = db.query(Task)
    if status != 'all':
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
    return board


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


@router.post('/generate-monthly-reminders')
def generate_monthly_reminders(year_month: str, db: Session = Depends(get_db)):
    if not re.fullmatch(r'\d{4}-\d{2}', year_month):
        raise HTTPException(status_code=400, detail='year_month는 YYYY-MM 형식이어야 합니다')

    year, month = map(int, year_month.split('-'))
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail='유효하지 않은 월입니다')

    deadline = datetime(year, month, 5)
    created: list[str] = []
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
            category='보고',
        )
        _ensure_task_category_exists(db, task.category)
        db.add(task)
        db.flush()

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
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {'year_month': year_month, 'created': created, 'skipped': skipped}


@router.post('', response_model=TaskResponse, status_code=201)
def create_task(data: TaskCreate, db: Session = Depends(get_db)):
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

    task.quadrant = data.quadrant
    try:
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

    task.status = 'pending'
    task.completed_at = None
    task.actual_time = None
    _sync_workflow_on_task_undo(db=db, task=task)
    try:
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

    db.query(CalendarEvent).filter(CalendarEvent.task_id == task.id).delete()
    db.delete(task)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
