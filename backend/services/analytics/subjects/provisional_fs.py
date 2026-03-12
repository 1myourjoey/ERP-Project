from __future__ import annotations

from datetime import date

from models.provisional_fs import ProvisionalFS
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db, include={"fund"})
    rows = db.query(ProvisionalFS).all()
    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id)
        period_date = None
        if row.year_month:
            try:
                period_date = date.fromisoformat(f"{row.year_month}-01")
            except ValueError:
                period_date = None
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "fund.type": fund.type if fund else None,
            "fs.period": period_date,
            "fs.period.year_month": row.year_month,
            "fs.status": row.status,
            "fs.total_assets": float(row.total_assets or 0),
            "fs.total_liabilities": float(row.total_liabilities or 0),
            "fs.total_equity": float(row.total_equity or 0),
            "fs.net_income": float(row.net_income or 0),
            "fs.confirmed_at": row.confirmed_at,
        }
        item.update(apply_date_buckets(period_date, "fs.period"))
        item.update(apply_date_buckets(row.confirmed_at, "fs.confirmed_at"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="provisional_fs",
    label="가결산",
    description="월별 가결산 상태와 핵심 재무 수치를 분석합니다.",
    grain_label="가결산 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("fund.type", "조합 유형", "string", "기본 차원"),
        dimension("fs.status", "상태", "string", "기본 차원"),
        dimension("fs.period.day", "기준일", "date", "날짜 파생"),
        dimension("fs.period.year_month", "기준월", "string", "날짜 파생"),
        dimension("fs.confirmed_at.day", "확정일", "date", "날짜 파생"),
        measure("fs.total_assets", "총자산", "number", "기본 지표"),
        measure("fs.total_liabilities", "총부채", "number", "기본 지표"),
        measure("fs.total_equity", "총자본", "number", "기본 지표"),
        measure("fs.net_income", "당기순이익", "number", "기본 지표"),
    ],
    default_table_fields=[
        "fund.name",
        "fs.period.year_month",
        "fs.status",
        "fs.total_assets",
        "fs.total_liabilities",
        "fs.total_equity",
        "fs.net_income",
    ],
    default_values=[{"key": "fs.total_assets", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)
