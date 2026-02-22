from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.task import Task
from models.worklog import WorkLog, WorkLogLesson

router = APIRouter(prefix="/api/worklogs", tags=["worklog-lessons"])


class WorkLogLessonReminder(BaseModel):
    id: int
    content: str
    worklog_id: int
    worklog_date: date
    task_id: int | None = None
    task_title: str | None = None
    fund_id: int | None = None
    fund_name: str | None = None
    is_same_fund: bool = False


@router.get("/lessons", response_model=list[WorkLogLessonReminder])
def get_lessons_by_category(
    category: str = Query(..., description="업무 카테고리"),
    fund_id: int | None = Query(default=None),
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    normalized_category = category.strip()
    if not normalized_category:
        raise HTTPException(status_code=400, detail="category는 필수입니다.")
    normalized_category_key = normalized_category.lower()

    query = (
        db.query(WorkLogLesson, WorkLog, Task, Fund)
        .join(WorkLog, WorkLog.id == WorkLogLesson.worklog_id)
        .outerjoin(Task, Task.id == WorkLog.task_id)
        .outerjoin(Fund, Fund.id == Task.fund_id)
        .filter(
            or_(
                func.lower(WorkLog.category) == normalized_category_key,
                func.lower(Task.category) == normalized_category_key,
            )
        )
    )

    if fund_id is not None:
        query = query.order_by(
            case((Task.fund_id == fund_id, 0), else_=1),
            WorkLog.date.desc(),
            WorkLog.id.desc(),
            WorkLogLesson.order.asc(),
            WorkLogLesson.id.desc(),
        )
    else:
        query = query.order_by(
            WorkLog.date.desc(),
            WorkLog.id.desc(),
            WorkLogLesson.order.asc(),
            WorkLogLesson.id.desc(),
        )

    rows = query.limit(limit).all()
    return [
        WorkLogLessonReminder(
            id=lesson.id,
            content=lesson.content,
            worklog_id=worklog.id,
            worklog_date=worklog.date,
            task_id=task.id if task else worklog.task_id,
            task_title=task.title if task else worklog.title,
            fund_id=task.fund_id if task else None,
            fund_name=fund.name if fund else None,
            is_same_fund=(fund_id is not None and task is not None and task.fund_id == fund_id),
        )
        for lesson, worklog, task, fund in rows
    ]
