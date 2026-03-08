from __future__ import annotations

from models.internal_review import CompanyReview, InternalReview
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db)
    rows = db.query(InternalReview).all()
    company_reviews = db.query(CompanyReview).all()
    review_counts: dict[int, int] = {}
    for row in company_reviews:
        review_counts[row.review_id] = review_counts.get(row.review_id, 0) + 1

    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id)
        lead_time_days = None
        if row.reference_date and row.review_date:
            lead_time_days = (row.review_date - row.reference_date).days
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "review.year": row.year,
            "review.quarter": row.quarter,
            "review.status": row.status,
            "review.reference_date": row.reference_date,
            "review.review_date": row.review_date,
            "review.compliance_officer": row.compliance_officer,
            "review.company_review_count": review_counts.get(row.id, 0),
            "review.lead_time_days": lead_time_days or 0,
        }
        item.update(apply_date_buckets(row.reference_date, "review.reference_date"))
        item.update(apply_date_buckets(row.review_date, "review.review_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="internal_review",
    label="내부심의",
    description="분기별 내부심의 상태와 검토 소요를 분석합니다.",
    grain_label="내부심의 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("review.year", "연도", "number", "기본 차원"),
        dimension("review.quarter", "분기", "number", "기본 차원"),
        dimension("review.status", "상태", "string", "기본 차원"),
        dimension("review.compliance_officer", "컴플 담당자", "string", "기본 차원"),
        dimension("review.review_date.day", "심의일", "date", "날짜 파생"),
        dimension("review.review_date.year_month", "심의월", "string", "날짜 파생"),
        measure("review.company_review_count", "검토 회사 수", "number", "연결 지표", is_linked_measure=True),
        measure("review.lead_time_days", "검토 소요일", "number", "기본 지표", default_aggregate="avg"),
    ],
    default_table_fields=[
        "fund.name",
        "review.year",
        "review.quarter",
        "review.status",
        "review.review_date.day",
        "review.company_review_count",
        "review.lead_time_days",
    ],
    default_values=[{"key": "__row_count", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)
