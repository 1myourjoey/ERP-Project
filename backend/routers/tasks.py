from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models.calendar_event import CalendarEvent
from models.task import Task
from schemas.task import (
    TaskCreate, TaskUpdate, TaskComplete, TaskMove,
    TaskResponse, TaskBoardResponse,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/board", response_model=TaskBoardResponse)
def get_task_board(status: str = "pending", db: Session = Depends(get_db)):
    query = db.query(Task)
    if status != "all":
        query = query.filter(Task.status == status)
    tasks = query.order_by(Task.deadline.asc().nullslast(), Task.created_at.asc()).all()

    board = {"Q1": [], "Q2": [], "Q3": [], "Q4": []}
    for t in tasks:
        if t.quadrant in board:
            board[t.quadrant].append(t)
    return board


@router.get("", response_model=list[TaskResponse])
def list_tasks(
    quadrant: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Task)
    if quadrant:
        query = query.filter(Task.quadrant == quadrant)
    if status:
        query = query.filter(Task.status == status)
    return query.order_by(Task.deadline.asc().nullslast(), Task.created_at.asc()).all()


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    return task


@router.post("", response_model=TaskResponse, status_code=201)
def create_task(data: TaskCreate, db: Session = Depends(get_db)):
    task = Task(**data.model_dump())
    db.add(task)
    db.flush()

    if task.deadline:
        db.add(
            CalendarEvent(
                title=task.title,
                date=task.deadline.date(),
                status="pending",
                task_id=task.id,
            )
        )

    db.commit()
    db.refresh(task)
    return task


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(task, key, val)

    linked_event = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.task_id == task.id)
        .order_by(CalendarEvent.id.asc())
        .first()
    )

    if task.deadline:
        if linked_event:
            linked_event.title = task.title
            linked_event.date = task.deadline.date()
        else:
            db.add(
                CalendarEvent(
                    title=task.title,
                    date=task.deadline.date(),
                    status="pending",
                    task_id=task.id,
                )
            )
    elif linked_event:
        db.delete(linked_event)

    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}/move", response_model=TaskResponse)
def move_task(task_id: int, data: TaskMove, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if data.quadrant not in ("Q1", "Q2", "Q3", "Q4"):
        raise HTTPException(status_code=400, detail="유효하지 않은 사분면입니다")
    task.quadrant = data.quadrant
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}/complete", response_model=TaskResponse)
def complete_task(task_id: int, data: TaskComplete, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    task.status = "completed"
    task.completed_at = datetime.now()
    task.actual_time = data.actual_time
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    db.query(CalendarEvent).filter(CalendarEvent.task_id == task.id).delete()
    db.delete(task)
    db.commit()


