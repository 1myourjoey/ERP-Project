from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date

from database import get_db
from models.worklog import WorkLog, WorkLogDetail, WorkLogLesson, WorkLogFollowUp
from schemas.worklog import (
    WorkLogCreate, WorkLogUpdate, WorkLogResponse, WORKLOG_CATEGORIES,
)

router = APIRouter(prefix="/api/worklogs", tags=["worklogs"])


@router.get("/categories")
def get_categories():
    return WORKLOG_CATEGORIES


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    logs = db.query(WorkLog).all()
    total = len(logs)
    completed = sum(1 for l in logs if l.status == "완료")
    by_category: dict[str, int] = {}
    for l in logs:
        by_category[l.category] = by_category.get(l.category, 0) + 1
    return {
        "total": total,
        "completed": completed,
        "in_progress": total - completed,
        "by_category": by_category,
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
        raise HTTPException(404, "WorkLog not found")
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
    for i, d in enumerate(data.details):
        wl.details.append(WorkLogDetail(content=d.content, order=d.order or i))
    for i, l in enumerate(data.lessons):
        wl.lessons.append(WorkLogLesson(content=l.content, order=l.order or i))
    for i, f in enumerate(data.follow_ups):
        wl.follow_ups.append(WorkLogFollowUp(content=f.content, target_date=f.target_date, order=f.order or i))
    db.add(wl)
    db.commit()
    db.refresh(wl)
    return wl


@router.put("/{worklog_id}", response_model=WorkLogResponse)
def update_worklog(worklog_id: int, data: WorkLogUpdate, db: Session = Depends(get_db)):
    wl = db.get(WorkLog, worklog_id)
    if not wl:
        raise HTTPException(404, "WorkLog not found")

    for key, val in data.model_dump(exclude_unset=True, exclude={"details", "lessons", "follow_ups"}).items():
        setattr(wl, key, val)

    if data.details is not None:
        wl.details.clear()
        for i, d in enumerate(data.details):
            wl.details.append(WorkLogDetail(content=d.content, order=d.order or i))

    if data.lessons is not None:
        wl.lessons.clear()
        for i, l in enumerate(data.lessons):
            wl.lessons.append(WorkLogLesson(content=l.content, order=l.order or i))

    if data.follow_ups is not None:
        wl.follow_ups.clear()
        for i, f in enumerate(data.follow_ups):
            wl.follow_ups.append(WorkLogFollowUp(content=f.content, target_date=f.target_date, order=f.order or i))

    db.commit()
    db.refresh(wl)
    return wl


@router.delete("/{worklog_id}", status_code=204)
def delete_worklog(worklog_id: int, db: Session = Depends(get_db)):
    wl = db.get(WorkLog, worklog_id)
    if not wl:
        raise HTTPException(404, "WorkLog not found")
    db.delete(wl)
    db.commit()
