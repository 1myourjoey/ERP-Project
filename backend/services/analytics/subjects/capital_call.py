from __future__ import annotations

from models.phase3 import CapitalCall
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db)
    rows = db.query(CapitalCall).all()
    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id)
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "call.type": row.call_type,
            "call.call_date": row.call_date,
            "call.amount": float(row.total_amount or 0),
            "call.request_percent": float(row.request_percent or 0),
        }
        item.update(apply_date_buckets(row.call_date, "call.call_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="capital_call",
    label="자본 호출",
    description="자본 호출 일정과 금액을 분석합니다.",
    grain_label="자본 호출 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("call.type", "호출 유형", "string", "기본 차원"),
        dimension("call.call_date.day", "호출일", "date", "날짜 파생"),
        dimension("call.call_date.year_month", "호출월", "string", "날짜 파생"),
        measure("call.amount", "호출 금액", "number", "기본 지표"),
        measure("call.request_percent", "호출 비율(%)", "number", "기본 지표", default_aggregate="avg"),
    ],
    default_table_fields=["fund.name", "call.call_date.day", "call.type", "call.amount", "call.request_percent"],
    default_values=[{"key": "call.amount", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)
