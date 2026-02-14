import os
import re
from datetime import date, timedelta
from functools import lru_cache

from sqlalchemy.orm import Session

from models.fund import FundNoticePeriod
from models.investment import InvestmentDocument
from models.task import Task
from models.workflow import Workflow, WorkflowStep
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance

# Fixed-date Korean public holidays.
FIXED_HOLIDAYS: set[tuple[int, int]] = {
    (1, 1),    # New Year
    (3, 1),    # Independence Movement Day
    (5, 5),    # Children's Day
    (6, 6),    # Memorial Day
    (8, 15),   # Liberation Day
    (10, 3),   # National Foundation Day
    (10, 9),   # Hangul Day
    (12, 25),  # Christmas
}


@lru_cache(maxsize=1)
def _extra_holidays() -> set[date]:
    """Parse additional holidays from ERP_EXTRA_HOLIDAYS.

    Example:
        ERP_EXTRA_HOLIDAYS=2026-02-16,2026-02-17
    """
    value = os.getenv("ERP_EXTRA_HOLIDAYS", "")
    if not value:
        return set()

    parsed: set[date] = set()
    for token in value.split(","):
        normalized = token.strip()
        if not normalized:
            continue
        try:
            parsed.add(date.fromisoformat(normalized))
        except ValueError:
            # Ignore malformed values instead of failing workflow creation.
            continue
    return parsed


def _is_non_business_day(d: date) -> bool:
    if d.weekday() >= 5:
        return True
    if (d.month, d.day) in FIXED_HOLIDAYS:
        return True
    return d in _extra_holidays()


def shift_to_business_day(d: date, forward: bool = True) -> date:
    step = 1 if forward else -1
    while _is_non_business_day(d):
        d += timedelta(days=step)
    return d


def calculate_step_date(trigger_date: date, offset_days: int) -> date:
    result = trigger_date + timedelta(days=offset_days)
    return shift_to_business_day(result, forward=offset_days >= 0)


def calculate_business_days_before(target_date: date, business_days: int) -> date:
    """Go back N business days from target_date."""
    result = target_date
    days_counted = 0
    while days_counted < business_days:
        result -= timedelta(days=1)
        if not _is_non_business_day(result):
            days_counted += 1
    return result


def _normalize_notice_key(value: str) -> str:
    return value.strip().lower()


def _extract_notice_type(step: WorkflowStep, alias_to_notice_type: dict[str, str]) -> str | None:
    if not alias_to_notice_type:
        return None

    sources = [step.timing or "", step.name or "", step.memo or ""]

    # Explicit forms: notice:assembly, #assembly, [assembly], (assembly)
    explicit_patterns = [
        r"notice\s*:\s*([a-zA-Z0-9_-]+)",
        r"#([a-zA-Z0-9_-]+)",
        r"\[([a-zA-Z0-9_-]+)\]",
        r"\(([a-zA-Z0-9_-]+)\)",
    ]
    for source in sources:
        lowered = source.lower()
        for pattern in explicit_patterns:
            for matched in re.findall(pattern, lowered):
                key = _normalize_notice_key(matched)
                if key in alias_to_notice_type:
                    return alias_to_notice_type[key]

    # Fallback: match by direct mention in step text.
    for source in sources:
        lowered = source.lower()
        for alias, notice_type in alias_to_notice_type.items():
            if alias and alias in lowered:
                return notice_type

    return None


def _fund_notice_overrides(db: Session, fund_id: int | None) -> tuple[dict[str, int], dict[str, str]]:
    if fund_id is None:
        return {}, {}
    rows = (
        db.query(FundNoticePeriod)
        .filter(FundNoticePeriod.fund_id == fund_id)
        .all()
    )
    overrides: dict[str, int] = {}
    alias_to_notice_type: dict[str, str] = {}
    for row in rows:
        notice_type = _normalize_notice_key(row.notice_type)
        overrides[notice_type] = row.business_days
        alias_to_notice_type[notice_type] = notice_type
        label_key = _normalize_notice_key(row.label) if row.label else ""
        if label_key:
            alias_to_notice_type[label_key] = notice_type
    return overrides, alias_to_notice_type


def instantiate_workflow(
    db: Session,
    workflow: Workflow,
    name: str,
    trigger_date: date,
    memo: str | None = None,
    investment_id: int | None = None,
    company_id: int | None = None,
    fund_id: int | None = None,
    notice_overrides: dict[str, int] | None = None,
) -> WorkflowInstance:
    instance = WorkflowInstance(
        workflow_id=workflow.id,
        name=name,
        trigger_date=trigger_date,
        memo=memo,
        investment_id=investment_id,
        company_id=company_id,
        fund_id=fund_id,
    )
    db.add(instance)
    db.flush()  # Get instance.id.

    overrides, alias_to_notice_type = _fund_notice_overrides(db, fund_id)
    if notice_overrides:
        for key, value in notice_overrides.items():
            normalized_key = _normalize_notice_key(key)
            overrides[normalized_key] = value
            alias_to_notice_type[normalized_key] = normalized_key

    for step in workflow.steps:
        matched_notice_type = _extract_notice_type(step, alias_to_notice_type)
        if matched_notice_type is not None:
            calc_date = calculate_business_days_before(trigger_date, overrides[matched_notice_type])
        else:
            calc_date = calculate_step_date(trigger_date, step.timing_offset_days)

        # Create a task linked to the workflow step.
        task = Task(
            title=f"[{name}] {step.name}",
            deadline=calc_date,
            estimated_time=step.estimated_time,
            quadrant=step.quadrant,
            memo=step.memo,
            status="pending",
            workflow_instance_id=instance.id,
            workflow_step_order=step.order,
        )
        db.add(task)
        db.flush()

        step_instance = WorkflowStepInstance(
            instance_id=instance.id,
            workflow_step_id=step.id,
            calculated_date=calc_date,
            task_id=task.id,
        )
        db.add(step_instance)

    if investment_id:
        for doc in workflow.documents:
            existing = (
                db.query(InvestmentDocument)
                .filter(
                    InvestmentDocument.investment_id == investment_id,
                    InvestmentDocument.name == doc.name,
                )
                .first()
            )
            if existing:
                continue
            db.add(
                InvestmentDocument(
                    investment_id=investment_id,
                    name=doc.name,
                    doc_type=doc.timing or None,
                    status="pending",
                    note=f"Auto-created from workflow: {workflow.name}",
                )
            )

    first_step = (
        db.query(WorkflowStepInstance)
        .filter(WorkflowStepInstance.instance_id == instance.id)
        .join(WorkflowStep, WorkflowStep.id == WorkflowStepInstance.workflow_step_id)
        .order_by(WorkflowStep.order.asc(), WorkflowStepInstance.id.asc())
        .first()
    )
    if first_step:
        first_step.status = "in_progress"
        if first_step.task_id:
            task = db.get(Task, first_step.task_id)
            if task:
                task.status = "in_progress"

    db.commit()
    db.refresh(instance)
    return instance
