from __future__ import annotations

from models.valuation import Valuation
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db, include={"company", "fund", "investment"})
    rows = db.query(Valuation).all()
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
            "valuation.as_of_date": row.as_of_date,
            "valuation.method": row.method or row.valuation_method,
            "valuation.instrument": row.instrument or row.instrument_type,
            "valuation.evaluator": row.evaluator,
            "valuation.value": float(row.value or 0),
            "valuation.prev_value": float(row.prev_value or 0),
            "valuation.change_amount": float(row.change_amount or 0),
            "valuation.change_pct": float(row.change_pct or 0),
            "valuation.total_fair_value": float(row.total_fair_value or 0),
            "valuation.book_value": float(row.book_value or 0),
            "valuation.unrealized_gain_loss": float(row.unrealized_gain_loss or 0),
            "investment.instrument": investment.instrument if investment else None,
            "investment.status": investment.status if investment else None,
        }
        item.update(apply_date_buckets(row.as_of_date, "valuation.as_of_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="valuation",
    label="평가",
    description="평가 이력과 변동폭을 조합/회사 기준으로 분석합니다.",
    grain_label="평가 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("company.name", "회사명", "string", "기본 차원"),
        dimension("company.industry", "산업", "string", "기본 차원"),
        dimension("valuation.method", "평가방법", "string", "기본 차원"),
        dimension("valuation.instrument", "상품구분", "string", "기본 차원"),
        dimension("valuation.evaluator", "평가자", "string", "기본 차원"),
        dimension("valuation.as_of_date.day", "기준일", "date", "날짜 파생"),
        dimension("valuation.as_of_date.year_month", "기준월", "string", "날짜 파생"),
        measure("valuation.value", "평가금액", "number", "기본 지표"),
        measure("valuation.prev_value", "이전 평가금액", "number", "기본 지표"),
        measure("valuation.change_amount", "평가변동액", "number", "기본 지표"),
        measure("valuation.change_pct", "평가변동률(%)", "number", "기본 지표", default_aggregate="avg"),
        measure("valuation.total_fair_value", "공정가치 총액", "number", "기본 지표"),
        measure("valuation.book_value", "장부가치", "number", "기본 지표"),
        measure("valuation.unrealized_gain_loss", "미실현손익", "number", "기본 지표"),
    ],
    default_table_fields=[
        "valuation.as_of_date.day",
        "fund.name",
        "company.name",
        "valuation.method",
        "valuation.value",
        "valuation.change_amount",
        "valuation.change_pct",
    ],
    default_values=[{"key": "valuation.value", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)

