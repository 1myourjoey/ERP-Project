from __future__ import annotations

from datetime import date, datetime, time, timedelta
from string import Formatter

from sqlalchemy.orm import Session

from models.task import Task

TASK_GENERATION_RULES = [
    {
        "rule_codes": ["RPT-M-01", "RPT-M-02", "RPT-M-03", "RPT-M-04"],
        "task_template": "VICS 월보고 ({fund_name}) - {rule_title}",
        "d_day_offset": -3,
        "quadrant": "Q1",
        "category": "보고",
    },
    {
        "rule_codes": ["RPT-Q-01"],
        "task_template": "내부보고회 준비 ({fund_name}) - {year}년 {quarter}Q",
        "d_day_offset": -14,
        "quadrant": "Q1",
        "category": "보고",
    },
    {
        "rule_codes": ["RPT-Q-02"],
        "task_template": "피투자사 서류 수집 ({fund_name}) - {year}년 {quarter}Q",
        "d_day_offset": -7,
        "quadrant": "Q1",
        "category": "서류",
    },
    {
        "rule_codes": ["RPT-H-01", "RPT-A-01"],
        "task_template": "영업보고서 준비 ({fund_name}) - {rule_title}",
        "d_day_offset": -14,
        "quadrant": "Q1",
        "category": "보고",
    },
    {
        "rule_codes": ["RPT-E-01", "RPT-E-02", "RPT-E-03", "RPT-E-04", "RPT-E-05", "RPT-E-06"],
        "task_template": "수시보고: {event_description}",
        "d_day_offset": 0,
        "quadrant": "Q1",
        "category": "보고",
    },
]


def _find_rule(rule_code: str) -> dict | None:
    for rule in TASK_GENERATION_RULES:
        if rule_code in rule["rule_codes"]:
            return rule
    return None


def _safe_format(template: str, values: dict[str, object]) -> str:
    available = {field_name for _, field_name, _, _ in Formatter().parse(template) if field_name}
    context = {key: values.get(key, "") for key in available}
    return template.format(**context).strip()


def _to_task_deadline(base_date: date, offset: int) -> datetime:
    target = base_date + timedelta(days=offset)
    return datetime.combine(target, time(hour=9, minute=0))


def create_task_for_obligation(
    db: Session,
    obligation,
    fund_name: str,
    rule_title: str,
    rule_code: str,
    event_description: str | None = None,
) -> Task | None:
    """Create a compliance-linked task and attach it to the obligation."""
    if obligation.task_id:
        return db.get(Task, obligation.task_id)

    generation_rule = _find_rule(rule_code)
    if generation_rule is None:
        return None

    due_date: date = obligation.due_date
    quarter = ((due_date.month - 1) // 3) + 1
    context = {
        "fund_name": fund_name,
        "rule_title": rule_title,
        "year": due_date.year,
        "quarter": quarter,
        "event_description": event_description or rule_title,
    }
    task_title = _safe_format(generation_rule["task_template"], context)
    task_deadline = _to_task_deadline(due_date, int(generation_rule["d_day_offset"]))

    existing = (
        db.query(Task)
        .filter(Task.obligation_id == obligation.id)
        .order_by(Task.id.desc())
        .first()
    )
    if existing:
        obligation.task_id = existing.id
        return existing

    task = Task(
        title=task_title,
        deadline=task_deadline,
        estimated_time="1h",
        quadrant=generation_rule["quadrant"],
        status="pending",
        category=generation_rule["category"],
        fund_id=obligation.fund_id,
        investment_id=obligation.investment_id,
        obligation_id=obligation.id,
        auto_generated=True,
        source="compliance_engine",
        is_report=True,
    )
    db.add(task)
    db.flush()

    obligation.task_id = task.id
    return task
