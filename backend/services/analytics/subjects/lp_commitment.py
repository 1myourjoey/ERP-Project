from __future__ import annotations

from models.fund import LP
from services.lp_types import normalize_lp_type, normalize_lp_type_group
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db, include={"fund", "lp"})
    lps = db.query(LP).all()
    result = []
    for row in lps:
        fund = refs["fund"].get(row.fund_id)
        commitment = float(row.commitment or 0)
        paid_in = float(row.paid_in or 0)
        paid_in_rate = round((paid_in / commitment) * 100, 2) if commitment else None
        item = {
            "id": row.id,
            "lp.id": row.id,
            "lp.name": row.name,
            "lp.type": normalize_lp_type(row.type) or row.type,
            "lp.type_group": normalize_lp_type_group(row.type) or row.type,
            "lp.contact": row.contact,
            "lp.business_number": row.business_number,
            "lp.address": row.address,
            "lp.commitment": commitment,
            "lp.paid_in": paid_in,
            "lp.paid_in_rate": paid_in_rate,
            "lp.fund_id": row.fund_id,
            "fund.name": fund.name if fund else None,
            "fund.type": fund.type if fund else None,
            "fund.status": fund.status if fund else None,
            "fund.formation_date": fund.formation_date if fund else None,
        }
        item.update(apply_date_buckets(fund.formation_date if fund else None, "fund.formation_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="lp_commitment",
    label="LP 약정",
    description="펀드 내 LP별 약정과 납입 현황을 분석합니다.",
    grain_label="LP 참여 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("fund.type", "펀드 유형", "string", "기본 차원"),
        dimension("fund.status", "조합 상태", "string", "기본 차원"),
        dimension("lp.name", "LP명", "string", "기본 차원"),
        dimension("lp.type", "LP 유형", "string", "기본 차원"),
        dimension("lp.type_group", "LP 상위유형", "string", "기본 차원"),
        dimension("lp.contact", "담당자", "string", "기본 차원"),
        dimension("lp.business_number", "사업자번호", "string", "기본 차원"),
        dimension("fund.formation_date.year", "결성연도", "number", "날짜 파생"),
        measure("lp.commitment", "약정액", "number", "기본 지표"),
        measure("lp.paid_in", "납입액", "number", "기본 지표"),
        measure("lp.paid_in_rate", "납입률(%)", "number", "기본 지표", default_aggregate="avg"),
    ],
    default_table_fields=["fund.name", "lp.name", "lp.type", "lp.commitment", "lp.paid_in", "lp.paid_in_rate"],
    default_values=[
        {"key": "lp.commitment", "aggregate": "sum"},
        {"key": "lp.paid_in", "aggregate": "sum"},
        {"key": "lp.paid_in_rate", "aggregate": "avg"},
    ],
    starter_views=[
        {
            "key": "lp_commitment_matrix",
            "label": "LP 약정·납입 분석",
            "description": "조합과 LP 유형별 약정 및 납입률을 비교합니다.",
            "subject_key": "lp_commitment",
            "config": {
                "subject_key": "lp_commitment",
                "mode": "pivot",
                "rows": ["fund.name"],
                "columns": ["lp.type"],
                "values": [
                    {"key": "lp.commitment", "aggregate": "sum"},
                    {"key": "lp.paid_in", "aggregate": "sum"},
                    {"key": "lp.paid_in_rate", "aggregate": "avg"},
                ],
                "filters": [],
                "sorts": [{"field": "lp.commitment", "direction": "desc"}],
                "options": {"show_subtotals": True, "show_grand_totals": True, "hide_empty": False, "hide_zero": False, "row_limit": 200, "column_limit": 50},
            },
        }
    ],
    load_rows=load_rows,
)

