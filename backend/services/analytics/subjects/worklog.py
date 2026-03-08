from __future__ import annotations

from models.worklog import WorkLog
from services.analytics.common import apply_date_buckets, parse_duration_to_minutes
from services.analytics.subject_types import SubjectDefinition, dimension, measure


def load_rows(db):
    rows = db.query(WorkLog).all()
    result = []
    for row in rows:
        item = {
            "id": row.id,
            "worklog.date": row.date,
            "worklog.category": row.category,
            "worklog.title": row.title,
            "worklog.status": row.status,
            "worklog.estimated_minutes": parse_duration_to_minutes(row.estimated_time),
            "worklog.actual_minutes": parse_duration_to_minutes(row.actual_time),
            "worklog.time_diff_minutes": parse_duration_to_minutes(row.actual_time) - parse_duration_to_minutes(row.estimated_time),
            "task.id": row.task_id,
        }
        item.update(apply_date_buckets(row.date, "worklog.date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="worklog",
    label="업무일지",
    description="업무일지의 시간 사용과 카테고리 분포를 분석합니다.",
    grain_label="업무일지 1건",
    fields=[
        dimension("worklog.category", "카테고리", "string", "기본 차원"),
        dimension("worklog.title", "제목", "string", "기본 차원"),
        dimension("worklog.status", "상태", "string", "기본 차원"),
        dimension("worklog.date.day", "기록일", "date", "날짜 파생"),
        dimension("worklog.date.year_month", "기록월", "string", "날짜 파생"),
        measure("worklog.estimated_minutes", "예상분", "number", "기본 지표"),
        measure("worklog.actual_minutes", "실소요분", "number", "기본 지표"),
        measure("worklog.time_diff_minutes", "차이분", "number", "기본 지표", default_aggregate="avg"),
    ],
    default_table_fields=[
        "worklog.date.day",
        "worklog.category",
        "worklog.title",
        "worklog.status",
        "worklog.estimated_minutes",
        "worklog.actual_minutes",
        "worklog.time_diff_minutes",
    ],
    default_values=[{"key": "worklog.actual_minutes", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)


