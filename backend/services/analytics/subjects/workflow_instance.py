from __future__ import annotations

from models.workflow_instance import WorkflowInstance, WorkflowStepInstance
from services.analytics.common import apply_date_buckets, parse_duration_to_minutes
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps, workflow_step_doc_stats


def load_rows(db):
    refs = load_reference_maps(db, include={"company", "fund", "investment", "user", "workflow", "workflow_step"})
    instances = db.query(WorkflowInstance).all()
    step_instances = db.query(WorkflowStepInstance).all()
    checked_docs_map, required_unchecked_map = workflow_step_doc_stats(db)

    steps_by_instance: dict[int, list[WorkflowStepInstance]] = {}
    for step in step_instances:
        steps_by_instance.setdefault(step.instance_id, []).append(step)

    result = []
    for row in instances:
        workflow = refs["workflow"].get(row.workflow_id)
        fund = refs["fund"].get(row.fund_id) if row.fund_id else None
        investment = refs["investment"].get(row.investment_id) if row.investment_id else None
        company = refs["company"].get(row.company_id) if row.company_id else None
        creator = refs["user"].get(row.created_by) if row.created_by else None
        steps = steps_by_instance.get(row.id, [])
        total_steps = len(steps)
        completed_steps = sum(1 for step in steps if step.status in {"completed", "skipped"})
        remaining_steps = sum(1 for step in steps if step.status not in {"completed", "skipped"})
        current_steps = [step for step in steps if step.status in {"pending", "in_progress"}]
        current_step = sorted(current_steps, key=lambda item: (item.calculated_date, item.id))[0] if current_steps else None
        checked_docs = sum(checked_docs_map.get(step.id, 0) for step in steps)
        required_unchecked = sum(required_unchecked_map.get(step.id, 0) for step in steps)
        progress_pct = round((completed_steps / total_steps) * 100, 2) if total_steps else 0.0
        item = {
            "id": row.id,
            "workflow.name": workflow.name if workflow else None,
            "workflow.category": workflow.category if workflow else None,
            "workflow.trigger_description": workflow.trigger_description if workflow else None,
            "workflow.instance_name": row.name,
            "workflow.status": row.status,
            "workflow.trigger_date": row.trigger_date,
            "workflow.completed_at": row.completed_at,
            "workflow.memo": row.memo,
            "workflow.current_step_name": refs["workflow_step"].get(current_step.workflow_step_id).name if current_step and refs["workflow_step"].get(current_step.workflow_step_id) else None,
            "workflow.total_step_count": total_steps,
            "workflow.completed_step_count": completed_steps,
            "workflow.remaining_step_count": remaining_steps,
            "workflow.progress_pct": progress_pct,
            "workflow.checked_document_count": checked_docs,
            "workflow.required_unchecked_document_count": required_unchecked,
            "fund.name": fund.name if fund else None,
            "company.name": company.name if company else None,
            "investment.instrument": investment.instrument if investment else None,
            "creator.name": creator.name if creator else None,
        }
        item.update(apply_date_buckets(row.trigger_date, "workflow.trigger_date"))
        item.update(apply_date_buckets(row.completed_at, "workflow.completed_at"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="workflow_instance",
    label="워크플로우 인스턴스",
    description="인스턴스 단위의 진행률, 현재 단계, 문서 체크 상태를 분석합니다.",
    grain_label="워크플로우 인스턴스 1건",
    fields=[
        dimension("workflow.name", "워크플로우명", "string", "기본 차원"),
        dimension("workflow.category", "카테고리", "string", "기본 차원"),
        dimension("workflow.instance_name", "인스턴스명", "string", "기본 차원"),
        dimension("workflow.status", "상태", "string", "기본 차원"),
        dimension("workflow.current_step_name", "현재 단계", "string", "기본 차원"),
        dimension("fund.name", "조합명", "string", "연결 차원"),
        dimension("company.name", "회사명", "string", "연결 차원"),
        dimension("investment.instrument", "투자수단", "string", "연결 차원"),
        dimension("creator.name", "생성자", "string", "연결 차원"),
        dimension("workflow.trigger_date.day", "트리거일", "date", "날짜 파생"),
        dimension("workflow.trigger_date.year_month", "트리거월", "string", "날짜 파생"),
        measure("workflow.total_step_count", "전체 단계 수", "number", "기본 지표"),
        measure("workflow.completed_step_count", "완료 단계 수", "number", "기본 지표"),
        measure("workflow.remaining_step_count", "남은 단계 수", "number", "기본 지표"),
        measure("workflow.progress_pct", "진행률(%)", "number", "기본 지표", default_aggregate="avg"),
        measure("workflow.checked_document_count", "체크 문서 수", "number", "연결 지표", is_linked_measure=True),
        measure("workflow.required_unchecked_document_count", "미체크 필수 문서 수", "number", "연결 지표", is_linked_measure=True),
    ],
    default_table_fields=[
        "workflow.instance_name",
        "workflow.name",
        "workflow.status",
        "workflow.current_step_name",
        "workflow.progress_pct",
        "workflow.required_unchecked_document_count",
        "fund.name",
    ],
    default_values=[{"key": "workflow.progress_pct", "aggregate": "avg"}],
    starter_views=[],
    load_rows=load_rows,
)

