from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from database import get_db
from models.calendar_event import CalendarEvent
from models.task import Task
from models.worklog import WorkLog, WorkLogDetail

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class BulkTaskIdPayload(BaseModel):
    task_ids: list[int] = Field(default_factory=list)

    @field_validator("task_ids")
    @classmethod
    def validate_task_ids(cls, value: list[int]) -> list[int]:
        unique_ids: list[int] = []
        seen: set[int] = set()
        for raw_id in value:
            task_id = int(raw_id)
            if task_id <= 0:
                raise ValueError("task_ids는 양의 정수여야 합니다")
            if task_id in seen:
                continue
            seen.add(task_id)
            unique_ids.append(task_id)

        if not unique_ids:
            raise ValueError("최소 1개 이상의 task_id가 필요합니다")
        return unique_ids


class BulkCompletePayload(BulkTaskIdPayload):
    actual_time: str
    auto_worklog: bool = True

    @field_validator("actual_time")
    @classmethod
    def validate_actual_time(cls, value: str) -> str:
        normalized = (value or "").strip()
        if not normalized:
            raise ValueError("actual_time은 비어 있을 수 없습니다")
        return normalized


class BulkCompleteResponse(BaseModel):
    completed_count: int
    skipped_count: int


class BulkDeleteResponse(BaseModel):
    deleted_count: int


def _load_tasks_or_404(db: Session, task_ids: list[int]) -> list[Task]:
    rows = db.query(Task).filter(Task.id.in_(task_ids)).all()
    found_ids = {row.id for row in rows}
    missing_ids = [task_id for task_id in task_ids if task_id not in found_ids]
    if missing_ids:
        missing_text = ", ".join(str(task_id) for task_id in missing_ids)
        raise HTTPException(status_code=404, detail=f"작업을 찾을 수 없습니다: {missing_text}")
    return rows


@router.post("/bulk-complete", response_model=BulkCompleteResponse)
def bulk_complete_tasks(payload: BulkCompletePayload, db: Session = Depends(get_db)):
    rows = _load_tasks_or_404(db, payload.task_ids)
    workflow_linked = [row.id for row in rows if row.workflow_instance_id is not None and row.status != "completed"]
    if workflow_linked:
        task_text = ", ".join(str(task_id) for task_id in workflow_linked)
        raise HTTPException(
            status_code=400,
            detail=f"워크플로 연동 작업은 개별 완료가 필요합니다: {task_text}",
        )

    now = datetime.now()
    completed_count = 0
    skipped_count = 0
    for task in rows:
        if task.status == "completed":
            skipped_count += 1
            continue

        task.status = "completed"
        task.completed_at = now
        task.actual_time = payload.actual_time
        completed_count += 1

        if payload.auto_worklog:
            content = task.memo or f"{task.title} 완료"
            worklog = WorkLog(
                date=date.today(),
                category="업무",
                title=f"[완료] {task.title}",
                content=content,
                status="완료",
                actual_time=payload.actual_time,
                task_id=task.id,
            )
            db.add(worklog)
            db.flush()
            if task.memo:
                db.add(WorkLogDetail(worklog_id=worklog.id, content=task.memo, order=0))

    db.commit()
    return BulkCompleteResponse(completed_count=completed_count, skipped_count=skipped_count)


@router.post("/bulk-delete", response_model=BulkDeleteResponse)
def bulk_delete_tasks(payload: BulkTaskIdPayload, db: Session = Depends(get_db)):
    rows = _load_tasks_or_404(db, payload.task_ids)
    task_ids = [row.id for row in rows]

    db.query(CalendarEvent).filter(CalendarEvent.task_id.in_(task_ids)).delete(synchronize_session=False)
    db.query(Task).filter(Task.id.in_(task_ids)).delete(synchronize_session=False)
    db.commit()
    return BulkDeleteResponse(deleted_count=len(task_ids))
