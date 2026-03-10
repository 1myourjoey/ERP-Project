from __future__ import annotations

from datetime import date

from models.lp_contribution import LPContribution
from services.lp_types import normalize_lp_type, normalize_lp_type_group
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db)
    rows = db.query(LPContribution).all()
    today = date.today()
    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id)
        lp = refs["lp"].get(row.lp_id)
        is_paid = row.actual_paid_date is not None
        outstanding = 0.0 if is_paid else float(row.amount or 0)
        delay_days = (today - row.due_date).days if row.due_date and not is_paid and row.due_date < today else 0
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "fund.type": fund.type if fund else None,
            "lp.name": lp.name if lp else None,
            "lp.type": normalize_lp_type(lp.type) if lp else None,
            "lp.type_group": normalize_lp_type_group(lp.type) if lp else None,
            "contribution.amount": float(row.amount or 0),
            "contribution.commitment_ratio": float(row.commitment_ratio or 0),
            "contribution.round_no": row.round_no,
            "contribution.source": row.source,
            "contribution.status": "paid" if is_paid else ("overdue" if delay_days > 0 else "pending"),
            "contribution.outstanding_amount": outstanding,
            "contribution.delay_days": delay_days,
            "contribution.due_date": row.due_date,
            "contribution.actual_paid_date": row.actual_paid_date,
        }
        item.update(apply_date_buckets(row.due_date, "contribution.due_date"))
        item.update(apply_date_buckets(row.actual_paid_date, "contribution.actual_paid_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="lp_contribution",
    label="LP 납입 이력",
    description="LP 출자 요청 및 실제 납입 흐름을 회차와 마감 기준으로 분석합니다.",
    grain_label="LP 납입 예정/실제 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("lp.name", "LP명", "string", "기본 차원"),
        dimension("lp.type", "LP 유형", "string", "기본 차원"),
        dimension("lp.type_group", "LP 상위유형", "string", "기본 차원"),
        dimension("contribution.source", "생성 출처", "string", "기본 차원"),
        dimension("contribution.status", "납입 상태", "string", "기본 차원"),
        dimension("contribution.round_no", "회차", "number", "기본 차원"),
        dimension("contribution.due_date.day", "납입기한", "date", "날짜 파생"),
        dimension("contribution.due_date.year_month", "납입기한 월", "string", "날짜 파생"),
        dimension("contribution.actual_paid_date.day", "실납입일", "date", "날짜 파생"),
        measure("contribution.amount", "요청금액", "number", "기본 지표"),
        measure("contribution.outstanding_amount", "미납금액", "number", "기본 지표"),
        measure("contribution.commitment_ratio", "약정대비 비율", "number", "기본 지표", default_aggregate="avg"),
        measure("contribution.delay_days", "지연일수", "number", "기본 지표", default_aggregate="avg"),
    ],
    default_table_fields=[
        "fund.name",
        "lp.name",
        "contribution.round_no",
        "contribution.status",
        "contribution.due_date.day",
        "contribution.amount",
        "contribution.outstanding_amount",
    ],
    default_values=[
        {"key": "contribution.amount", "aggregate": "sum"},
        {"key": "contribution.outstanding_amount", "aggregate": "sum"},
        {"key": "contribution.delay_days", "aggregate": "avg"},
    ],
    starter_views=[],
    load_rows=load_rows,
)

