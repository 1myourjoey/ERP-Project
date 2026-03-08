from __future__ import annotations

from datetime import date

from models.regular_report import RegularReport
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db)
    rows = db.query(RegularReport).all()
    today = date.today()
    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id) if row.fund_id else None
        due_date = row.due_date
        submitted_date = row.submitted_date
        is_submitted = bool(submitted_date)
        is_overdue = bool(due_date and due_date < today and not is_submitted)
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "report.target": row.report_target,
            "report.period": row.period,
            "report.status": row.status,
            "report.due_date": due_date,
            "report.submitted_date": submitted_date,
            "report.is_submitted": is_submitted,
            "report.is_overdue": is_overdue,
        }
        item.update(apply_date_buckets(due_date, "report.due_date"))
        item.update(apply_date_buckets(submitted_date, "report.submitted_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="regular_report",
    label="정기보고",
    description="정기보고의 제출 일정과 상태를 분석합니다.",
    grain_label="정기보고 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("report.target", "보고 대상", "string", "기본 차원"),
        dimension("report.period", "보고 기간", "string", "기본 차원"),
        dimension("report.status", "상태", "string", "기본 차원"),
        dimension("report.due_date.day", "마감일", "date", "날짜 파생"),
        dimension("report.due_date.year_month", "마감월", "string", "날짜 파생"),
        measure("report.is_submitted", "제출 건수", "number", "기본 지표", aggregates=["sum", "count"], default_aggregate="sum"),
        measure("report.is_overdue", "지연 건수", "number", "기본 지표", aggregates=["sum", "count"], default_aggregate="sum"),
    ],
    default_table_fields=[
        "fund.name",
        "report.target",
        "report.period",
        "report.status",
        "report.due_date.day",
    ],
    default_values=[{"key": "__row_count", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)
