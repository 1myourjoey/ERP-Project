from __future__ import annotations

from datetime import date

from models.compliance import ComplianceObligation
from models.task import Task
from models.workflow_instance import WorkflowInstance
from services.analytics.common import apply_date_buckets, parse_duration_to_minutes
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db, include={"company", "fund", "investment", "user", "workflow"})
    obligation_map = {row.id: row for row in db.query(ComplianceObligation).all()}
    workflow_instance_map = {row.id: row for row in db.query(WorkflowInstance).all()}
    rows = db.query(Task).all()
    today = date.today()
    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id) if row.fund_id else None
        investment = refs["investment"].get(row.investment_id) if row.investment_id else None
        company = refs["company"].get(investment.company_id) if investment else None
        workflow_instance = workflow_instance_map.get(row.workflow_instance_id) if row.workflow_instance_id else None
        workflow = refs["workflow"].get(workflow_instance.workflow_id) if workflow_instance else None
        creator = refs["user"].get(row.created_by) if row.created_by else None
        obligation = obligation_map.get(row.obligation_id) if row.obligation_id else None
        deadline_date = row.deadline.date() if getattr(row.deadline, "date", None) else row.deadline
        overdue = bool(deadline_date and deadline_date < today and row.status != "completed")
        completed = row.status == "completed"
        item = {
            "id": row.id,
            "task.title": row.title,
            "task.category": row.category,
            "task.status": row.status,
            "task.quadrant": row.quadrant,
            "task.delegate_to": row.delegate_to,
            "task.source": row.source,
            "task.auto_generated": bool(row.auto_generated),
            "task.is_notice": bool(row.is_notice),
            "task.is_report": bool(row.is_report),
            "task.deadline": deadline_date,
            "task.created_at": row.created_at,
            "task.completed_at": row.completed_at,
            "task.estimated_minutes": parse_duration_to_minutes(row.estimated_time),
            "task.actual_minutes": parse_duration_to_minutes(row.actual_time),
            "task.is_overdue": overdue,
            "task.is_completed": completed,
            "task.workflow_step_order": row.workflow_step_order,
            "fund.name": fund.name if fund else None,
            "company.name": company.name if company else None,
            "investment.instrument": investment.instrument if investment else None,
            "workflow.name": workflow.name if workflow else None,
            "workflow.instance_name": workflow_instance.name if workflow_instance else None,
            "obligation.status": obligation.status if obligation else None,
            "creator.name": creator.name if creator else None,
        }
        item.update(apply_date_buckets(deadline_date, "task.deadline"))
        item.update(apply_date_buckets(row.created_at, "task.created_at"))
        item.update(apply_date_buckets(row.completed_at, "task.completed_at"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="task",
    label="업무",
    description="업무 원장 기준으로 마감, 출처, 워크플로 연결, 투자/조합 연결을 함께 분석합니다.",
    grain_label="업무 1건",
    fields=[
        dimension("task.title", "업무명", "string", "기본 차원"),
        dimension("task.category", "카테고리", "string", "기본 차원"),
        dimension("task.status", "상태", "string", "기본 차원"),
        dimension("task.quadrant", "사분면", "string", "기본 차원"),
        dimension("task.source", "생성 출처", "string", "기본 차원"),
        dimension("task.auto_generated", "자동생성", "boolean", "기본 차원"),
        dimension("task.is_notice", "통지성 업무", "boolean", "기본 차원"),
        dimension("task.is_report", "보고성 업무", "boolean", "기본 차원"),
        dimension("fund.name", "조합명", "string", "연결 차원"),
        dimension("company.name", "회사명", "string", "연결 차원"),
        dimension("investment.instrument", "투자수단", "string", "연결 차원"),
        dimension("workflow.name", "워크플로우", "string", "연결 차원"),
        dimension("workflow.instance_name", "워크플로 인스턴스", "string", "연결 차원"),
        dimension("obligation.status", "의무 상태", "string", "연결 차원"),
        dimension("creator.name", "생성자", "string", "연결 차원"),
        dimension("task.deadline.day", "마감일", "date", "날짜 파생"),
        dimension("task.deadline.year_month", "마감월", "string", "날짜 파생"),
        dimension("task.completed_at.day", "완료일", "date", "날짜 파생"),
        measure("task.estimated_minutes", "예상분", "number", "기본 지표"),
        measure("task.actual_minutes", "실소요분", "number", "기본 지표"),
        measure("task.is_overdue", "지연 건수", "number", "기본 지표", aggregates=["sum", "count"], default_aggregate="sum"),
        measure("task.is_completed", "완료 건수", "number", "기본 지표", aggregates=["sum", "count"], default_aggregate="sum"),
    ],
    default_table_fields=[
        "task.title",
        "task.category",
        "task.status",
        "task.deadline.day",
        "fund.name",
        "workflow.name",
        "task.estimated_minutes",
        "task.actual_minutes",
    ],
    default_values=[{"key": "task.is_overdue", "aggregate": "sum"}, {"key": "task.is_completed", "aggregate": "sum"}],
    starter_views=[
        {
            "key": "task_deadline_status",
            "label": "업무 마감/지연 현황",
            "description": "월별 업무 상태와 지연 건수를 집계합니다.",
            "subject_key": "task",
            "config": {
                "subject_key": "task",
                "mode": "pivot",
                "rows": ["task.deadline.year_month", "task.category"],
                "columns": ["task.status"],
                "values": [
                    {"key": "task.is_overdue", "aggregate": "sum"},
                    {"key": "task.is_completed", "aggregate": "sum"},
                ],
                "filters": [],
                "sorts": [{"field": "task.deadline.year_month", "direction": "asc"}],
                "options": {"show_subtotals": True, "show_grand_totals": True, "hide_empty": False, "hide_zero": False, "row_limit": 200, "column_limit": 50},
            },
        }
    ],
    load_rows=load_rows,
)

