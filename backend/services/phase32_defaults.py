from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.document_template import DocumentTemplate
from models.periodic_schedule import PeriodicSchedule
from models.task_category import TaskCategory
from models.workflow import Workflow, WorkflowStep, WorkflowStepDocument

_DOCUMENT_TEMPLATE_SEEDS = [
    {
        "name": "분기보고_보고서양식",
        "category": "분기보고",
        "description": "분기보고서 작성 템플릿",
        "variables": '["fund_name","year","quarter"]',
        "workflow_step_label": "보고서 작성 완료",
        "glob_patterns": ["templates/**/*.xlsx"],
    },
    {
        "name": "분기보고_회의록",
        "category": "분기보고",
        "description": "분기보고 회의록 템플릿",
        "variables": '["fund_name","year","quarter","meeting_date"]',
        "workflow_step_label": "보고서 개회",
        "glob_patterns": ["templates/**/*.docx"],
    },
    {
        "name": "영업보고_회의자료",
        "category": "영업보고",
        "description": "반기 영업보고 회의자료 템플릿",
        "variables": '["fund_name","period"]',
        "workflow_step_label": "영업보고서 작성",
        "glob_patterns": ["templates/**/*.docx"],
    },
    {
        "name": "정기사원총회_회의록",
        "category": "정기사원총회",
        "description": "정기사원총회 회의록 템플릿",
        "variables": '["fund_name","assembly_date"]',
        "workflow_step_label": "회의록 작성",
        "glob_patterns": ["templates/**/*.docx"],
    },
]

_WORKFLOW_SEEDS = [
    {
        "name": "분기보고 워크플로",
        "category": "분기보고",
        "trigger_description": "분기 단위 재무 자료 수집 및 보고",
        "total_duration": "35일",
        "steps": [
            {
                "name": "외부투자사 자료 요청",
                "timing": "T+0",
                "timing_offset_days": 0,
                "estimated_time": "30m",
                "quadrant": "Q1",
                "memo": "재무제표/손익계산서 요청",
                "is_notice": False,
                "is_report": False,
                "documents": [],
            },
            {
                "name": "자료 수집 완료",
                "timing": "T+14",
                "timing_offset_days": 14,
                "estimated_time": "2h",
                "quadrant": "Q1",
                "memo": "자료 취합",
                "is_notice": False,
                "is_report": False,
                "documents": [],
            },
            {
                "name": "취합 완료",
                "timing": "T+20",
                "timing_offset_days": 20,
                "estimated_time": "2h",
                "quadrant": "Q1",
                "memo": "취합/검토",
                "is_notice": False,
                "is_report": False,
                "documents": [],
            },
            {
                "name": "보고서 작성 완료",
                "timing": "T+23",
                "timing_offset_days": 23,
                "estimated_time": "2h",
                "quadrant": "Q1",
                "memo": "분기보고서 작성",
                "is_notice": False,
                "is_report": True,
                "documents": [
                    {"name": "분기보고서", "template_name": "분기보고_보고서양식"},
                ],
            },
            {
                "name": "보고서 회람 안내",
                "timing": "T+28",
                "timing_offset_days": 28,
                "estimated_time": "30m",
                "quadrant": "Q1",
                "memo": "LP 대상 회람 안내",
                "is_notice": True,
                "is_report": False,
                "documents": [],
            },
            {
                "name": "보고서 개회",
                "timing": "T+35",
                "timing_offset_days": 35,
                "estimated_time": "1h",
                "quadrant": "Q1",
                "memo": "분기보고 개회",
                "is_notice": False,
                "is_report": False,
                "documents": [
                    {"name": "분기보고 회의록", "template_name": "분기보고_회의록"},
                ],
            },
        ],
    },
    {
        "name": "영업보고 워크플로",
        "category": "영업보고",
        "trigger_description": "반기 영업보고 준비 및 개회",
        "total_duration": "15일",
        "steps": [
            {
                "name": "총회 소집공문 발송",
                "timing": "T-7",
                "timing_offset_days": -7,
                "estimated_time": "30m",
                "quadrant": "Q1",
                "memo": "소집공문 발송",
                "is_notice": True,
                "is_report": False,
                "documents": [],
            },
            {
                "name": "의안설명서 준비",
                "timing": "T-5",
                "timing_offset_days": -5,
                "estimated_time": "1h",
                "quadrant": "Q1",
                "memo": "의안설명서 작성",
                "is_notice": False,
                "is_report": False,
                "documents": [],
            },
            {
                "name": "영업보고서 작성",
                "timing": "T-3",
                "timing_offset_days": -3,
                "estimated_time": "2h",
                "quadrant": "Q1",
                "memo": "영업보고서 작성",
                "is_notice": False,
                "is_report": True,
                "documents": [
                    {"name": "영업보고 회의자료", "template_name": "영업보고_회의자료"},
                ],
            },
            {
                "name": "감사보고서 확인",
                "timing": "T-2",
                "timing_offset_days": -2,
                "estimated_time": "1h",
                "quadrant": "Q2",
                "memo": "감사보고서 확인",
                "is_notice": False,
                "is_report": True,
                "documents": [],
            },
            {
                "name": "의결권 통보서 정리",
                "timing": "T-1",
                "timing_offset_days": -1,
                "estimated_time": "30m",
                "quadrant": "Q2",
                "memo": "의결권 통보 확인",
                "is_notice": True,
                "is_report": False,
                "documents": [],
            },
            {
                "name": "총회 개회",
                "timing": "T-day",
                "timing_offset_days": 0,
                "estimated_time": "1h",
                "quadrant": "Q1",
                "memo": "영업보고 총회 진행",
                "is_notice": False,
                "is_report": False,
                "documents": [],
            },
        ],
    },
    {
        "name": "정기사원총회 워크플로",
        "category": "정기사원총회",
        "trigger_description": "LLC 대상 정기사원총회 준비 및 후속 처리",
        "total_duration": "10일",
        "steps": [
            {
                "name": "소집 통지",
                "timing": "T-7",
                "timing_offset_days": -7,
                "estimated_time": "30m",
                "quadrant": "Q1",
                "memo": "총회 1주 전 통지",
                "is_notice": True,
                "is_report": False,
                "documents": [],
            },
            {
                "name": "서류 준비 5종",
                "timing": "T-3",
                "timing_offset_days": -3,
                "estimated_time": "2h",
                "quadrant": "Q1",
                "memo": "총회 서류 5종 준비",
                "is_notice": False,
                "is_report": False,
                "documents": [],
            },
            {
                "name": "총회 개회",
                "timing": "T-day",
                "timing_offset_days": 0,
                "estimated_time": "1h",
                "quadrant": "Q1",
                "memo": "정기사원총회 진행",
                "is_notice": False,
                "is_report": False,
                "documents": [],
            },
            {
                "name": "회의록 작성",
                "timing": "T+2",
                "timing_offset_days": 2,
                "estimated_time": "1h",
                "quadrant": "Q1",
                "memo": "회의록 작성 및 보고",
                "is_notice": False,
                "is_report": True,
                "documents": [
                    {"name": "정기사원총회 회의록", "template_name": "정기사원총회_회의록"},
                ],
            },
        ],
    },
]

_PERIODIC_SCHEDULE_SEEDS = [
    {
        "name": "분기보고",
        "category": "분기보고",
        "recurrence": "quarterly",
        "base_month": 2,
        "base_day": 10,
        "workflow_name": "분기보고 워크플로",
        "fund_type_filter": None,
        "description": "분기별 투자사 재무자료 요청/취합/보고",
        "steps": [
            {"name": "외부투자사 자료 요청", "offset_days": 0, "is_report": False, "is_notice": False},
            {"name": "자료 수집 완료", "offset_days": 14, "is_report": False, "is_notice": False},
            {"name": "취합 완료", "offset_days": 20, "is_report": False, "is_notice": False},
            {"name": "보고서 작성 완료", "offset_days": 23, "is_report": True, "is_notice": False},
            {"name": "보고서 회람 안내", "offset_days": 28, "is_report": False, "is_notice": True},
            {"name": "보고서 개회", "offset_days": 35, "is_report": False, "is_notice": False},
        ],
    },
    {
        "name": "영업보고",
        "category": "영업보고",
        "recurrence": "semi-annual",
        "base_month": 3,
        "base_day": 10,
        "workflow_name": "영업보고 워크플로",
        "fund_type_filter": None,
        "description": "반기 영업보고 준비/개회 일정",
        "steps": [
            {"name": "총회 소집공문 발송", "offset_days": -7, "is_report": False, "is_notice": True},
            {"name": "의안설명서 준비", "offset_days": -5, "is_report": False, "is_notice": False},
            {"name": "영업보고서 작성", "offset_days": -3, "is_report": True, "is_notice": False},
            {"name": "감사보고서 확인", "offset_days": -2, "is_report": True, "is_notice": False},
            {"name": "의결권 통보서 정리", "offset_days": -1, "is_report": False, "is_notice": True},
            {"name": "총회 개회", "offset_days": 0, "is_report": False, "is_notice": False},
        ],
    },
    {
        "name": "정기사원총회",
        "category": "정기사원총회",
        "recurrence": "annual",
        "base_month": 3,
        "base_day": 15,
        "workflow_name": "정기사원총회 워크플로",
        "fund_type_filter": "LLC",
        "description": "LLC 대상 정기사원총회 일정",
        "steps": [
            {"name": "소집 통지", "offset_days": -7, "is_report": False, "is_notice": True},
            {"name": "서류 준비 5종", "offset_days": -3, "is_report": False, "is_notice": False},
            {"name": "총회 개회", "offset_days": 0, "is_report": False, "is_notice": False},
            {"name": "회의록 작성", "offset_days": 2, "is_report": True, "is_notice": False},
        ],
    },
]


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _find_first_relative_path(patterns: list[str]) -> str | None:
    root = _project_root()
    for pattern in patterns:
        matched = sorted(root.glob(pattern))
        if not matched:
            continue
        target = matched[0]
        try:
            return str(target.relative_to(root)).replace("\\", "/")
        except ValueError:
            return str(target).replace("\\", "/")
    return None


def _ensure_task_category(db: Session, name: str) -> None:
    normalized = (name or "").strip()
    if not normalized:
        return
    exists = (
        db.query(TaskCategory)
        .filter(func.lower(TaskCategory.name) == normalized.lower())
        .first()
    )
    if exists:
        return
    db.add(TaskCategory(name=normalized))


def _ensure_document_templates(db: Session) -> tuple[dict[str, DocumentTemplate], int]:
    existing = {row.name: row for row in db.query(DocumentTemplate).all()}
    changed = 0
    for seed in _DOCUMENT_TEMPLATE_SEEDS:
        file_path = _find_first_relative_path(seed["glob_patterns"])
        row = existing.get(seed["name"])
        if row is None:
            row = DocumentTemplate(
                name=seed["name"],
                category=seed["category"],
                file_path=file_path,
                builder_name=None,
                description=seed["description"],
                variables=seed["variables"],
                custom_data="{}",
                workflow_step_label=seed["workflow_step_label"],
            )
            db.add(row)
            existing[row.name] = row
            changed += 1
            continue

        row_changed = False
        for key in ("category", "description", "variables", "workflow_step_label"):
            if getattr(row, key) != seed[key]:
                setattr(row, key, seed[key])
                row_changed = True
        if file_path and row.file_path != file_path:
            row.file_path = file_path
            row_changed = True
        if row.custom_data is None:
            row.custom_data = "{}"
            row_changed = True
        if row_changed:
            changed += 1
    db.flush()
    return existing, changed


def _ensure_workflows(
    db: Session,
    templates_by_name: dict[str, DocumentTemplate],
) -> tuple[dict[str, Workflow], int]:
    existing = {row.name: row for row in db.query(Workflow).all()}
    changed = 0
    for seed in _WORKFLOW_SEEDS:
        _ensure_task_category(db, seed["category"])
        if seed["name"] in existing:
            continue

        workflow = Workflow(
            name=seed["name"],
            trigger_description=seed["trigger_description"],
            category=seed["category"],
            total_duration=seed["total_duration"],
        )
        for index, step_seed in enumerate(seed["steps"], start=1):
            step = WorkflowStep(
                order=index,
                name=step_seed["name"],
                timing=step_seed["timing"],
                timing_offset_days=step_seed["timing_offset_days"],
                estimated_time=step_seed["estimated_time"],
                quadrant=step_seed["quadrant"],
                memo=step_seed["memo"],
                is_notice=bool(step_seed["is_notice"]),
                is_report=bool(step_seed["is_report"]),
            )
            for doc_seed in step_seed.get("documents", []):
                template = templates_by_name.get(doc_seed["template_name"])
                doc = WorkflowStepDocument(
                    document_template_id=template.id if template else None,
                    name=doc_seed["name"],
                    required=True,
                    timing=None,
                    notes=None,
                )
                doc.attachment_ids = []
                step.step_documents.append(doc)
            workflow.steps.append(step)
        db.add(workflow)
        existing[workflow.name] = workflow
        changed += 1
    db.flush()
    return existing, changed


def _ensure_periodic_schedules(db: Session, workflows_by_name: dict[str, Workflow]) -> int:
    existing = {row.name: row for row in db.query(PeriodicSchedule).all()}
    changed = 0
    for seed in _PERIODIC_SCHEDULE_SEEDS:
        workflow = workflows_by_name.get(seed["workflow_name"])
        if workflow is None:
            continue

        row = existing.get(seed["name"])
        steps_json = json.dumps(seed["steps"], ensure_ascii=False)
        if row is None:
            db.add(
                PeriodicSchedule(
                    name=seed["name"],
                    category=seed["category"],
                    recurrence=seed["recurrence"],
                    base_month=seed["base_month"],
                    base_day=seed["base_day"],
                    workflow_template_id=workflow.id,
                    fund_type_filter=seed["fund_type_filter"],
                    reminder_offsets="[]",
                    is_active=True,
                    steps_json=steps_json,
                    description=seed["description"],
                )
            )
            changed += 1
            continue

        row_changed = False
        for key in (
            "category",
            "recurrence",
            "base_month",
            "base_day",
            "fund_type_filter",
            "description",
        ):
            if getattr(row, key) != seed[key]:
                setattr(row, key, seed[key])
                row_changed = True
        if row.workflow_template_id != workflow.id:
            row.workflow_template_id = workflow.id
            row_changed = True
        if row.steps_json != steps_json:
            row.steps_json = steps_json
            row_changed = True
        if not (row.reminder_offsets or "").strip():
            row.reminder_offsets = "[]"
            row_changed = True
        if row_changed:
            changed += 1
    db.flush()
    return changed


def ensure_phase32_defaults(db: Session, *, auto_commit: bool = True) -> dict[str, int]:
    templates_by_name, template_changed = _ensure_document_templates(db)
    workflows_by_name, workflow_changed = _ensure_workflows(db, templates_by_name)
    schedule_changed = _ensure_periodic_schedules(db, workflows_by_name)
    changed_total = template_changed + workflow_changed + schedule_changed
    if changed_total > 0:
        if auto_commit:
            db.commit()
        else:
            db.flush()
    return {
        "template_changed": template_changed,
        "workflow_changed": workflow_changed,
        "schedule_changed": schedule_changed,
    }
