from datetime import date

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
    db: Session = Depends(get_db),
):
    query = db.query(CalendarEvent)
    if date_from:
        query = query.filter(CalendarEvent.date >= date_from)
    if date_to:
        query = query.filter(CalendarEvent.date <= date_to)
    if status:
        query = query.filter(CalendarEvent.status == status)

    events = query.order_by(CalendarEvent.date.asc(), CalendarEvent.time.asc().nullslast(), CalendarEvent.id.asc()).all()
    task_ids = [event.task_id for event in events if event.task_id is not None]
    tasks = db.query(Task).filter(Task.id.in_(task_ids)).all() if task_ids else []
    quadrant_by_task_id = {task.id: task.quadrant for task in tasks}

    return [
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
        }
        for event in events
    ]


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


