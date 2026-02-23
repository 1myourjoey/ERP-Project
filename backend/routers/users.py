from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from schemas.user import UserCreate, UserResponse, UserUpdate

router = APIRouter(tags=["users"])


@router.get("/api/users", response_model=list[UserResponse])
def list_users(
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if active_only:
        query = query.filter(User.is_active == True)
    return query.order_by(User.id.desc()).all()


@router.post("/api/users", response_model=UserResponse, status_code=201)
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    email = (data.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="이메일은 필수입니다")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="이미 등록된 이메일입니다")

    row = User(
        email=email,
        name=(data.name or "").strip() or email,
        role=(data.role or "viewer").strip() or "viewer",
        department=(data.department or "").strip() or None,
        is_active=bool(data.is_active),
    )
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.put("/api/users/{user_id}", response_model=UserResponse)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    payload = data.model_dump(exclude_unset=True)
    if "email" in payload and payload["email"] is not None:
        email = payload["email"].strip().lower()
        if not email:
            raise HTTPException(status_code=400, detail="이메일은 빈 값일 수 없습니다")
        conflict = db.query(User).filter(User.email == email, User.id != user_id).first()
        if conflict:
            raise HTTPException(status_code=409, detail="이미 등록된 이메일입니다")
        payload["email"] = email

    if "name" in payload and payload["name"] is not None:
        payload["name"] = payload["name"].strip()
    if "role" in payload and payload["role"] is not None:
        payload["role"] = payload["role"].strip() or row.role
    if "department" in payload and payload["department"] is not None:
        payload["department"] = payload["department"].strip() or None

    for key, value in payload.items():
        setattr(row, key, value)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.patch("/api/users/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(user_id: int, db: Session = Depends(get_db)):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    row.is_active = False
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row
