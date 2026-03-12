from __future__ import annotations

from datetime import date

from models.compliance import ComplianceObligation, ComplianceRule
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db, include={"company", "fund", "investment"})
    rules = {row.id: row for row in db.query(ComplianceRule).all()}
    rows = db.query(ComplianceObligation).all()
    today = date.today()
    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id)
        investment = refs["investment"].get(row.investment_id) if row.investment_id else None
        company = refs["company"].get(investment.company_id) if investment else None
        rule = rules.get(row.rule_id)
        overdue = row.status == "overdue" or bool(row.due_date and row.due_date < today and row.status != "completed")
        completed = row.status == "completed"
        waived = row.status == "waived"
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "company.name": company.name if company else None,
            "rule.code": rule.rule_code if rule else None,
            "rule.title": rule.title if rule else None,
            "rule.category": rule.category if rule else None,
            "rule.subcategory": rule.subcategory if rule else None,
            "obligation.status": row.status,
            "obligation.period_type": row.period_type,
            "obligation.due_date": row.due_date,
            "obligation.completed_date": row.completed_date,
            "obligation.completed_by": row.completed_by,
            "obligation.is_overdue": overdue,
            "obligation.is_completed": completed,
            "obligation.is_waived": waived,
        }
        item.update(apply_date_buckets(row.due_date, "obligation.due_date"))
        item.update(apply_date_buckets(row.completed_date, "obligation.completed_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="compliance_obligation",
    label="컴플라이언스 의무",
    description="펀드/투자 단위의 의무사항과 마감 상태를 분석합니다.",
    grain_label="의무 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("company.name", "회사명", "string", "연결 차원"),
        dimension("rule.code", "규칙코드", "string", "기본 차원"),
        dimension("rule.title", "규칙명", "string", "기본 차원"),
        dimension("rule.category", "규칙 카테고리", "string", "기본 차원"),
        dimension("rule.subcategory", "세부 카테고리", "string", "기본 차원"),
        dimension("obligation.status", "의무 상태", "string", "기본 차원"),
        dimension("obligation.period_type", "주기", "string", "기본 차원"),
        dimension("obligation.due_date.day", "마감일", "date", "날짜 파생"),
        dimension("obligation.due_date.year_month", "마감월", "string", "날짜 파생"),
        measure("obligation.is_overdue", "지연 의무 수", "number", "기본 지표", aggregates=["sum", "count"], default_aggregate="sum"),
        measure("obligation.is_completed", "완료 의무 수", "number", "기본 지표", aggregates=["sum", "count"], default_aggregate="sum"),
        measure("obligation.is_waived", "면제 의무 수", "number", "기본 지표", aggregates=["sum", "count"], default_aggregate="sum"),
    ],
    default_table_fields=[
        "fund.name",
        "rule.title",
        "obligation.status",
        "obligation.due_date.day",
        "company.name",
    ],
    default_values=[
        {"key": "obligation.is_overdue", "aggregate": "sum"},
        {"key": "obligation.is_completed", "aggregate": "sum"},
    ],
    starter_views=[
        {
            "key": "compliance_due_overview",
            "label": "컴플라이언스 의무/문서 기한 현황",
            "description": "조합별 의무 상태와 지연 건수를 비교합니다.",
            "subject_key": "compliance_obligation",
            "config": {
                "subject_key": "compliance_obligation",
                "mode": "pivot",
                "rows": ["fund.name"],
                "columns": ["obligation.status"],
                "values": [
                    {"key": "obligation.is_overdue", "aggregate": "sum"},
                    {"key": "obligation.is_completed", "aggregate": "sum"},
                ],
                "filters": [],
                "sorts": [{"field": "obligation.is_overdue", "direction": "desc"}],
                "options": {"show_subtotals": True, "show_grand_totals": True, "hide_empty": False, "hide_zero": False, "row_limit": 200, "column_limit": 50},
            },
        }
    ],
    load_rows=load_rows,
)

