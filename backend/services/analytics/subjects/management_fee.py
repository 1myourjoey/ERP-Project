from __future__ import annotations

from models.fee import ManagementFee
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db)
    rows = db.query(ManagementFee).all()
    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id)
        invoice_date = row.invoice_date
        payment_date = row.payment_date
        period_date = invoice_date or payment_date
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "fund.type": fund.type if fund else None,
            "fee.year": row.year,
            "fee.quarter": row.quarter,
            "fee.basis": row.fee_basis,
            "fee.status": row.status,
            "fee.rate": float(row.fee_rate or 0),
            "fee.basis_amount": float(row.basis_amount or 0),
            "fee.amount": float(row.fee_amount or 0),
            "fee.invoice_date": invoice_date,
            "fee.payment_date": payment_date,
            "fee.period": period_date,
        }
        item.update(apply_date_buckets(invoice_date, "fee.invoice_date"))
        item.update(apply_date_buckets(payment_date, "fee.payment_date"))
        item.update(apply_date_buckets(period_date, "fee.period"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="management_fee",
    label="관리보수",
    description="관리보수 청구와 납부 흐름을 조합 기준으로 분석합니다.",
    grain_label="관리보수 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("fund.type", "조합 유형", "string", "기본 차원"),
        dimension("fee.basis", "산정 기준", "string", "기본 차원"),
        dimension("fee.status", "상태", "string", "기본 차원"),
        dimension("fee.year", "연도", "number", "날짜 파생"),
        dimension("fee.quarter", "분기", "number", "날짜 파생"),
        dimension("fee.invoice_date.day", "청구일", "date", "날짜 파생"),
        dimension("fee.invoice_date.year_month", "청구월", "string", "날짜 파생"),
        dimension("fee.payment_date.day", "납부일", "date", "날짜 파생"),
        dimension("fee.period.year_month", "기준월", "string", "날짜 파생"),
        measure("fee.rate", "보수율", "number", "기본 지표", default_aggregate="avg"),
        measure("fee.basis_amount", "산정 금액", "number", "기본 지표"),
        measure("fee.amount", "관리보수", "number", "기본 지표"),
    ],
    default_table_fields=[
        "fund.name",
        "fee.year",
        "fee.quarter",
        "fee.status",
        "fee.invoice_date.day",
        "fee.amount",
    ],
    default_values=[{"key": "fee.amount", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)
