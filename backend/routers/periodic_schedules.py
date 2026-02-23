from __future__ import annotations

import json
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.periodic_schedule import PeriodicSchedule
from models.regular_report import RegularReport
from models.task import Task
from models.task_category import TaskCategory
from models.workflow import Workflow
from models.workflow_instance import WorkflowInstance
from schemas.periodic_schedule import (
    PeriodicScheduleCreate,
    PeriodicScheduleGenerateResult,
    PeriodicScheduleResponse,
    PeriodicScheduleUpdate,
)
from services.phase32_defaults import ensure_phase32_defaults
from services.workflow_service import calculate_step_date, instantiate_workflow

router = APIRouter(tags=["periodic-schedules"])


def _normalize(value: str | None) -> str:
    return "".join((value or "").split()).lower()


def _decode_steps(value: str | None) -> list[dict]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    rows: list[dict] = []
    for row in parsed:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        try:
            offset_days = int(row.get("offset_days") or 0)
        except (TypeError, ValueError):
            offset_days = 0
        rows.append(
            {
                "name": name,
                "offset_days": offset_days,
                "is_notice": bool(row.get("is_notice", False)),
                "is_report": bool(row.get("is_report", False)),
            }
        )
    return rows


def _encode_steps(rows: list[dict]) -> str:
    return json.dumps(rows, ensure_ascii=False)


def _serialize_schedule(row: PeriodicSchedule) -> PeriodicScheduleResponse:
    return PeriodicScheduleResponse(
        id=row.id,
        name=row.name,
        category=row.category,
        recurrence=row.recurrence,
        base_month=row.base_month,
        base_day=row.base_day,
        workflow_template_id=row.workflow_template_id,
        fund_type_filter=row.fund_type_filter,
        is_active=row.is_active,
        steps=_decode_steps(row.steps_json),
        description=row.description,
    )


def _month_last_day(year: int, month: int) -> int:
    if month in (1, 3, 5, 7, 8, 10, 12):
        return 31
    if month in (4, 6, 9, 11):
        return 30
    if (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0):
        return 29
    return 28


def _occurrence_dates(schedule: PeriodicSchedule, year: int) -> list[date]:
    base_month = max(1, min(12, int(schedule.base_month)))
    base_day = max(1, min(31, int(schedule.base_day)))
    recurrence = (schedule.recurrence or "").strip().lower()

    months: list[int] = []
    if recurrence == "quarterly":
        current = base_month
        while current <= 12:
            months.append(current)
            current += 3
    elif recurrence == "semi-annual":
        months.append(base_month)
        if base_month + 6 <= 12:
            months.append(base_month + 6)
    else:
        months.append(base_month)

    result: list[date] = []
    for month in months:
        day = min(base_day, _month_last_day(year, month))
        result.append(date(year, month, day))
    return result


def _matches_fund_filter(schedule: PeriodicSchedule, fund: Fund) -> bool:
    token = (schedule.fund_type_filter or "").strip()
    if not token:
        return True
    normalized_filter = _normalize(token)
    fund_type = _normalize(fund.type)
    if normalized_filter == "llc":
        return any(keyword in fund_type for keyword in ("llc", "유한", "limited"))
    return normalized_filter in fund_type


def _ensure_task_category_exists(db: Session, category_name: str | None) -> None:
    normalized_name = (category_name or "").strip()
    if not normalized_name:
        return
    existing = (
        db.query(TaskCategory)
        .filter(func.lower(TaskCategory.name) == normalized_name.lower())
        .first()
    )
    if existing:
        return
    db.add(TaskCategory(name=normalized_name))


def _apply_schedule_offsets(
    *,
    db: Session,
    schedule: PeriodicSchedule,
    trigger_date: date,
    instance: WorkflowInstance,
) -> tuple[int, int]:
    configs = _decode_steps(schedule.steps_json)
    config_by_name = {
        _normalize(row.get("name")): row
        for row in configs
        if row.get("name")
    }
    ordered_steps = sorted(
        instance.step_instances,
        key=lambda row: (
            row.step.order if row.step and row.step.order is not None else 10**9,
            row.id or 0,
        ),
    )

    created_tasks = 0
    linked_reports = 0
    for index, step_instance in enumerate(ordered_steps):
        config = None
        step_name = step_instance.step.name if step_instance.step else ""
        key = _normalize(step_name)
        if key and key in config_by_name:
            config = config_by_name[key]
        elif index < len(configs):
            config = configs[index]

        if config is not None:
            target_date = calculate_step_date(trigger_date, int(config.get("offset_days", 0)))
            step_instance.calculated_date = target_date
        else:
            target_date = step_instance.calculated_date

        if not step_instance.task_id:
            continue
        task = db.get(Task, step_instance.task_id)
        if not task:
            continue
        created_tasks += 1

        task.category = (schedule.category or task.category or "").strip() or None
        _ensure_task_category_exists(db, task.category)

        if target_date:
            task.deadline = datetime.combine(target_date, time.min)
        if config is not None:
            task.is_notice = bool(config.get("is_notice", task.is_notice))
            task.is_report = bool(config.get("is_report", task.is_report))

        if task.is_report and task.deadline:
            due_date = (
                task.deadline.date()
                if isinstance(task.deadline, datetime)
                else task.deadline
            )
            existing_report = (
                db.query(RegularReport)
                .filter(RegularReport.task_id == task.id)
                .first()
            )
            if not existing_report:
                db.add(
                    RegularReport(
                        report_target=step_name or schedule.name,
                        fund_id=instance.fund_id,
                        period=(
                            f"{target_date.year}-{target_date.month:02d}"
                            if target_date
                            else str(trigger_date.year)
                        ),
                        due_date=due_date,
                        status="예정",
                        task_id=task.id,
                    )
                )
                linked_reports += 1
    return created_tasks, linked_reports


@router.get("/api/periodic-schedules", response_model=list[PeriodicScheduleResponse])
def list_periodic_schedules(
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    ensure_phase32_defaults(db, auto_commit=True)
    query = db.query(PeriodicSchedule)
    if active_only:
        query = query.filter(PeriodicSchedule.is_active == True)  # noqa: E712
    rows = query.order_by(PeriodicSchedule.id.asc()).all()
    return [_serialize_schedule(row) for row in rows]


@router.get("/api/periodic-schedules/{schedule_id}", response_model=PeriodicScheduleResponse)
def get_periodic_schedule(schedule_id: int, db: Session = Depends(get_db)):
    row = db.get(PeriodicSchedule, schedule_id)
    if not row:
        raise HTTPException(status_code=404, detail="정기 일정을 찾을 수 없습니다")
    return _serialize_schedule(row)


@router.post("/api/periodic-schedules", response_model=PeriodicScheduleResponse, status_code=201)
def create_periodic_schedule(data: PeriodicScheduleCreate, db: Session = Depends(get_db)):
    if data.workflow_template_id is not None:
        template = db.get(Workflow, data.workflow_template_id)
        if not template:
            raise HTTPException(status_code=404, detail="워크플로 템플릿을 찾을 수 없습니다")

    row = PeriodicSchedule(
        name=data.name.strip(),
        category=data.category.strip(),
        recurrence=data.recurrence.strip(),
        base_month=data.base_month,
        base_day=data.base_day,
        workflow_template_id=data.workflow_template_id,
        fund_type_filter=(data.fund_type_filter or "").strip() or None,
        is_active=bool(data.is_active),
        steps_json=_encode_steps([step.model_dump() for step in data.steps]),
        description=(data.description or "").strip() or None,
    )
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize_schedule(row)


@router.put("/api/periodic-schedules/{schedule_id}", response_model=PeriodicScheduleResponse)
def update_periodic_schedule(
    schedule_id: int,
    data: PeriodicScheduleUpdate,
    db: Session = Depends(get_db),
):
    row = db.get(PeriodicSchedule, schedule_id)
    if not row:
        raise HTTPException(status_code=404, detail="정기 일정을 찾을 수 없습니다")

    payload = data.model_dump(exclude_unset=True)
    if "workflow_template_id" in payload and payload["workflow_template_id"] is not None:
        template = db.get(Workflow, payload["workflow_template_id"])
        if not template:
            raise HTTPException(status_code=404, detail="워크플로 템플릿을 찾을 수 없습니다")

    for key in (
        "name",
        "category",
        "recurrence",
        "base_month",
        "base_day",
        "workflow_template_id",
        "is_active",
        "description",
    ):
        if key not in payload:
            continue
        setattr(row, key, payload[key])

    if "fund_type_filter" in payload:
        row.fund_type_filter = (payload["fund_type_filter"] or "").strip() or None
    if "steps" in payload and payload["steps"] is not None:
        steps_payload: list[dict] = []
        for step in payload["steps"]:
            if isinstance(step, dict):
                steps_payload.append(step)
            elif hasattr(step, "model_dump"):
                steps_payload.append(step.model_dump())
        row.steps_json = _encode_steps(steps_payload)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize_schedule(row)


@router.delete("/api/periodic-schedules/{schedule_id}", status_code=204)
def delete_periodic_schedule(schedule_id: int, db: Session = Depends(get_db)):
    row = db.get(PeriodicSchedule, schedule_id)
    if not row:
        raise HTTPException(status_code=404, detail="정기 일정을 찾을 수 없습니다")
    db.delete(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


@router.post("/api/periodic-schedules/generate-year", response_model=PeriodicScheduleGenerateResult)
def generate_periodic_schedules_for_year(
    year: int = Query(..., ge=2000, le=2100),
    dry_run: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    ensure_phase32_defaults(db, auto_commit=True)

    schedules = (
        db.query(PeriodicSchedule)
        .filter(PeriodicSchedule.is_active == True)  # noqa: E712
        .order_by(PeriodicSchedule.id.asc())
        .all()
    )
    funds = (
        db.query(Fund)
        .filter(
            ~func.lower(func.coalesce(Fund.status, "")).in_(
                ["closed", "dissolved", "liquidated", "해산", "청산"]
            )
        )
        .order_by(Fund.id.asc())
        .all()
    )

    created_instances = 0
    skipped_instances = 0
    created_tasks = 0
    linked_reports = 0
    details: list[str] = []

    for schedule in schedules:
        if not schedule.workflow_template_id:
            skipped_instances += 1
            details.append(f"[skip] {schedule.name}: workflow_template_id missing")
            continue
        workflow = db.get(Workflow, schedule.workflow_template_id)
        if not workflow:
            skipped_instances += 1
            details.append(f"[skip] {schedule.name}: template {schedule.workflow_template_id} missing")
            continue

        for trigger_date in _occurrence_dates(schedule, year):
            for fund in funds:
                if not _matches_fund_filter(schedule, fund):
                    continue

                marker = f"periodic_schedule_id={schedule.id};date={trigger_date.isoformat()}"
                exists = (
                    db.query(WorkflowInstance)
                    .filter(
                        WorkflowInstance.workflow_id == workflow.id,
                        WorkflowInstance.fund_id == fund.id,
                        WorkflowInstance.trigger_date == trigger_date,
                        WorkflowInstance.memo.contains(marker),
                    )
                    .first()
                )
                if exists:
                    skipped_instances += 1
                    continue

                created_instances += 1
                if dry_run:
                    created_tasks += len(workflow.steps or [])
                    details.append(f"[dry] {fund.name} | {schedule.name} | {trigger_date.isoformat()}")
                    continue

                instance_name = f"[정기] {fund.name} {schedule.name} ({trigger_date.isoformat()})"
                instance = instantiate_workflow(
                    db=db,
                    workflow=workflow,
                    name=instance_name,
                    trigger_date=trigger_date,
                    memo=marker,
                    fund_id=fund.id,
                    auto_commit=False,
                )
                task_count, report_count = _apply_schedule_offsets(
                    db=db,
                    schedule=schedule,
                    trigger_date=trigger_date,
                    instance=instance,
                )
                created_tasks += task_count
                linked_reports += report_count
                details.append(
                    f"[ok] {fund.name} | {schedule.name} | {trigger_date.isoformat()} | tasks={task_count}"
                )

    if not dry_run:
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise

    return PeriodicScheduleGenerateResult(
        year=year,
        dry_run=dry_run,
        created_instances=created_instances,
        skipped_instances=skipped_instances,
        created_tasks=created_tasks,
        linked_reports=linked_reports,
        details=details[:200],
    )
