from __future__ import annotations

from models.investment import Investment
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import (
    active_workflow_counts_by_investment,
    compliance_counts_by_investment,
    latest_valuation_by_investment,
    load_reference_maps,
    open_task_counts_by_investment,
    overdue_document_counts_by_investment,
    realized_gain_by_investment,
    transaction_counts_by_investment,
)


def load_rows(db):
    refs = load_reference_maps(db, include={"company", "fund"})
    investments = db.query(Investment).all()
    latest_valuation_map = latest_valuation_by_investment(db)
    workflow_counts = active_workflow_counts_by_investment(db)
    task_counts = open_task_counts_by_investment(db)
    compliance_counts = compliance_counts_by_investment(db)
    overdue_docs = overdue_document_counts_by_investment(db)
    transaction_counts = transaction_counts_by_investment(db)
    realized_gain_map = realized_gain_by_investment(db)

    result = []
    for row in investments:
        fund = refs["fund"].get(row.fund_id)
        company = refs["company"].get(row.company_id)
        latest_valuation = latest_valuation_map.get(row.id)
        latest_value = float(getattr(latest_valuation, "total_fair_value", None) or getattr(latest_valuation, "value", 0) or 0)
        unrealized = float(getattr(latest_valuation, "unrealized_gain_loss", 0) or 0)
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "fund.type": fund.type if fund else None,
            "company.name": company.name if company else None,
            "company.industry": company.industry if company else None,
            "company.analyst": company.analyst if company else None,
            "investment.status": row.status,
            "investment.instrument": row.instrument,
            "investment.round": row.round,
            "investment.amount": float(row.amount or 0),
            "investment.shares": float(row.shares or 0),
            "investment.share_price": float(row.share_price or 0),
            "investment.valuation": float(row.valuation or 0),
            "investment.valuation_pre": float(row.valuation_pre or 0),
            "investment.valuation_post": float(row.valuation_post or 0),
            "investment.ownership_pct": float(row.ownership_pct or 0),
            "investment.board_seat": row.board_seat,
            "investment.investment_date": row.investment_date,
            "investment.transaction_count": transaction_counts.get(row.id, 0),
            "investment.realized_gain": realized_gain_map.get(row.id, 0.0),
            "investment.latest_valuation": latest_value,
            "investment.unrealized_gain_loss": unrealized,
            "investment.active_workflow_count": workflow_counts.get(row.id, 0),
            "investment.open_task_count": task_counts.get(row.id, 0),
            "investment.compliance_count": compliance_counts.get(row.id, 0),
            "investment.overdue_document_count": overdue_docs.get(row.id, 0),
        }
        item.update(apply_date_buckets(row.investment_date, "investment.investment_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="investment",
    label="투자",
    description="투자 원장 기준으로 회사, 평가, 업무, 문서, 워크플로를 함께 분석합니다.",
    grain_label="투자 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("fund.type", "펀드 유형", "string", "기본 차원"),
        dimension("company.name", "회사명", "string", "기본 차원"),
        dimension("company.industry", "산업", "string", "기본 차원"),
        dimension("company.analyst", "담당 심사역", "string", "기본 차원"),
        dimension("investment.status", "투자 상태", "string", "기본 차원"),
        dimension("investment.instrument", "투자수단", "string", "기본 차원"),
        dimension("investment.round", "라운드", "string", "기본 차원"),
        dimension("investment.board_seat", "이사회석 여부", "string", "기본 차원"),
        dimension("investment.investment_date.day", "투자일", "date", "날짜 파생"),
        dimension("investment.investment_date.year_month", "투자월", "string", "날짜 파생"),
        dimension("investment.investment_date.year_quarter", "투자분기", "string", "날짜 파생"),
        measure("investment.amount", "투자금액", "number", "기본 지표"),
        measure("investment.shares", "주식수", "number", "기본 지표"),
        measure("investment.share_price", "주당단가", "number", "기본 지표", default_aggregate="avg"),
        measure("investment.valuation", "초기 밸류에이션", "number", "기본 지표"),
        measure("investment.valuation_pre", "투자 전 기업가치", "number", "기본 지표"),
        measure("investment.valuation_post", "투자 후 기업가치", "number", "기본 지표"),
        measure("investment.ownership_pct", "지분율(%)", "number", "기본 지표", default_aggregate="avg"),
        measure("investment.transaction_count", "거래 건수", "number", "연결 지표", is_linked_measure=True),
        measure("investment.realized_gain", "실현손익", "number", "연결 지표", is_linked_measure=True),
        measure("investment.latest_valuation", "최신 평가금액", "number", "연결 지표", is_linked_measure=True),
        measure("investment.unrealized_gain_loss", "미실현손익", "number", "연결 지표", is_linked_measure=True),
        measure("investment.active_workflow_count", "진행 워크플로 수", "number", "연결 지표", is_linked_measure=True),
        measure("investment.open_task_count", "미완료 업무 수", "number", "연결 지표", is_linked_measure=True),
        measure("investment.compliance_count", "연결 의무 수", "number", "연결 지표", is_linked_measure=True),
        measure("investment.overdue_document_count", "지연 문서 수", "number", "연결 지표", is_linked_measure=True),
    ],
    default_table_fields=[
        "fund.name",
        "company.name",
        "company.industry",
        "investment.instrument",
        "investment.amount",
        "investment.latest_valuation",
        "investment.open_task_count",
        "investment.overdue_document_count",
    ],
    default_values=[
        {"key": "investment.amount", "aggregate": "sum"},
        {"key": "investment.latest_valuation", "aggregate": "sum"},
    ],
    starter_views=[],
    load_rows=load_rows,
)

