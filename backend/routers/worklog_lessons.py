from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.investment import Investment, PortfolioCompany
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
    investment_id: int | None = None
    company_name: str | None = None
    is_same_fund: bool = False
    match_score: int = 0
    match_flags: list[str] = []


def _normalize_company_name(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = "".join(value.strip().lower().split())
    return normalized or None


@router.get("/lessons", response_model=list[WorkLogLessonReminder])
def get_lessons_by_category(
    category: str = Query(..., description="업무 카테고리"),
    fund_id: int | None = Query(default=None),
    investment_id: int | None = Query(default=None),
    company_name: str | None = Query(default=None),
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    normalized_category = category.strip()
    if not normalized_category:
        raise HTTPException(status_code=400, detail="category는 필수입니다.")
    normalized_category_key = normalized_category.lower()
    normalized_company_key = _normalize_company_name(company_name)

    query = (
        db.query(WorkLogLesson, WorkLog, Task, Fund, Investment, PortfolioCompany)
        .join(WorkLog, WorkLog.id == WorkLogLesson.worklog_id)
        .outerjoin(Task, Task.id == WorkLog.task_id)
        .outerjoin(Fund, Fund.id == Task.fund_id)
        .outerjoin(Investment, Investment.id == Task.investment_id)
        .outerjoin(PortfolioCompany, PortfolioCompany.id == Investment.company_id)
        .filter(
            or_(
                func.lower(WorkLog.category) == normalized_category_key,
                func.lower(Task.category) == normalized_category_key,
            )
        )
        .order_by(
            WorkLog.date.desc(),
            WorkLog.id.desc(),
            WorkLogLesson.order.asc(),
            WorkLogLesson.id.desc(),
        )
    )

    fetch_size = min(max(limit * 8, 40), 200)
    rows = query.limit(fetch_size).all()
    today = date.today()

    candidates: list[WorkLogLessonReminder] = []
    for lesson, worklog, task, fund, _investment, company in rows:
        score = 100
        flags: list[str] = []

        if task is not None and fund_id is not None and task.fund_id == fund_id:
            score += 40
            flags.append("same_fund")
        if task is not None and investment_id is not None and task.investment_id == investment_id:
            score += 70
            flags.append("same_investment")

        row_company_key = _normalize_company_name(company.name if company else None)
        if normalized_company_key is not None and row_company_key == normalized_company_key:
            score += 55
            flags.append("same_company")

        age_days = max((today - worklog.date).days, 0)
        score += max(0, 30 - min(age_days, 30))

        candidates.append(
            WorkLogLessonReminder(
                id=lesson.id,
                content=lesson.content,
                worklog_id=worklog.id,
                worklog_date=worklog.date,
                task_id=task.id if task else worklog.task_id,
                task_title=task.title if task else worklog.title,
                fund_id=task.fund_id if task else None,
                fund_name=fund.name if fund else None,
                investment_id=task.investment_id if task else None,
                company_name=company.name if company else None,
                is_same_fund=(fund_id is not None and task is not None and task.fund_id == fund_id),
                match_score=score,
                match_flags=flags,
            )
        )

    candidates.sort(
        key=lambda row: (
            -row.match_score,
            -row.worklog_date.toordinal(),
            -row.worklog_id,
            -row.id,
        )
    )
    return candidates[:limit]
