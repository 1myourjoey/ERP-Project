from __future__ import annotations

from datetime import date

from models.biz_report import BizReport, BizReportRequest
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db, include={"company", "fund", "investment"})
    report_map = {row.id: row for row in db.query(BizReport).all()}
    rows = db.query(BizReportRequest).all()
    today = date.today()
    result = []
    for row in rows:
        report = report_map.get(row.biz_report_id)
        investment = refs["investment"].get(row.investment_id) if row.investment_id else None
        company = refs["company"].get(investment.company_id) if investment else None
        fund = refs["fund"].get(report.fund_id) if report and report.fund_id else None
        due_date = row.deadline or row.request_deadline
        overdue_days = (today - due_date).days if due_date and due_date < today and row.status != "completed" else 0
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "company.name": company.name if company else None,
            "request.report_year": report.report_year if report else None,
            "request.status": row.status,
            "request.risk_flag": row.risk_flag,
            "request.deadline": due_date,
            "request.revenue": float(row.revenue or 0),
            "request.operating_income": float(row.operating_income or 0),
            "request.net_income": float(row.net_income or 0),
            "request.employees": int(row.employees or 0),
            "request.overdue_days": overdue_days,
        }
        item.update(apply_date_buckets(due_date, "request.deadline"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="biz_report_request",
    label="사업보고 요청",
    description="사업보고 요청/수집 현황과 핵심 재무 응답값을 분석합니다.",
    grain_label="사업보고 요청 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("company.name", "회사명", "string", "기본 차원"),
        dimension("request.report_year", "보고 연도", "number", "기본 차원"),
        dimension("request.status", "상태", "string", "기본 차원"),
        dimension("request.risk_flag", "리스크 플래그", "string", "기본 차원"),
        dimension("request.deadline.day", "마감일", "date", "날짜 파생"),
        dimension("request.deadline.year_month", "마감월", "string", "날짜 파생"),
        measure("request.revenue", "매출", "number", "기본 지표"),
        measure("request.operating_income", "영업이익", "number", "기본 지표"),
        measure("request.net_income", "순이익", "number", "기본 지표"),
        measure("request.employees", "인원수", "number", "기본 지표", default_aggregate="avg"),
        measure("request.overdue_days", "지연일수", "number", "기본 지표", default_aggregate="avg"),
    ],
    default_table_fields=[
        "fund.name",
        "company.name",
        "request.status",
        "request.risk_flag",
        "request.deadline.day",
        "request.overdue_days",
    ],
    default_values=[{"key": "__row_count", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)
