from __future__ import annotations

from models.transaction import Transaction
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db, include={"company", "fund", "investment"})
    rows = db.query(Transaction).all()
    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id)
        company = refs["company"].get(row.company_id)
        investment = refs["investment"].get(row.investment_id)
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "company.name": company.name if company else None,
            "company.industry": company.industry if company else None,
            "transaction.type": row.type,
            "transaction.subtype": row.transaction_subtype,
            "transaction.counterparty": row.counterparty,
            "transaction.date": row.transaction_date,
            "transaction.settlement_date": row.settlement_date,
            "transaction.amount": float(row.amount or 0),
            "transaction.shares_change": float(row.shares_change or 0),
            "transaction.balance_before": float(row.balance_before or 0),
            "transaction.balance_after": float(row.balance_after or 0),
            "transaction.realized_gain": float(row.realized_gain or 0),
            "transaction.cumulative_gain": float(row.cumulative_gain or 0),
            "investment.instrument": investment.instrument if investment else None,
            "investment.status": investment.status if investment else None,
        }
        item.update(apply_date_buckets(row.transaction_date, "transaction.date"))
        item.update(apply_date_buckets(row.settlement_date, "transaction.settlement_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="transaction",
    label="거래",
    description="거래 원장을 유형, 기간, 회사, 조합 기준으로 분석합니다.",
    grain_label="거래 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("company.name", "회사명", "string", "기본 차원"),
        dimension("company.industry", "산업", "string", "기본 차원"),
        dimension("transaction.type", "거래 유형", "string", "기본 차원"),
        dimension("transaction.subtype", "거래 세부유형", "string", "기본 차원"),
        dimension("transaction.counterparty", "거래상대방", "string", "기본 차원"),
        dimension("investment.instrument", "투자수단", "string", "기본 차원"),
        dimension("investment.status", "투자 상태", "string", "기본 차원"),
        dimension("transaction.date.day", "거래일", "date", "날짜 파생"),
        dimension("transaction.date.year_month", "거래월", "string", "날짜 파생"),
        measure("transaction.amount", "거래금액", "number", "기본 지표"),
        measure("transaction.shares_change", "주식변동", "number", "기본 지표"),
        measure("transaction.balance_before", "잔액(전)", "number", "기본 지표"),
        measure("transaction.balance_after", "잔액(후)", "number", "기본 지표"),
        measure("transaction.realized_gain", "실현손익", "number", "기본 지표"),
        measure("transaction.cumulative_gain", "누적손익", "number", "기본 지표"),
    ],
    default_table_fields=[
        "transaction.date.day",
        "fund.name",
        "company.name",
        "transaction.type",
        "transaction.amount",
        "transaction.realized_gain",
    ],
    default_values=[{"key": "transaction.amount", "aggregate": "sum"}],
    starter_views=[
        {
            "key": "transaction_cashflow",
            "label": "거래 유형별 자금 흐름",
            "description": "월별 거래 금액을 유형별로 분류합니다.",
            "subject_key": "transaction",
            "config": {
                "subject_key": "transaction",
                "mode": "pivot",
                "rows": ["transaction.date.year_month"],
                "columns": ["transaction.type"],
                "values": [{"key": "transaction.amount", "aggregate": "sum"}],
                "filters": [],
                "sorts": [{"field": "transaction.date.year_month", "direction": "asc"}],
                "options": {"show_subtotals": True, "show_grand_totals": True, "hide_empty": False, "hide_zero": False, "row_limit": 200, "column_limit": 50},
            },
        }
    ],
    load_rows=load_rows,
)

