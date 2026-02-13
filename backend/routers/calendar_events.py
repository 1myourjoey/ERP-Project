from datetime import date, datetime, time

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.calendar_event import CalendarEvent
from models.task import Task
from schemas.calendar_event import CalendarEventCreate, CalendarEventUpdate, CalendarEventResponse

router = APIRouter(tags=["calendar"])


@router.get("/api/calendar-events", response_model=list[CalendarEventResponse])
def list_events(
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
    year: int | None = None,
    month: int | None = None,
    include_tasks: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(CalendarEvent)
    if year and month:
        month_start = date(year, month, 1)
        month_end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        query = query.filter(CalendarEvent.date >= month_start, CalendarEvent.date < month_end)
    if date_from:
        query = query.filter(CalendarEvent.date >= date_from)
    if date_to:
        query = query.filter(CalendarEvent.date <= date_to)
    if status:
        query = query.filter(CalendarEvent.status == status)

    rows = query.order_by(CalendarEvent.date.asc(), CalendarEvent.time.asc().nullslast(), CalendarEvent.id.asc()).all()
    task_ids = [event.task_id for event in rows if event.task_id is not None]
    tasks = db.query(Task).filter(Task.id.in_(task_ids)).all() if task_ids else []
    quadrant_by_task_id = {task.id: task.quadrant for task in tasks}

    events = [
        {
            "id": event.id,
            "title": event.title,
            "date": event.date,
            "time": event.time,
            "duration": event.duration,
            "description": event.description,
            "status": event.status,
            "task_id": event.task_id,
            "quadrant": quadrant_by_task_id.get(event.task_id) if event.task_id else None,
            "event_type": "event",
            "color": None,
        }
        for event in rows
    ]

    if include_tasks and status != "completed":
        task_query = db.query(Task).filter(
            Task.status.in_(["pending", "in_progress"]),
            Task.deadline.isnot(None),
        )
        if year and month:
            month_start = date(year, month, 1)
            month_end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
            task_query = task_query.filter(
                Task.deadline >= datetime.combine(month_start, time.min),
                Task.deadline < datetime.combine(month_end, time.min),
            )
        if date_from:
            task_query = task_query.filter(Task.deadline >= datetime.combine(date_from, time.min))
        if date_to:
            task_query = task_query.filter(Task.deadline <= datetime.combine(date_to, time.max))

        for task in task_query.order_by(Task.deadline.asc(), Task.id.asc()).all():
            deadline = task.deadline.date() if isinstance(task.deadline, datetime) else task.deadline
            if deadline is None:
                continue
            is_workflow_task = bool(task.workflow_instance_id)
            events.append(
                {
                    "id": -task.id,
                    "title": task.title,
                    "date": deadline,
                    "time": None,
                    "duration": None,
                    "description": task.memo,
                    "status": task.status,
                    "task_id": task.id,
                    "quadrant": task.quadrant,
                    "event_type": "workflow" if is_workflow_task else "task",
                    "color": "#8b5cf6" if is_workflow_task else "#3b82f6",
                }
            )

    events.sort(key=lambda event: (event["date"], event["time"] or time.max, event["id"]))
    return events


@router.get("/api/calendar-events/{event_id}", response_model=CalendarEventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(CalendarEvent, event_id)
    if not event:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")
    return event


@router.post("/api/calendar-events", response_model=CalendarEventResponse, status_code=201)
def create_event(data: CalendarEventCreate, db: Session = Depends(get_db)):
    event = CalendarEvent(**data.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.put("/api/calendar-events/{event_id}", response_model=CalendarEventResponse)
def update_event(event_id: int, data: CalendarEventUpdate, db: Session = Depends(get_db)):
    event = db.get(CalendarEvent, event_id)
    if not event:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(event, key, val)

    db.commit()
    db.refresh(event)
    return event


@router.delete("/api/calendar-events/{event_id}", status_code=204)
def delete_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(CalendarEvent, event_id)
    if not event:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")

    db.delete(event)
    db.commit()
