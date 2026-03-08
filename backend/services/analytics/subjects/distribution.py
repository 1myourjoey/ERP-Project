from __future__ import annotations

from models.phase3 import Distribution
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db)
    rows = db.query(Distribution).all()
    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id)
        principal_total = float(row.principal_total or 0)
        profit_total = float(row.profit_total or 0)
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "distribution.type": row.dist_type,
            "distribution.date": row.dist_date,
            "distribution.principal_total": principal_total,
            "distribution.profit_total": profit_total,
            "distribution.performance_fee": float(row.performance_fee or 0),
            "distribution.total_amount": principal_total + profit_total,
        }
        item.update(apply_date_buckets(row.dist_date, "distribution.date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="distribution",
    label="분배",
    description="분배 금액과 성격을 월 단위로 분석합니다.",
    grain_label="분배 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("distribution.type", "분배 유형", "string", "기본 차원"),
        dimension("distribution.date.day", "분배일", "date", "날짜 파생"),
        dimension("distribution.date.year_month", "분배월", "string", "날짜 파생"),
        measure("distribution.principal_total", "원금 분배", "number", "기본 지표"),
        measure("distribution.profit_total", "수익 분배", "number", "기본 지표"),
        measure("distribution.performance_fee", "성과보수", "number", "기본 지표"),
        measure("distribution.total_amount", "분배 총액", "number", "기본 지표"),
    ],
    default_table_fields=["fund.name", "distribution.date.day", "distribution.type", "distribution.total_amount"],
    default_values=[{"key": "distribution.total_amount", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)
