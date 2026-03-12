from __future__ import annotations

from sqlalchemy import func

from models.fund import Fund
from models.fund import LP
from models.investment import Investment
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import (
    active_workflow_counts_by_fund,
    compliance_counts_by_fund,
    latest_valuation_totals_by_fund,
    open_task_counts_by_fund,
    overdue_document_counts_by_fund,
    overdue_task_counts_by_fund,
)


def load_rows(db):
    funds = db.query(Fund).all()
    lp_rows = (
        db.query(
            LP.fund_id,
            func.count(LP.id),
            func.coalesce(func.sum(LP.commitment), 0),
            func.coalesce(func.sum(LP.paid_in), 0),
        )
        .group_by(LP.fund_id)
        .all()
    )
    lp_count_map = {int(fund_id): int(count or 0) for fund_id, count, _, _ in lp_rows}
    commitment_map = {int(fund_id): float(total_commitment or 0) for fund_id, _, total_commitment, _ in lp_rows}
    paid_in_map = {int(fund_id): float(total_paid_in or 0) for fund_id, _, _, total_paid_in in lp_rows}

    investment_rows = (
        db.query(
            Investment.fund_id,
            func.count(Investment.id),
            func.coalesce(func.sum(Investment.amount), 0),
        )
        .group_by(Investment.fund_id)
        .all()
    )
    investment_count_map = {int(fund_id): int(count or 0) for fund_id, count, _ in investment_rows}
    invested_amount_map = {int(fund_id): float(total_amount or 0) for fund_id, _, total_amount in investment_rows}

    workflow_map = active_workflow_counts_by_fund(db)
    task_map = open_task_counts_by_fund(db)
    overdue_task_map = overdue_task_counts_by_fund(db)
    open_compliance_map, overdue_compliance_map = compliance_counts_by_fund(db)
    overdue_documents_map = overdue_document_counts_by_fund(db)
    nav_map = latest_valuation_totals_by_fund(db)

    result = []
    for fund in funds:
        commitment_total = float(fund.commitment_total or commitment_map.get(fund.id, 0.0) or 0)
        paid_in_total = float(paid_in_map.get(fund.id, 0.0))
        contribution_rate = round((paid_in_total / commitment_total) * 100, 2) if commitment_total else None
        row = {
            "id": fund.id,
            "fund.id": fund.id,
            "fund.name": fund.name,
            "fund.type": fund.type,
            "fund.status": fund.status,
            "fund.gp": fund.gp,
            "fund.manager": fund.fund_manager,
            "fund.co_gp": fund.co_gp,
            "fund.trustee": fund.trustee,
            "fund.commitment_total": commitment_total,
            "fund.paid_in_total": paid_in_total,
            "fund.gp_commitment": float(fund.gp_commitment or 0),
            "fund.aum": float(fund.aum or 0),
            "fund.estimated_nav": float(nav_map.get(fund.id, 0.0)),
            "fund.contribution_rate": contribution_rate,
            "fund.lp_count": lp_count_map.get(fund.id, 0),
            "fund.investment_count": investment_count_map.get(fund.id, 0),
            "fund.invested_amount": invested_amount_map.get(fund.id, 0.0),
            "fund.active_workflow_count": workflow_map.get(fund.id, 0),
            "fund.pending_task_count": task_map.get(fund.id, 0),
            "fund.overdue_task_count": overdue_task_map.get(fund.id, 0),
            "fund.open_compliance_count": open_compliance_map.get(fund.id, 0),
            "fund.overdue_compliance_count": overdue_compliance_map.get(fund.id, 0),
            "fund.overdue_document_count": overdue_documents_map.get(fund.id, 0),
            "fund.formation_date": fund.formation_date,
            "fund.investment_period_end": fund.investment_period_end,
            "fund.maturity_date": fund.maturity_date,
        }
        row.update(apply_date_buckets(fund.formation_date, "fund.formation_date"))
        row.update(apply_date_buckets(fund.investment_period_end, "fund.investment_period_end"))
        row.update(apply_date_buckets(fund.maturity_date, "fund.maturity_date"))
        result.append(row)
    return result


DEFINITION = SubjectDefinition(
    key="fund_master",
    label="펀드 마스터",
    description="조합 단위의 운용, 납입, 투자, 업무, 컴플라이언스 상태를 함께 분석합니다.",
    grain_label="펀드 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("fund.type", "펀드 유형", "string", "기본 차원"),
        dimension("fund.status", "상태", "string", "기본 차원"),
        dimension("fund.gp", "GP", "string", "기본 차원"),
        dimension("fund.manager", "운용책임자", "string", "기본 차원"),
        dimension("fund.co_gp", "Co-GP", "string", "기본 차원"),
        dimension("fund.trustee", "수탁사", "string", "기본 차원"),
        dimension("fund.formation_date.day", "결성일", "date", "날짜 파생"),
        dimension("fund.formation_date.year", "결성연도", "number", "날짜 파생"),
        dimension("fund.formation_date.year_quarter", "결성분기", "string", "날짜 파생"),
        dimension("fund.maturity_date.day", "만기일", "date", "날짜 파생"),
        measure("fund.commitment_total", "총 약정액", "number", "기본 지표"),
        measure("fund.paid_in_total", "총 납입액", "number", "기본 지표"),
        measure("fund.contribution_rate", "납입률(%)", "number", "기본 지표", default_aggregate="avg"),
        measure("fund.aum", "AUM", "number", "기본 지표"),
        measure("fund.estimated_nav", "추정 순자산가치(NAV)", "number", "기본 지표"),
        measure("fund.lp_count", "LP 수", "number", "연결 지표", is_linked_measure=True),
        measure("fund.investment_count", "투자 건수", "number", "연결 지표", is_linked_measure=True),
        measure("fund.invested_amount", "누적 투자금액", "number", "연결 지표", is_linked_measure=True),
        measure("fund.active_workflow_count", "진행 워크플로 수", "number", "연결 지표", is_linked_measure=True),
        measure("fund.pending_task_count", "미완료 업무 수", "number", "연결 지표", is_linked_measure=True),
        measure("fund.overdue_task_count", "지연 업무 수", "number", "연결 지표", is_linked_measure=True),
        measure("fund.open_compliance_count", "미완료 의무 수", "number", "연결 지표", is_linked_measure=True),
        measure("fund.overdue_compliance_count", "지연 의무 수", "number", "연결 지표", is_linked_measure=True),
        measure("fund.overdue_document_count", "지연 문서 수", "number", "연결 지표", is_linked_measure=True),
    ],
    default_table_fields=[
        "fund.name",
        "fund.type",
        "fund.status",
        "fund.commitment_total",
        "fund.paid_in_total",
        "fund.contribution_rate",
        "fund.active_workflow_count",
        "fund.pending_task_count",
        "fund.estimated_nav",
    ],
    default_values=[
        {"key": "fund.commitment_total", "aggregate": "sum"},
        {"key": "fund.paid_in_total", "aggregate": "sum"},
        {"key": "fund.estimated_nav", "aggregate": "sum"},
    ],
    starter_views=[
        {
            "key": "fund_master_overview",
            "label": "펀드별 투자·평가 현황",
            "description": "조합별 약정, 납입, 추정 NAV를 한 번에 확인합니다.",
            "subject_key": "fund_master",
            "config": {
                "subject_key": "fund_master",
                "mode": "pivot",
                "rows": ["fund.name"],
                "columns": ["fund.status"],
                "values": [
                    {"key": "fund.commitment_total", "aggregate": "sum"},
                    {"key": "fund.paid_in_total", "aggregate": "sum"},
                    {"key": "fund.estimated_nav", "aggregate": "sum"},
                ],
                "filters": [],
                "sorts": [{"field": "fund.commitment_total", "direction": "desc"}],
                "options": {"show_subtotals": True, "show_grand_totals": True, "hide_empty": False, "hide_zero": False, "row_limit": 200, "column_limit": 50},
            },
        }
    ],
    load_rows=load_rows,
)

