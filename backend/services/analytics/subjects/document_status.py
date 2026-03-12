from __future__ import annotations

from datetime import date

from models.investment import InvestmentDocument
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db, include={"company", "fund", "investment"})
    rows = db.query(InvestmentDocument).all()
    today = date.today()
    result = []
    for row in rows:
        investment = refs["investment"].get(row.investment_id)
        if investment is None:
            continue
        fund = refs["fund"].get(investment.fund_id)
        company = refs["company"].get(investment.company_id)
        due_date = row.due_date
        days_remaining = (due_date - today).days if due_date else None
        overdue = bool(due_date and due_date < today and row.status != "completed")
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "company.name": company.name if company else None,
            "company.industry": company.industry if company else None,
            "document.name": row.name,
            "document.type": row.doc_type,
            "document.status": row.status,
            "document.note": row.note,
            "document.due_date": due_date,
            "document.days_remaining": days_remaining,
            "document.is_overdue": overdue,
            "investment.instrument": investment.instrument,
        }
        item.update(apply_date_buckets(due_date, "document.due_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="document_status",
    label="문서 상태",
    description="투자 문서별 상태, 기한, 회사/펀드 연결을 분석합니다.",
    grain_label="문서 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("company.name", "회사명", "string", "기본 차원"),
        dimension("company.industry", "산업", "string", "기본 차원"),
        dimension("document.name", "문서명", "string", "기본 차원"),
        dimension("document.type", "문서 유형", "string", "기본 차원"),
        dimension("document.status", "문서 상태", "string", "기본 차원"),
        dimension("investment.instrument", "투자수단", "string", "연결 차원"),
        dimension("document.due_date.day", "기한", "date", "날짜 파생"),
        dimension("document.due_date.year_month", "기한월", "string", "날짜 파생"),
        measure("document.days_remaining", "잔여일수", "number", "기본 지표", default_aggregate="avg"),
        measure("document.is_overdue", "지연 문서 수", "number", "기본 지표", aggregates=["sum", "count"], default_aggregate="sum"),
    ],
    default_table_fields=[
        "fund.name",
        "company.name",
        "document.name",
        "document.type",
        "document.status",
        "document.due_date.day",
        "document.days_remaining",
    ],
    default_values=[{"key": "document.is_overdue", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)

