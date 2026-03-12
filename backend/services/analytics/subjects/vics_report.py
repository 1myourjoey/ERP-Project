from __future__ import annotations

from datetime import datetime

from models.vics_report import VicsMonthlyReport
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db, include={"fund"})
    rows = db.query(VicsMonthlyReport).all()
    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id)
        submitted_at = row.submitted_at
        period_dt = datetime(row.year, row.month, 1) if row.year and row.month else None
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "vics.report_code": row.report_code,
            "vics.status": row.status,
            "vics.year": row.year,
            "vics.month": row.month,
            "vics.submitted_at": submitted_at,
            "vics.confirmed_at": row.confirmed_at,
            "vics.period": period_dt,
            "vics.is_submitted": bool(submitted_at),
        }
        item.update(apply_date_buckets(period_dt, "vics.period"))
        item.update(apply_date_buckets(submitted_at, "vics.submitted_at"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="vics_report",
    label="VICS 보고",
    description="VICS 월간 보고 상태와 제출 현황을 분석합니다.",
    grain_label="VICS 보고 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("vics.report_code", "보고 코드", "string", "기본 차원"),
        dimension("vics.status", "상태", "string", "기본 차원"),
        dimension("vics.year", "연도", "number", "기본 차원"),
        dimension("vics.month", "월", "number", "기본 차원"),
        dimension("vics.period.year_month", "기준월", "string", "날짜 파생"),
        dimension("vics.submitted_at.day", "제출일", "date", "날짜 파생"),
        measure("vics.is_submitted", "제출 건수", "number", "기본 지표", aggregates=["sum", "count"], default_aggregate="sum"),
    ],
    default_table_fields=[
        "fund.name",
        "vics.report_code",
        "vics.status",
        "vics.period.year_month",
        "vics.submitted_at.day",
    ],
    default_values=[{"key": "__row_count", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)
