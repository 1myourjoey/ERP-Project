from __future__ import annotations

from models.phase3 import ExitTrade
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db, include={"company", "fund"})
    rows = db.query(ExitTrade).all()
    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id)
        company = refs["company"].get(row.company_id)
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "company.name": company.name if company else None,
            "exit.type": row.exit_type,
            "exit.trade_date": row.trade_date,
            "exit.settlement_status": row.settlement_status,
            "exit.amount": float(row.amount or 0),
            "exit.net_amount": float(row.net_amount or 0),
            "exit.realized_gain": float(row.realized_gain or 0),
            "exit.fees": float(row.fees or 0),
        }
        item.update(apply_date_buckets(row.trade_date, "exit.trade_date"))
        item.update(apply_date_buckets(row.settlement_date, "exit.settlement_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="exit_trade",
    label="회수 거래",
    description="회수 금액, 순유입, 실현손익을 분석합니다.",
    grain_label="회수 거래 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("company.name", "회사명", "string", "기본 차원"),
        dimension("exit.type", "회수 유형", "string", "기본 차원"),
        dimension("exit.settlement_status", "정산 상태", "string", "기본 차원"),
        dimension("exit.trade_date.day", "회수일", "date", "날짜 파생"),
        dimension("exit.trade_date.year_month", "회수월", "string", "날짜 파생"),
        measure("exit.amount", "회수 금액", "number", "기본 지표"),
        measure("exit.net_amount", "순유입", "number", "기본 지표"),
        measure("exit.realized_gain", "실현손익", "number", "기본 지표"),
        measure("exit.fees", "수수료", "number", "기본 지표"),
    ],
    default_table_fields=["fund.name", "company.name", "exit.trade_date.day", "exit.amount", "exit.realized_gain"],
    default_values=[{"key": "exit.amount", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)
