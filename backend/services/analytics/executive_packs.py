from __future__ import annotations

from copy import deepcopy


DEFAULT_OPTIONS = {
    "show_subtotals": False,
    "show_grand_totals": True,
    "hide_empty": False,
    "hide_zero": False,
    "row_limit": 200,
    "column_limit": 50,
}


def _value(key: str, aggregate: str = "sum", alias: str | None = None) -> dict:
    item = {"key": key, "aggregate": aggregate}
    if alias:
        item["alias"] = alias
    return item


def _pivot_query(
    subject_key: str,
    *,
    rows: list[str] | None = None,
    columns: list[str] | None = None,
    values: list[dict] | None = None,
    filters: list[dict] | None = None,
    sorts: list[dict] | None = None,
    row_limit: int = 200,
    column_limit: int = 50,
):
    options = deepcopy(DEFAULT_OPTIONS)
    options["row_limit"] = row_limit
    options["column_limit"] = column_limit
    return {
        "subject_key": subject_key,
        "mode": "pivot",
        "rows": rows or [],
        "columns": columns or [],
        "values": values or [],
        "selected_fields": [],
        "filters": filters or [],
        "sorts": sorts or [],
        "options": options,
    }


def _table_query(
    subject_key: str,
    *,
    selected_fields: list[str],
    filters: list[dict] | None = None,
    sorts: list[dict] | None = None,
    row_limit: int = 24,
):
    options = deepcopy(DEFAULT_OPTIONS)
    options["row_limit"] = row_limit
    return {
        "subject_key": subject_key,
        "mode": "table",
        "rows": [],
        "columns": [],
        "values": [],
        "selected_fields": selected_fields,
        "filters": filters or [],
        "sorts": sorts or [],
        "options": options,
    }


def _card(
    key: str,
    title: str,
    description: str,
    subject_key: str,
    visual_type: str,
    query: dict,
    *,
    height: str = "md",
    fund_field: str | None = None,
    date_field: str | None = None,
):
    return {
        "key": key,
        "title": title,
        "description": description,
        "subject_key": subject_key,
        "visual_type": visual_type,
        "height": height,
        "query": query,
        "filter_binding": {
            "fund_field": fund_field,
            "date_field": date_field,
        },
        "direct_analysis_label": "직접 분석으로 열기",
    }


def _section(key: str, label: str, layout: str, cards: list[dict]):
    return {
        "key": key,
        "label": label,
        "layout": layout,
        "cards": cards,
    }


def build_executive_packs() -> list[dict]:
    funds_pack = {
        "key": "funds",
        "label": "펀드",
        "description": "펀드 운용 규모, 납입 진행, 운영 리스크를 한 번에 봅니다.",
        "sections": [
            _section(
                "fund-kpi",
                "핵심 지표",
                "kpi",
                [
                    _card(
                        "fund-scale-kpi",
                        "펀드 운용 규모",
                        "총 약정액, 총 납입액, 추정 NAV를 요약합니다.",
                        "fund_master",
                        "kpi",
                        _pivot_query(
                            "fund_master",
                            values=[
                                _value("fund.commitment_total", "sum", "commitment_total"),
                                _value("fund.paid_in_total", "sum", "paid_in_total"),
                                _value("fund.estimated_nav", "sum", "estimated_nav"),
                            ],
                        ),
                        height="sm",
                    ),
                    _card(
                        "fund-operating-kpi",
                        "운용 중 펀드 현황",
                        "펀드 수, LP 수, 투자 건수를 함께 봅니다.",
                        "fund_master",
                        "kpi",
                        _pivot_query(
                            "fund_master",
                            values=[
                                _value("__row_count", "sum", "fund_count"),
                                _value("fund.lp_count", "sum", "lp_count"),
                                _value("fund.investment_count", "sum", "investment_count"),
                            ],
                        ),
                        height="sm",
                    ),
                    _card(
                        "fund-risk-kpi",
                        "운영 리스크",
                        "지연 업무, 지연 의무, 지연 문서 건수를 묶어 봅니다.",
                        "fund_master",
                        "kpi",
                        _pivot_query(
                            "fund_master",
                            values=[
                                _value("fund.overdue_task_count", "sum", "overdue_tasks"),
                                _value("fund.overdue_compliance_count", "sum", "overdue_obligations"),
                                _value("fund.overdue_document_count", "sum", "overdue_documents"),
                            ],
                        ),
                        height="sm",
                    ),
                ],
            ),
            _section(
                "fund-grid",
                "운용 현황",
                "grid",
                [
                    _card(
                        "fund-status-share",
                        "펀드 상태 분포",
                        "운용 상태별 펀드 수를 도넛으로 보여줍니다.",
                        "fund_master",
                        "donut",
                        _pivot_query(
                            "fund_master",
                            rows=["fund.status"],
                            values=[_value("__row_count", "sum", "fund_count")],
                        ),
                    ),
                    _card(
                        "fund-contribution-rate",
                        "조합별 납입률",
                        "납입률이 낮은 조합부터 빠르게 확인합니다.",
                        "fund_master",
                        "ranked_bar",
                        _pivot_query(
                            "fund_master",
                            rows=["fund.name"],
                            values=[_value("fund.contribution_rate", "avg", "contribution_rate")],
                            sorts=[{"field": "contribution_rate", "direction": "asc"}],
                            row_limit=24,
                        ),
                        fund_field="fund.name",
                    ),
                    _card(
                        "fund-risk-stack",
                        "조합별 운영 리스크",
                        "업무, 의무, 문서 지연을 묶어 비교합니다.",
                        "fund_master",
                        "grouped_bar",
                        _pivot_query(
                            "fund_master",
                            rows=["fund.name"],
                            values=[
                                _value("fund.overdue_task_count", "sum", "overdue_tasks"),
                                _value("fund.overdue_compliance_count", "sum", "overdue_obligations"),
                                _value("fund.overdue_document_count", "sum", "overdue_documents"),
                            ],
                            row_limit=20,
                        ),
                        fund_field="fund.name",
                    ),
                    _card(
                        "fund-maturity-table",
                        "만기 도래 펀드",
                        "만기일과 투자기간 종료일이 가까운 펀드를 표로 봅니다.",
                        "fund_master",
                        "table",
                        _table_query(
                            "fund_master",
                            selected_fields=[
                                "fund.name",
                                "fund.status",
                                "fund.maturity_date.day",
                                "fund.pending_task_count",
                                "fund.overdue_document_count",
                            ],
                            sorts=[{"field": "fund.maturity_date.day", "direction": "asc"}],
                            row_limit=10,
                        ),
                        fund_field="fund.name",
                        date_field="fund.maturity_date.day",
                    ),
                ],
            ),
        ],
    }

    lp_pack = {
        "key": "lp-capital",
        "label": "LP/자본",
        "description": "약정, 납입, 미수 금액과 LP 집중도를 확인합니다.",
        "sections": [
            _section(
                "lp-kpi",
                "핵심 지표",
                "kpi",
                [
                    _card(
                        "lp-capital-kpi",
                        "LP 약정/납입",
                        "약정액, 납입액, 평균 납입률을 함께 봅니다.",
                        "lp_commitment",
                        "kpi",
                        _pivot_query(
                            "lp_commitment",
                            values=[
                                _value("lp.commitment", "sum", "commitment_total"),
                                _value("lp.paid_in", "sum", "paid_in_total"),
                                _value("lp.paid_in_rate", "avg", "paid_in_rate"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                    ),
                    _card(
                        "lp-outstanding-kpi",
                        "미수 납입",
                        "미납 금액, 평균 지연일수, 건수를 함께 요약합니다.",
                        "lp_contribution",
                        "kpi",
                        _pivot_query(
                            "lp_contribution",
                            values=[
                                _value("contribution.outstanding_amount", "sum", "outstanding_amount"),
                                _value("contribution.delay_days", "avg", "delay_days"),
                                _value("__row_count", "sum", "contribution_count"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="contribution.due_date.day",
                    ),
                ],
            ),
            _section(
                "lp-grid",
                "자본 흐름",
                "grid",
                [
                    _card(
                        "lp-type-commitment",
                        "LP 유형별 약정/납입",
                        "LP 유형별 자본 구성을 비교합니다.",
                        "lp_commitment",
                        "grouped_bar",
                        _pivot_query(
                            "lp_commitment",
                            rows=["lp.type"],
                            values=[
                                _value("lp.commitment", "sum", "commitment_total"),
                                _value("lp.paid_in", "sum", "paid_in_total"),
                            ],
                        ),
                        fund_field="fund.name",
                    ),
                    _card(
                        "lp-outstanding-by-fund",
                        "조합별 미수 납입금",
                        "미수 금액이 큰 조합을 우선 봅니다.",
                        "lp_contribution",
                        "ranked_bar",
                        _pivot_query(
                            "lp_contribution",
                            rows=["fund.name"],
                            values=[_value("contribution.outstanding_amount", "sum", "outstanding_amount")],
                            sorts=[{"field": "outstanding_amount", "direction": "desc"}],
                            row_limit=20,
                        ),
                        fund_field="fund.name",
                        date_field="contribution.due_date.day",
                    ),
                    _card(
                        "lp-due-trend",
                        "납입 예정/지연 추이",
                        "납입기한 기준 월별 미수 금액을 추이로 봅니다.",
                        "lp_contribution",
                        "line",
                        _pivot_query(
                            "lp_contribution",
                            rows=["contribution.due_date.year_month"],
                            values=[_value("contribution.outstanding_amount", "sum", "outstanding_amount")],
                            sorts=[{"field": "contribution.due_date.year_month", "direction": "asc"}],
                            row_limit=18,
                        ),
                        fund_field="fund.name",
                        date_field="contribution.due_date.day",
                    ),
                    _card(
                        "lp-top-exposure",
                        "대형 LP 집중도",
                        "약정액 기준 상위 LP를 빠르게 봅니다.",
                        "lp_commitment",
                        "ranked_bar",
                        _pivot_query(
                            "lp_commitment",
                            rows=["lp.name"],
                            values=[_value("lp.commitment", "sum", "commitment_total")],
                            sorts=[{"field": "commitment_total", "direction": "desc"}],
                            row_limit=15,
                        ),
                        fund_field="fund.name",
                    ),
                ],
            ),
        ],
    }

    portfolio_pack = {
        "key": "portfolio",
        "label": "포트폴리오",
        "description": "산업, 투자수단, 평가와 심사역 관점에서 포트폴리오를 봅니다.",
        "sections": [
            _section(
                "portfolio-kpi",
                "핵심 지표",
                "kpi",
                [
                    _card(
                        "portfolio-scale-kpi",
                        "포트폴리오 규모",
                        "투자금액, 최신 평가, 미실현손익을 묶어 봅니다.",
                        "investment",
                        "kpi",
                        _pivot_query(
                            "investment",
                            values=[
                                _value("investment.amount", "sum", "investment_amount"),
                                _value("investment.latest_valuation", "sum", "latest_valuation"),
                                _value("investment.unrealized_gain_loss", "sum", "unrealized_gain_loss"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="investment.investment_date.day",
                    ),
                    _card(
                        "portfolio-ops-kpi",
                        "포트폴리오 운영 부담",
                        "연결 업무, 워크플로, 지연 문서를 함께 봅니다.",
                        "investment",
                        "kpi",
                        _pivot_query(
                            "investment",
                            values=[
                                _value("investment.open_task_count", "sum", "open_task_count"),
                                _value("investment.active_workflow_count", "sum", "active_workflow_count"),
                                _value("investment.overdue_document_count", "sum", "overdue_document_count"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="investment.investment_date.day",
                    ),
                ],
            ),
            _section(
                "portfolio-grid",
                "포트폴리오 현황",
                "grid",
                [
                    _card(
                        "portfolio-industry-scale",
                        "산업별 투자/평가",
                        "산업별 투자금액과 최신 평가를 비교합니다.",
                        "investment",
                        "grouped_bar",
                        _pivot_query(
                            "investment",
                            rows=["company.industry"],
                            values=[
                                _value("investment.amount", "sum", "investment_amount"),
                                _value("investment.latest_valuation", "sum", "latest_valuation"),
                            ],
                            row_limit=12,
                        ),
                        fund_field="fund.name",
                        date_field="investment.investment_date.day",
                    ),
                    _card(
                        "portfolio-instrument-share",
                        "투자수단 분포",
                        "투자수단별 포트폴리오 건수를 봅니다.",
                        "investment",
                        "donut",
                        _pivot_query(
                            "investment",
                            rows=["investment.instrument"],
                            values=[_value("__row_count", "sum", "investment_count")],
                        ),
                        fund_field="fund.name",
                        date_field="investment.investment_date.day",
                    ),
                    _card(
                        "portfolio-analyst-load",
                        "심사역별 포트폴리오",
                        "심사역별 투자금액과 최신 평가를 비교합니다.",
                        "investment",
                        "grouped_bar",
                        _pivot_query(
                            "investment",
                            rows=["company.analyst"],
                            values=[
                                _value("investment.amount", "sum", "investment_amount"),
                                _value("investment.latest_valuation", "sum", "latest_valuation"),
                            ],
                            row_limit=12,
                        ),
                        fund_field="fund.name",
                        date_field="investment.investment_date.day",
                    ),
                    _card(
                        "portfolio-investment-trend",
                        "월별 투자 집행",
                        "투자 집행 추이를 월별로 봅니다.",
                        "investment",
                        "line",
                        _pivot_query(
                            "investment",
                            rows=["investment.investment_date.year_month"],
                            values=[_value("investment.amount", "sum", "investment_amount")],
                            sorts=[{"field": "investment.investment_date.year_month", "direction": "asc"}],
                            row_limit=18,
                        ),
                        fund_field="fund.name",
                        date_field="investment.investment_date.day",
                    ),
                ],
            ),
        ],
    }

    tx_pack = {
        "key": "transactions-valuations",
        "label": "거래/평가",
        "description": "거래 흐름, 평가 변동, 회수 성과를 함께 봅니다.",
        "sections": [
            _section(
                "tx-kpi",
                "핵심 지표",
                "kpi",
                [
                    _card(
                        "transaction-flow-kpi",
                        "거래 흐름",
                        "거래금액, 실현손익, 거래 건수를 묶어 봅니다.",
                        "transaction",
                        "kpi",
                        _pivot_query(
                            "transaction",
                            values=[
                                _value("transaction.amount", "sum", "transaction_amount"),
                                _value("transaction.realized_gain", "sum", "realized_gain"),
                                _value("__row_count", "sum", "transaction_count"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="transaction.date.day",
                    ),
                    _card(
                        "valuation-kpi",
                        "평가 현황",
                        "평가금액, 평가변동액, 미실현손익을 함께 봅니다.",
                        "valuation",
                        "kpi",
                        _pivot_query(
                            "valuation",
                            values=[
                                _value("valuation.value", "sum", "valuation_amount"),
                                _value("valuation.change_amount", "sum", "valuation_change"),
                                _value("valuation.unrealized_gain_loss", "sum", "unrealized_gain_loss"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="valuation.as_of_date.day",
                    ),
                ],
            ),
            _section(
                "tx-grid",
                "거래/평가 분석",
                "grid",
                [
                    _card(
                        "transaction-monthly-flow",
                        "월별 거래금액",
                        "거래월 기준으로 금액 추이를 봅니다.",
                        "transaction",
                        "line",
                        _pivot_query(
                            "transaction",
                            rows=["transaction.date.year_month"],
                            values=[_value("transaction.amount", "sum", "transaction_amount")],
                            sorts=[{"field": "transaction.date.year_month", "direction": "asc"}],
                            row_limit=18,
                        ),
                        fund_field="fund.name",
                        date_field="transaction.date.day",
                    ),
                    _card(
                        "transaction-type-share",
                        "거래 유형별 자금 흐름",
                        "거래월과 거래 유형별 금액 흐름을 겹쳐 봅니다.",
                        "transaction",
                        "stacked_bar",
                        _pivot_query(
                            "transaction",
                            rows=["transaction.date.year_month"],
                            columns=["transaction.type"],
                            values=[_value("transaction.amount", "sum", "transaction_amount")],
                            sorts=[{"field": "transaction.date.year_month", "direction": "asc"}],
                            row_limit=18,
                        ),
                        fund_field="fund.name",
                        date_field="transaction.date.day",
                    ),
                    _card(
                        "valuation-change-ranking",
                        "평가 변동 상위",
                        "평가변동액이 큰 회사를 우선 봅니다.",
                        "valuation",
                        "ranked_bar",
                        _pivot_query(
                            "valuation",
                            rows=["company.name"],
                            values=[_value("valuation.change_amount", "sum", "valuation_change")],
                            sorts=[{"field": "valuation_change", "direction": "desc"}],
                            row_limit=15,
                        ),
                        fund_field="fund.name",
                        date_field="valuation.as_of_date.day",
                    ),
                    _card(
                        "exit-trend",
                        "회수/실현 성과",
                        "회수월 기준 회수 금액과 실현손익을 같이 봅니다.",
                        "exit_trade",
                        "grouped_bar",
                        _pivot_query(
                            "exit_trade",
                            rows=["exit.trade_date.year_month"],
                            values=[
                                _value("exit.amount", "sum", "exit_amount"),
                                _value("exit.realized_gain", "sum", "exit_realized_gain"),
                            ],
                            sorts=[{"field": "exit.trade_date.year_month", "direction": "asc"}],
                            row_limit=18,
                        ),
                        fund_field="fund.name",
                        date_field="exit.trade_date.day",
                    ),
                ],
            ),
        ],
    }

    operations_pack = {
        "key": "operations",
        "label": "운영실행",
        "description": "업무 적체, 워크플로 병목, 실투입 시간을 운영 관점에서 봅니다.",
        "sections": [
            _section(
                "operations-kpi",
                "핵심 지표",
                "kpi",
                [
                    _card(
                        "task-kpi",
                        "업무 처리 현황",
                        "전체 업무, 지연 업무, 완료 업무를 요약합니다.",
                        "task",
                        "kpi",
                        _pivot_query(
                            "task",
                            values=[
                                _value("__row_count", "sum", "task_count"),
                                _value("task.is_overdue", "sum", "overdue_tasks"),
                                _value("task.is_completed", "sum", "completed_tasks"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="task.deadline.day",
                    ),
                    _card(
                        "workflow-kpi",
                        "워크플로 진행",
                        "인스턴스 수, 평균 진행률, 남은 단계 수를 봅니다.",
                        "workflow_instance",
                        "kpi",
                        _pivot_query(
                            "workflow_instance",
                            values=[
                                _value("__row_count", "sum", "workflow_count"),
                                _value("workflow.progress_pct", "avg", "progress_pct"),
                                _value("workflow.remaining_step_count", "sum", "remaining_steps"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="workflow.trigger_date.day",
                    ),
                ],
            ),
            _section(
                "operations-grid",
                "실행 병목",
                "grid",
                [
                    _card(
                        "task-category-backlog",
                        "카테고리별 업무 적체",
                        "업무 상태별 카테고리 적체를 봅니다.",
                        "task",
                        "stacked_bar",
                        _pivot_query(
                            "task",
                            rows=["task.category"],
                            columns=["task.status"],
                            values=[_value("__row_count", "sum", "task_count")],
                            row_limit=16,
                        ),
                        fund_field="fund.name",
                        date_field="task.deadline.day",
                    ),
                    _card(
                        "workflow-bottleneck",
                        "워크플로 병목 단계",
                        "미체크 문서와 지연이 많은 단계를 우선 봅니다.",
                        "workflow_step",
                        "grouped_bar",
                        _pivot_query(
                            "workflow_step",
                            rows=["step.name"],
                            values=[
                                _value("step.required_unchecked_document_count", "sum", "unchecked_required_docs"),
                                _value("step.is_overdue", "sum", "overdue_steps"),
                            ],
                            row_limit=12,
                        ),
                        fund_field="fund.name",
                        date_field="step.calculated_date.day",
                    ),
                    _card(
                        "workflow-status-share",
                        "워크플로 상태 분포",
                        "워크플로 상태별 인스턴스 수를 봅니다.",
                        "workflow_instance",
                        "donut",
                        _pivot_query(
                            "workflow_instance",
                            rows=["workflow.status"],
                            values=[_value("__row_count", "sum", "workflow_count")],
                        ),
                        fund_field="fund.name",
                        date_field="workflow.trigger_date.day",
                    ),
                    _card(
                        "worklog-time-plan-vs-actual",
                        "계획 대비 실제 투입시간",
                        "월별 계획 시간과 실제 투입 시간을 비교합니다.",
                        "worklog",
                        "grouped_bar",
                        _pivot_query(
                            "worklog",
                            rows=["worklog.date.year_month"],
                            values=[
                                _value("worklog.estimated_minutes", "sum", "estimated_minutes"),
                                _value("worklog.actual_minutes", "sum", "actual_minutes"),
                            ],
                            sorts=[{"field": "worklog.date.year_month", "direction": "asc"}],
                            row_limit=18,
                        ),
                        date_field="worklog.date.day",
                    ),
                ],
            ),
        ],
    }

    risk_pack = {
        "key": "risk",
        "label": "리스크",
        "description": "컴플라이언스, 문서, 기한 임박 항목을 함께 봅니다.",
        "sections": [
            _section(
                "risk-kpi",
                "핵심 지표",
                "kpi",
                [
                    _card(
                        "compliance-kpi",
                        "컴플라이언스 리스크",
                        "지연 의무, 완료 의무, 전체 의무 수를 봅니다.",
                        "compliance_obligation",
                        "kpi",
                        _pivot_query(
                            "compliance_obligation",
                            values=[
                                _value("obligation.is_overdue", "sum", "overdue_obligations"),
                                _value("obligation.is_completed", "sum", "completed_obligations"),
                                _value("__row_count", "sum", "obligation_count"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="obligation.due_date.day",
                    ),
                    _card(
                        "document-risk-kpi",
                        "문서 리스크",
                        "지연 문서 수와 평균 잔여일수를 같이 봅니다.",
                        "document_status",
                        "kpi",
                        _pivot_query(
                            "document_status",
                            values=[
                                _value("document.is_overdue", "sum", "overdue_documents"),
                                _value("document.days_remaining", "avg", "days_remaining"),
                                _value("__row_count", "sum", "document_count"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="document.due_date.day",
                    ),
                ],
            ),
            _section(
                "risk-grid",
                "리스크 현황",
                "grid",
                [
                    _card(
                        "compliance-category-status",
                        "규칙 카테고리별 상태",
                        "규칙 카테고리와 의무 상태를 교차해서 봅니다.",
                        "compliance_obligation",
                        "stacked_bar",
                        _pivot_query(
                            "compliance_obligation",
                            rows=["rule.category"],
                            columns=["obligation.status"],
                            values=[_value("__row_count", "sum", "obligation_count")],
                            row_limit=16,
                        ),
                        fund_field="fund.name",
                        date_field="obligation.due_date.day",
                    ),
                    _card(
                        "document-overdue-by-fund",
                        "조합별 지연 문서",
                        "지연 문서가 많은 조합을 우선 봅니다.",
                        "document_status",
                        "ranked_bar",
                        _pivot_query(
                            "document_status",
                            rows=["fund.name"],
                            values=[_value("document.is_overdue", "sum", "overdue_documents")],
                            sorts=[{"field": "overdue_documents", "direction": "desc"}],
                            row_limit=20,
                        ),
                        fund_field="fund.name",
                        date_field="document.due_date.day",
                    ),
                    _card(
                        "risk-upcoming-table",
                        "기한 임박 문서",
                        "문서 기한 임박 항목을 표로 확인합니다.",
                        "document_status",
                        "table",
                        _table_query(
                            "document_status",
                            selected_fields=[
                                "fund.name",
                                "company.name",
                                "document.name",
                                "document.status",
                                "document.due_date.day",
                                "document.days_remaining",
                            ],
                            sorts=[{"field": "document.due_date.day", "direction": "asc"}],
                            row_limit=10,
                        ),
                        fund_field="fund.name",
                        date_field="document.due_date.day",
                    ),
                    _card(
                        "risk-obligation-table",
                        "지연 의무 목록",
                        "지연 의무와 마감일을 표로 확인합니다.",
                        "compliance_obligation",
                        "table",
                        _table_query(
                            "compliance_obligation",
                            selected_fields=[
                                "fund.name",
                                "company.name",
                                "rule.title",
                                "obligation.status",
                                "obligation.due_date.day",
                            ],
                            sorts=[{"field": "obligation.due_date.day", "direction": "asc"}],
                            row_limit=10,
                        ),
                        fund_field="fund.name",
                        date_field="obligation.due_date.day",
                    ),
                ],
            ),
        ],
    }

    finance_pack = {
        "key": "finance",
        "label": "재무",
        "description": "보수, 은행거래, 전표, 가결산을 임원용 요약으로 봅니다.",
        "sections": [
            _section(
                "finance-kpi",
                "핵심 지표",
                "kpi",
                [
                    _card(
                        "fee-kpi",
                        "관리보수",
                        "총 관리보수, 평균 보수율, 산정 금액을 묶어 봅니다.",
                        "management_fee",
                        "kpi",
                        _pivot_query(
                            "management_fee",
                            values=[
                                _value("fee.amount", "sum", "fee_amount"),
                                _value("fee.rate", "avg", "fee_rate"),
                                _value("fee.basis_amount", "sum", "fee_basis_amount"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="fee.invoice_date.day",
                    ),
                    _card(
                        "bank-kpi",
                        "은행거래 순변동",
                        "입금, 출금, 순변동을 함께 봅니다.",
                        "bank_transaction",
                        "kpi",
                        _pivot_query(
                            "bank_transaction",
                            values=[
                                _value("bank.deposit_amount", "sum", "deposit_amount"),
                                _value("bank.withdrawal_amount", "sum", "withdrawal_amount"),
                                _value("bank.net_amount", "sum", "net_amount"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="bank.transaction_date.day",
                    ),
                    _card(
                        "fs-kpi",
                        "가결산 스냅샷",
                        "자산, 부채, 자본을 함께 요약합니다.",
                        "provisional_fs",
                        "kpi",
                        _pivot_query(
                            "provisional_fs",
                            values=[
                                _value("fs.total_assets", "sum", "total_assets"),
                                _value("fs.total_liabilities", "sum", "total_liabilities"),
                                _value("fs.total_equity", "sum", "total_equity"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="fs.period.day",
                    ),
                ],
            ),
            _section(
                "finance-grid",
                "재무 흐름",
                "grid",
                [
                    _card(
                        "fee-trend",
                        "관리보수 추이",
                        "기준월 기준 관리보수 추이를 봅니다.",
                        "management_fee",
                        "line",
                        _pivot_query(
                            "management_fee",
                            rows=["fee.period.year_month"],
                            values=[_value("fee.amount", "sum", "fee_amount")],
                            sorts=[{"field": "fee.period.year_month", "direction": "asc"}],
                            row_limit=18,
                        ),
                        fund_field="fund.name",
                        date_field="fee.invoice_date.day",
                    ),
                    _card(
                        "bank-direction-flow",
                        "은행거래 유입/유출",
                        "입금과 출금을 월별로 나눠 봅니다.",
                        "bank_transaction",
                        "stacked_area",
                        _pivot_query(
                            "bank_transaction",
                            rows=["bank.transaction_date.year_month"],
                            values=[
                                _value("bank.deposit_amount", "sum", "deposit_amount"),
                                _value("bank.withdrawal_amount", "sum", "withdrawal_amount"),
                            ],
                            sorts=[{"field": "bank.transaction_date.year_month", "direction": "asc"}],
                            row_limit=18,
                        ),
                        fund_field="fund.name",
                        date_field="bank.transaction_date.day",
                    ),
                    _card(
                        "journal-category-net",
                        "계정 카테고리별 순변동",
                        "계정 카테고리별 순변동을 비교합니다.",
                        "journal_entry",
                        "grouped_bar",
                        _pivot_query(
                            "journal_entry",
                            rows=["account.category"],
                            values=[
                                _value("line.debit", "sum", "debit_amount"),
                                _value("line.credit", "sum", "credit_amount"),
                                _value("line.net_amount", "sum", "net_amount"),
                            ],
                            row_limit=20,
                        ),
                        fund_field="fund.name",
                        date_field="journal.entry_date.day",
                    ),
                    _card(
                        "fs-table",
                        "가결산 기준 목록",
                        "기준월과 확정 상태를 표로 확인합니다.",
                        "provisional_fs",
                        "table",
                        _table_query(
                            "provisional_fs",
                            selected_fields=[
                                "fund.name",
                                "fs.status",
                                "fs.period.year_month",
                                "fs.total_assets",
                                "fs.total_liabilities",
                                "fs.net_income",
                            ],
                            sorts=[{"field": "fs.period.year_month", "direction": "desc"}],
                            row_limit=10,
                        ),
                        fund_field="fund.name",
                        date_field="fs.period.day",
                    ),
                ],
            ),
        ],
    }

    governance_pack = {
        "key": "governance",
        "label": "거버넌스",
        "description": "내부 심의, 정기/사업/VICS 보고, 호출/분배/회수 이벤트를 봅니다.",
        "sections": [
            _section(
                "governance-kpi",
                "핵심 지표",
                "kpi",
                [
                    _card(
                        "review-kpi",
                        "내부 심의",
                        "심의 건수, 평균 소요일, 검토 회사 수를 요약합니다.",
                        "internal_review",
                        "kpi",
                        _pivot_query(
                            "internal_review",
                            values=[
                                _value("__row_count", "sum", "review_count"),
                                _value("review.lead_time_days", "avg", "lead_time_days"),
                                _value("review.company_review_count", "sum", "company_review_count"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="review.review_date.day",
                    ),
                    _card(
                        "report-kpi",
                        "정기보고 현황",
                        "지연 보고, 제출 보고, 전체 보고 수를 봅니다.",
                        "regular_report",
                        "kpi",
                        _pivot_query(
                            "regular_report",
                            values=[
                                _value("report.is_overdue", "sum", "overdue_reports"),
                                _value("report.is_submitted", "sum", "submitted_reports"),
                                _value("__row_count", "sum", "report_count"),
                            ],
                        ),
                        height="sm",
                        fund_field="fund.name",
                        date_field="report.due_date.day",
                    ),
                ],
            ),
            _section(
                "governance-grid",
                "거버넌스 현황",
                "grid",
                [
                    _card(
                        "review-status-share",
                        "내부 심의 상태",
                        "내부 심의 상태별 건수를 봅니다.",
                        "internal_review",
                        "donut",
                        _pivot_query(
                            "internal_review",
                            rows=["review.status"],
                            values=[_value("__row_count", "sum", "review_count")],
                        ),
                        fund_field="fund.name",
                        date_field="review.review_date.day",
                    ),
                    _card(
                        "regular-report-status",
                        "정기보고 상태",
                        "보고월 기준 제출 상태를 봅니다.",
                        "regular_report",
                        "stacked_bar",
                        _pivot_query(
                            "regular_report",
                            rows=["report.due_date.year_month"],
                            columns=["report.status"],
                            values=[_value("__row_count", "sum", "report_count")],
                            sorts=[{"field": "report.due_date.year_month", "direction": "asc"}],
                            row_limit=18,
                        ),
                        fund_field="fund.name",
                        date_field="report.due_date.day",
                    ),
                    _card(
                        "biz-report-risk",
                        "사업보고 요청 리스크",
                        "리스크 플래그와 지연일수를 함께 봅니다.",
                        "biz_report_request",
                        "grouped_bar",
                        _pivot_query(
                            "biz_report_request",
                            rows=["request.risk_flag"],
                            values=[
                                _value("__row_count", "sum", "request_count"),
                                _value("request.overdue_days", "avg", "overdue_days"),
                            ],
                        ),
                        fund_field="fund.name",
                        date_field="request.deadline.day",
                    ),
                    _card(
                        "vics-status-share",
                        "VICS 보고 현황",
                        "VICS 보고 상태별 제출 현황을 봅니다.",
                        "vics_report",
                        "donut",
                        _pivot_query(
                            "vics_report",
                            rows=["vics.status"],
                            values=[_value("__row_count", "sum", "vics_count")],
                        ),
                        fund_field="fund.name",
                        date_field="vics.submitted_at.day",
                    ),
                    _card(
                        "capital-call-trend",
                        "월별 호출 추이",
                        "호출 금액과 호출 비율 흐름을 함께 봅니다.",
                        "capital_call",
                        "grouped_bar",
                        _pivot_query(
                            "capital_call",
                            rows=["call.call_date.year_month"],
                            values=[
                                _value("call.amount", "sum", "capital_call_amount"),
                                _value("call.request_percent", "avg", "capital_call_rate"),
                            ],
                            sorts=[{"field": "call.call_date.year_month", "direction": "asc"}],
                            row_limit=18,
                        ),
                        fund_field="fund.name",
                        date_field="call.call_date.day",
                    ),
                ],
            ),
        ],
    }

    all_pack = {
        "key": "all",
        "label": "전체",
        "description": "임원이 먼저 봐야 할 핵심 카드만 모아 전사 현황을 빠르게 훑습니다.",
        "sections": [
            _section(
                "all-kpi",
                "전사 요약",
                "kpi",
                [
                    _card(
                        "all-fund-scale",
                        "펀드 운용 규모",
                        "펀드 총 약정액, 납입액, NAV를 요약합니다.",
                        "fund_master",
                        "kpi",
                        _pivot_query(
                            "fund_master",
                            values=[
                                _value("fund.commitment_total", "sum", "commitment_total"),
                                _value("fund.paid_in_total", "sum", "paid_in_total"),
                                _value("fund.estimated_nav", "sum", "estimated_nav"),
                            ],
                        ),
                        height="sm",
                    ),
                    _card(
                        "all-execution-risk",
                        "운영 리스크",
                        "업무 지연, 의무 지연, 문서 지연을 요약합니다.",
                        "fund_master",
                        "kpi",
                        _pivot_query(
                            "fund_master",
                            values=[
                                _value("fund.overdue_task_count", "sum", "overdue_tasks"),
                                _value("fund.overdue_compliance_count", "sum", "overdue_obligations"),
                                _value("fund.overdue_document_count", "sum", "overdue_documents"),
                            ],
                        ),
                        height="sm",
                    ),
                ],
            ),
            _section(
                "all-grid",
                "대표 카드",
                "grid",
                [
                    _card(
                        "all-fund-contribution",
                        "조합별 납입률",
                        "납입률이 낮은 조합을 빠르게 확인합니다.",
                        "fund_master",
                        "ranked_bar",
                        _pivot_query(
                            "fund_master",
                            rows=["fund.name"],
                            values=[_value("fund.contribution_rate", "avg", "contribution_rate")],
                            sorts=[{"field": "contribution_rate", "direction": "asc"}],
                            row_limit=12,
                        ),
                        fund_field="fund.name",
                    ),
                    _card(
                        "all-portfolio-industry",
                        "산업별 투자/평가",
                        "산업별 투자 규모와 최신 평가를 비교합니다.",
                        "investment",
                        "grouped_bar",
                        _pivot_query(
                            "investment",
                            rows=["company.industry"],
                            values=[
                                _value("investment.amount", "sum", "investment_amount"),
                                _value("investment.latest_valuation", "sum", "latest_valuation"),
                            ],
                            row_limit=10,
                        ),
                        fund_field="fund.name",
                        date_field="investment.investment_date.day",
                    ),
                    _card(
                        "all-tx-flow",
                        "월별 거래 흐름",
                        "거래금액 추이를 월별로 봅니다.",
                        "transaction",
                        "line",
                        _pivot_query(
                            "transaction",
                            rows=["transaction.date.year_month"],
                            values=[_value("transaction.amount", "sum", "transaction_amount")],
                            sorts=[{"field": "transaction.date.year_month", "direction": "asc"}],
                            row_limit=12,
                        ),
                        fund_field="fund.name",
                        date_field="transaction.date.day",
                    ),
                    _card(
                        "all-task-backlog",
                        "업무 적체",
                        "카테고리별 업무 상태를 확인합니다.",
                        "task",
                        "stacked_bar",
                        _pivot_query(
                            "task",
                            rows=["task.category"],
                            columns=["task.status"],
                            values=[_value("__row_count", "sum", "task_count")],
                            row_limit=12,
                        ),
                        fund_field="fund.name",
                        date_field="task.deadline.day",
                    ),
                    _card(
                        "all-document-risk",
                        "조합별 문서 리스크",
                        "지연 문서가 많은 조합을 우선 봅니다.",
                        "document_status",
                        "ranked_bar",
                        _pivot_query(
                            "document_status",
                            rows=["fund.name"],
                            values=[_value("document.is_overdue", "sum", "overdue_documents")],
                            sorts=[{"field": "overdue_documents", "direction": "desc"}],
                            row_limit=12,
                        ),
                        fund_field="fund.name",
                        date_field="document.due_date.day",
                    ),
                    _card(
                        "all-bank-flow",
                        "은행 유입/유출",
                        "입금과 출금을 월별로 함께 봅니다.",
                        "bank_transaction",
                        "stacked_area",
                        _pivot_query(
                            "bank_transaction",
                            rows=["bank.transaction_date.year_month"],
                            values=[
                                _value("bank.deposit_amount", "sum", "deposit_amount"),
                                _value("bank.withdrawal_amount", "sum", "withdrawal_amount"),
                            ],
                            sorts=[{"field": "bank.transaction_date.year_month", "direction": "asc"}],
                            row_limit=12,
                        ),
                        fund_field="fund.name",
                        date_field="bank.transaction_date.day",
                    ),
                    _card(
                        "all-review-status",
                        "내부 심의 상태",
                        "내부 심의 상태별 분포를 확인합니다.",
                        "internal_review",
                        "donut",
                        _pivot_query(
                            "internal_review",
                            rows=["review.status"],
                            values=[_value("__row_count", "sum", "review_count")],
                        ),
                        fund_field="fund.name",
                        date_field="review.review_date.day",
                    ),
                    _card(
                        "all-report-status",
                        "정기보고 상태",
                        "정기보고 상태와 제출 흐름을 확인합니다.",
                        "regular_report",
                        "stacked_bar",
                        _pivot_query(
                            "regular_report",
                            rows=["report.due_date.year_month"],
                            columns=["report.status"],
                            values=[_value("__row_count", "sum", "report_count")],
                            sorts=[{"field": "report.due_date.year_month", "direction": "asc"}],
                            row_limit=12,
                        ),
                        fund_field="fund.name",
                        date_field="report.due_date.day",
                    ),
                ],
            ),
        ],
    }

    return [
        all_pack,
        funds_pack,
        lp_pack,
        portfolio_pack,
        tx_pack,
        operations_pack,
        risk_pack,
        finance_pack,
        governance_pack,
    ]
