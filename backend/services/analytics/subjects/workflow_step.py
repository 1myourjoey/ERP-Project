from __future__ import annotations

from datetime import date

from models.workflow_instance import WorkflowStepInstance
from services.analytics.common import apply_date_buckets, parse_duration_to_minutes
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps, workflow_step_doc_stats


def load_rows(db):
    refs = load_reference_maps(db)
    rows = db.query(WorkflowStepInstance).all()
    checked_docs_map, required_unchecked_map = workflow_step_doc_stats(db)
    today = date.today()
    result = []
    for row in rows:
        instance = row.instance
        if instance is None:
            continue
        workflow = refs["workflow"].get(instance.workflow_id)
        step = refs["workflow_step"].get(row.workflow_step_id)
        fund = refs["fund"].get(instance.fund_id) if instance.fund_id else None
        investment = refs["investment"].get(instance.investment_id) if instance.investment_id else None
        company = refs["company"].get(instance.company_id) if instance.company_id else None
        overdue = bool(row.calculated_date and row.calculated_date < today and row.status not in {"completed", "skipped"})
        item = {
            "id": row.id,
            "workflow.name": workflow.name if workflow else None,
            "workflow.category": workflow.category if workflow else None,
            "workflow.instance_name": instance.name,
            "step.name": step.name if step else None,
            "step.order": step.order if step else None,
            "step.quadrant": step.quadrant if step else None,
            "step.timing": step.timing if step else None,
            "step.status": row.status,
            "step.calculated_date": row.calculated_date,
            "step.completed_at": row.completed_at,
            "step.actual_minutes": parse_duration_to_minutes(row.actual_time),
            "step.checked_document_count": checked_docs_map.get(row.id, 0),
            "step.required_unchecked_document_count": required_unchecked_map.get(row.id, 0),
            "step.is_overdue": overdue,
            "fund.name": fund.name if fund else None,
            "company.name": company.name if company else None,
            "investment.instrument": investment.instrument if investment else None,
        }
        item.update(apply_date_buckets(row.calculated_date, "step.calculated_date"))
        item.update(apply_date_buckets(row.completed_at, "step.completed_at"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="workflow_step",
    label="워크플로우 단계",
    description="단계 인스턴스 기준으로 병목, 문서 미체크, 지연 현황을 분석합니다.",
    grain_label="워크플로우 단계 1건",
    fields=[
        dimension("workflow.name", "워크플로우명", "string", "기본 차원"),
        dimension("workflow.category", "워크플로 카테고리", "string", "기본 차원"),
        dimension("workflow.instance_name", "인스턴스명", "string", "기본 차원"),
        dimension("step.name", "단계명", "string", "기본 차원"),
        dimension("step.order", "단계 순서", "number", "기본 차원"),
        dimension("step.quadrant", "사분면", "string", "기본 차원"),
        dimension("step.status", "단계 상태", "string", "기본 차원"),
        dimension("fund.name", "조합명", "string", "연결 차원"),
        dimension("company.name", "회사명", "string", "연결 차원"),
        dimension("step.calculated_date.day", "예정일", "date", "날짜 파생"),
        dimension("step.calculated_date.year_month", "예정월", "string", "날짜 파생"),
        measure("step.actual_minutes", "실소요분", "number", "기본 지표"),
        measure("step.checked_document_count", "체크 문서 수", "number", "연결 지표", is_linked_measure=True),
        measure("step.required_unchecked_document_count", "미체크 필수 문서 수", "number", "연결 지표", is_linked_measure=True),
        measure("step.is_overdue", "지연 단계 수", "number", "기본 지표", aggregates=["sum", "count"], default_aggregate="sum"),
    ],
    default_table_fields=[
        "workflow.instance_name",
        "step.name",
        "step.order",
        "step.status",
        "step.calculated_date.day",
        "step.required_unchecked_document_count",
    ],
    default_values=[
        {"key": "step.is_overdue", "aggregate": "sum"},
        {"key": "step.required_unchecked_document_count", "aggregate": "sum"},
    ],
    starter_views=[
        {
            "key": "workflow_bottleneck",
            "label": "워크플로 병목 단계 분석",
            "description": "템플릿별 단계 상태와 미체크 문서를 비교합니다.",
            "subject_key": "workflow_step",
            "config": {
                "subject_key": "workflow_step",
                "mode": "pivot",
                "rows": ["workflow.name"],
                "columns": ["step.status"],
                "values": [
                    {"key": "step.is_overdue", "aggregate": "sum"},
                    {"key": "step.required_unchecked_document_count", "aggregate": "sum"},
                ],
                "filters": [],
                "sorts": [{"field": "step.is_overdue", "direction": "desc"}],
                "options": {"show_subtotals": True, "show_grand_totals": True, "hide_empty": False, "hide_zero": False, "row_limit": 200, "column_limit": 50},
            },
        }
    ],
    load_rows=load_rows,
)

