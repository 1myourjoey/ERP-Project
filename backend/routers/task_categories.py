from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models.task import Task
from models.task_category import TaskCategory

router = APIRouter(prefix="/api/task-categories", tags=["task-categories"])

DEFAULT_TASK_CATEGORIES = [
    "투자실행",
    "LP보고",
    "사후관리",
    "규약/총회",
    "서류관리",
    "일반",
]


class TaskCategoryCreate(BaseModel):
    name: str


class TaskCategoryResponse(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


def _normalize_name(value: str) -> str:
    return value.strip()


def _ensure_defaults(db: Session) -> None:
    existing_count = db.query(func.count(TaskCategory.id)).scalar() or 0
    if existing_count > 0:
        return

    for name in DEFAULT_TASK_CATEGORIES:
        db.add(TaskCategory(name=name))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    except Exception:
        db.rollback()
        raise


@router.get("", response_model=list[TaskCategoryResponse])
def list_task_categories(db: Session = Depends(get_db)):
    _ensure_defaults(db)
    rows = db.query(TaskCategory).order_by(TaskCategory.id.asc()).all()
    return rows


@router.post("", response_model=TaskCategoryResponse, status_code=201)
def create_task_category(data: TaskCategoryCreate, db: Session = Depends(get_db)):
    name = _normalize_name(data.name)
    if not name:
        raise HTTPException(status_code=400, detail="카테고리 이름을 입력해주세요.")

    existing = db.query(TaskCategory).filter(func.lower(TaskCategory.name) == name.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="이미 존재하는 카테고리입니다.")

    row = TaskCategory(name=name)
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 존재하는 카테고리입니다.") from exc
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.delete("/{category_id}", status_code=204)
def delete_task_category(category_id: int, db: Session = Depends(get_db)):
    row = db.get(TaskCategory, category_id)
    if not row:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다.")

    in_use_count = db.query(func.count(Task.id)).filter(Task.category == row.name).scalar() or 0
    if in_use_count > 0:
        raise HTTPException(status_code=409, detail=f"{in_use_count}건의 업무에서 사용 중입니다.")

    db.delete(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
