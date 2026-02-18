import re
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models.worklog import WorkLog, WorkLogDetail, WorkLogLesson, WorkLogFollowUp
from schemas.worklog import (
    WORKLOG_CATEGORIES,
    WorkLogCreate,
    WorkLogInsightsResponse,
    WorkLogResponse,
    WorkLogStatsResponse,
    WorkLogUpdate,
)

router = APIRouter(prefix="/api/worklogs", tags=["worklogs"])


def parse_time_to_minutes(time_str: str | None) -> int:
    """Convert text duration like '1h 30m', '2h', '45m', '1시간 30분' to minutes."""
    if not time_str:
        return 0

    value = str(time_str).strip().lower()
    if not value:
        return 0

    total = 0
    matched = False

    hour_match = re.search(r"(\d+)\s*(?:h|hr|hrs|hour|hours|시간)", value)
    if hour_match:
        total += int(hour_match.group(1)) * 60
        matched = True

    minute_match = re.search(r"(\d+)\s*(?:m|min|mins|minute|minutes|분)", value)
    if minute_match:
        total += int(minute_match.group(1))
        matched = True

    if not matched:
        compact = value.replace(" ", "")
        compact_match = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?", compact)
        if compact_match and (compact_match.group(1) or compact_match.group(2)):
            hours = int(compact_match.group(1) or 0)
            minutes = int(compact_match.group(2) or 0)
            return hours * 60 + minutes

        if compact.isdigit():
            return int(compact)
        return 0

    return total


@router.get("/categories", response_model=list[str])
def get_categories():
    return WORKLOG_CATEGORIES


@router.get("/stats", response_model=WorkLogStatsResponse)
def get_stats(db: Session = Depends(get_db)):
    logs = db.query(WorkLog).all()
    total = len(logs)
    completed = sum(1 for log in logs if log.status == "완료")
    by_category: dict[str, int] = {}
    for log in logs:
        by_category[log.category] = by_category.get(log.category, 0) + 1
    return {
        "total": total,
        "completed": completed,
        "in_progress": total - completed,
        "by_category": by_category,
    }


@router.get("/insights", response_model=WorkLogInsightsResponse)
def get_worklog_insights(
    period: Literal["week", "month", "quarter"] = Query("month"),
    db: Session = Depends(get_db),
):
    """업무기록 인사이트: 기간 선택 가능 (주/월/분기)."""
    today = date.today()
    if period == "week":
        start_date = today - timedelta(days=7)
    elif period == "month":
        start_date = today - timedelta(days=30)
    else:
        start_date = today - timedelta(days=90)

    logs = db.query(WorkLog).filter(WorkLog.date >= start_date).all()

    time_by_category: dict[str, int] = {}
    time_accuracy = {"over": 0, "under": 0, "accurate": 0}
    daily_counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}
    status_counts = {"completed": 0, "in_progress": 0}
    weekday_counts: dict[int, int] = {i: 0 for i in range(7)}

    all_lessons: list[str] = []
    follow_up_total = 0
    follow_up_completed = 0

    for log in logs:
        category = log.category or "기타"
        actual_minutes = parse_time_to_minutes(log.actual_time)
        estimated_minutes = parse_time_to_minutes(log.estimated_time)

        time_by_category[category] = time_by_category.get(category, 0) + actual_minutes

        if estimated_minutes > 0 and actual_minutes > 0:
            diff = actual_minutes - estimated_minutes
            if diff > 10:
                time_accuracy["over"] += 1
            elif diff < -10:
                time_accuracy["under"] += 1
            else:
                time_accuracy["accurate"] += 1

        if log.date:
            day_key = log.date.isoformat()
            daily_counts[day_key] = daily_counts.get(day_key, 0) + 1
            weekday_counts[log.date.weekday()] = weekday_counts.get(log.date.weekday(), 0) + 1

        category_counts[category] = category_counts.get(category, 0) + 1

        status_value = (log.status or "").lower()
        if status_value in ("completed", "완료"):
            status_counts["completed"] += 1
        else:
            status_counts["in_progress"] += 1

        for lesson in log.lessons or []:
            if lesson.content:
                all_lessons.append(lesson.content)

        for follow_up in log.follow_ups or []:
            follow_up_total += 1
            if follow_up.target_date and follow_up.target_date <= today:
                follow_up_completed += 1

    category_avg_time: dict[str, int] = {}
    for category, total_minutes in time_by_category.items():
        count = category_counts.get(category, 1)
        category_avg_time[category] = round(total_minutes / count)

    return {
        "period": period,
        "total_logs": len(logs),
        "time_by_category": time_by_category,
        "time_accuracy": time_accuracy,
        "daily_counts": daily_counts,
        "category_counts": category_counts,
        "status_counts": status_counts,
        "weekday_counts": weekday_counts,
        "recent_lessons": all_lessons[-10:],
        "follow_up_rate": {
            "total": follow_up_total,
            "completed": follow_up_completed,
        },
        "category_avg_time": category_avg_time,
    }


@router.get("", response_model=list[WorkLogResponse])
def list_worklogs(
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    query = db.query(WorkLog)
    if date_from:
        query = query.filter(WorkLog.date >= date_from)
    if date_to:
        query = query.filter(WorkLog.date <= date_to)
    if category:
        query = query.filter(WorkLog.category == category)
    return query.order_by(WorkLog.date.desc(), WorkLog.id.desc()).offset(offset).limit(limit).all()


@router.get("/{worklog_id}", response_model=WorkLogResponse)
def get_worklog(worklog_id: int, db: Session = Depends(get_db)):
    wl = db.get(WorkLog, worklog_id)
    if not wl:
        raise HTTPException(status_code=404, detail="업무 기록을 찾을 수 없습니다")
    return wl


@router.post("", response_model=WorkLogResponse, status_code=201)
def create_worklog(data: WorkLogCreate, db: Session = Depends(get_db)):
    wl = WorkLog(
        date=data.date,
        category=data.category,
        title=data.title,
        content=data.content,
        status=data.status,
        estimated_time=data.estimated_time,
        actual_time=data.actual_time,
        time_diff=data.time_diff,
        task_id=data.task_id,
    )
    for i, detail in enumerate(data.details):
        wl.details.append(WorkLogDetail(content=detail.content, order=detail.order or i))
    for i, lesson in enumerate(data.lessons):
        wl.lessons.append(WorkLogLesson(content=lesson.content, order=lesson.order or i))
    for i, follow_up in enumerate(data.follow_ups):
        wl.follow_ups.append(WorkLogFollowUp(content=follow_up.content, target_date=follow_up.target_date, order=follow_up.order or i))

    db.add(wl)
    db.commit()
    db.refresh(wl)
    return wl


@router.put("/{worklog_id}", response_model=WorkLogResponse)
def update_worklog(worklog_id: int, data: WorkLogUpdate, db: Session = Depends(get_db)):
    wl = db.get(WorkLog, worklog_id)
    if not wl:
        raise HTTPException(status_code=404, detail="업무 기록을 찾을 수 없습니다")

    for key, value in data.model_dump(exclude_unset=True, exclude={"details", "lessons", "follow_ups"}).items():
        setattr(wl, key, value)

    if data.details is not None:
        wl.details.clear()
        for i, detail in enumerate(data.details):
            wl.details.append(WorkLogDetail(content=detail.content, order=detail.order or i))

    if data.lessons is not None:
        wl.lessons.clear()
        for i, lesson in enumerate(data.lessons):
            wl.lessons.append(WorkLogLesson(content=lesson.content, order=lesson.order or i))

    if data.follow_ups is not None:
        wl.follow_ups.clear()
        for i, follow_up in enumerate(data.follow_ups):
            wl.follow_ups.append(WorkLogFollowUp(content=follow_up.content, target_date=follow_up.target_date, order=follow_up.order or i))

    db.commit()
    db.refresh(wl)
    return wl


@router.delete("/{worklog_id}", status_code=204)
def delete_worklog(worklog_id: int, db: Session = Depends(get_db)):
    wl = db.get(WorkLog, worklog_id)
    if not wl:
        raise HTTPException(status_code=404, detail="업무 기록을 찾을 수 없습니다")
    db.delete(wl)
    db.commit()
