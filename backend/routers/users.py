from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import (
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES,
    clear_login_failures,
    create_password_reset_token,
    hash_password,
    require_master,
    validate_password,
)
from models.audit_log import AuditLog
from models.user import User
from schemas.user import (
    AdminResetPasswordRequest,
    ResetPasswordTokenResponse,
    UserApproveRequest,
    UserCreate,
    UserResponse,
    UserUpdate,
)

router = APIRouter(tags=["users"])

VALID_ROLES = {"master", "admin", "manager", "viewer"}


def _normalize_email(value: str | None) -> str | None:
    normalized = (value or "").strip().lower()
    return normalized or None


def _is_placeholder_email(value: str | None) -> bool:
    return bool(value and value.endswith("@local.invalid"))


def _resolve_email(value: str | None, username: str) -> str:
    return value or f"{username}@local.invalid"


def _normalize_username(value: str | None) -> str:
    return (value or "").strip().lower()


def _normalize_name(value: str | None, fallback: str) -> str:
    normalized = (value or "").strip()
    return normalized or fallback


def _normalize_allowed_routes(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    normalized: list[str] = []
    for item in value:
        route = (item or "").strip()
        if not route:
            continue
        if route not in normalized:
            normalized.append(route)
    return normalized


def _normalize_role(value: str | None, fallback: str = "viewer") -> str:
    role = (value or fallback).strip().lower() or fallback
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="지원하지 않는 role 입니다.")
    return role


def _record_audit(
    db: Session,
    request: Request,
    *,
    action: str,
    actor_id: int | None,
    target_id: int | None,
    detail: str | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=actor_id,
            action=action,
            target_type="user",
            target_id=target_id,
            detail=detail,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )


@router.get("/api/users", response_model=list[UserResponse])
def list_users(
    active_only: bool = False,
    db: Session = Depends(get_db),
    _master: User = Depends(require_master),
):
    query = db.query(User)
    if active_only:
        query = query.filter(User.is_active == True)
    return query.order_by(User.id.desc()).all()


@router.get("/api/users/pending", response_model=list[UserResponse])
def list_pending_users(
    db: Session = Depends(get_db),
    _master: User = Depends(require_master),
):
    return (
        db.query(User)
        .filter(User.is_pending_approval == True)
        .order_by(User.created_at.desc(), User.id.desc())
        .all()
    )


@router.post("/api/users", response_model=UserResponse, status_code=201)
def create_user(
    data: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master),
):
    username = _normalize_username(data.username)
    if not username:
        raise HTTPException(status_code=400, detail="아이디(username)는 필수입니다.")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="이미 등록된 아이디(username)입니다.")

    email = _normalize_email(data.email)
    if email and db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="이미 등록된 이메일입니다.")

    role = _normalize_role(data.role, fallback="viewer")
    allowed_routes = _normalize_allowed_routes(data.allowed_routes)
    if role in {"master", "admin"}:
        allowed_routes = None

    password_error = validate_password(data.password)
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)

    google_id = (data.google_id or "").strip() or None
    if google_id and db.query(User).filter(User.google_id == google_id).first():
        raise HTTPException(status_code=409, detail="이미 연결된 Google 계정입니다.")

    row = User(
        username=username,
        email=_resolve_email(email, username),
        name=_normalize_name(data.name, fallback=username),
        password_hash=hash_password(data.password),
        role=role,
        department=(data.department or "").strip() or None,
        is_active=bool(data.is_active),
        is_pending_approval=False,
        google_id=google_id,
    )
    row.allowed_routes = allowed_routes
    db.add(row)
    db.flush()
    _record_audit(
        db,
        request,
        action="user_create",
        actor_id=current_user.id,
        target_id=row.id,
        detail=f'{{"role":"{row.role}"}}',
    )
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.patch("/api/users/{user_id}/approve", response_model=UserResponse)
def approve_user(
    user_id: int,
    request: Request,
    data: UserApproveRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master),
):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    payload = (data.model_dump(exclude_unset=True) if data else {}) or {}
    if payload.get("role") is not None:
        row.role = _normalize_role(payload.get("role"), fallback=row.role)
    if "allowed_routes" in payload:
        row.allowed_routes = _normalize_allowed_routes(payload.get("allowed_routes"))
    if row.role in {"master", "admin"}:
        row.allowed_routes = None

    row.is_active = True
    row.is_pending_approval = False
    row.password_reset_requested_at = None
    _record_audit(
        db,
        request,
        action="user_approve",
        actor_id=current_user.id,
        target_id=row.id,
    )
    db.commit()
    db.refresh(row)
    return row


@router.patch("/api/users/{user_id}/reject", response_model=dict[str, bool])
def reject_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master),
):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if row.id == current_user.id:
        raise HTTPException(status_code=400, detail="자기 자신을 거절할 수 없습니다.")

    _record_audit(
        db,
        request,
        action="user_reject",
        actor_id=current_user.id,
        target_id=row.id,
    )
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.put("/api/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master),
):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    payload = data.model_dump(exclude_unset=True)
    role_changed = False
    permission_changed = False

    if "username" in payload and payload["username"] is not None:
        username = _normalize_username(payload["username"])
        if not username:
            raise HTTPException(status_code=400, detail="아이디(username)는 빈 값일 수 없습니다.")
        conflict = db.query(User).filter(User.username == username, User.id != user_id).first()
        if conflict:
            raise HTTPException(status_code=409, detail="이미 등록된 아이디(username)입니다.")
        row.username = username
        if _is_placeholder_email(row.email):
            row.email = _resolve_email(None, username)

    if "email" in payload:
        email = _normalize_email(payload["email"])
        if email:
            conflict = db.query(User).filter(User.email == email, User.id != user_id).first()
            if conflict:
                raise HTTPException(status_code=409, detail="이미 등록된 이메일입니다.")
        row.email = _resolve_email(email, row.username)

    if "name" in payload and payload["name"] is not None:
        row.name = _normalize_name(payload["name"], fallback=row.username)

    if "role" in payload and payload["role"] is not None:
        role = _normalize_role(payload["role"], fallback=row.role)
        role_changed = role != row.role
        row.role = role
        if role in {"master", "admin"}:
            if row.allowed_routes is not None:
                permission_changed = True
            row.allowed_routes = None

    if "department" in payload and payload["department"] is not None:
        row.department = (payload["department"] or "").strip() or None

    if "is_active" in payload and payload["is_active"] is not None:
        row.is_active = bool(payload["is_active"])
        if row.is_active:
            row.is_pending_approval = False

    if "google_id" in payload:
        google_id = (payload.get("google_id") or "").strip() or None
        if google_id:
            conflict = db.query(User).filter(User.google_id == google_id, User.id != user_id).first()
            if conflict:
                raise HTTPException(status_code=409, detail="이미 연결된 Google 계정입니다.")
        row.google_id = google_id

    if "allowed_routes" in payload:
        next_routes = _normalize_allowed_routes(payload.get("allowed_routes"))
        if row.role in {"master", "admin"}:
            next_routes = None
        permission_changed = next_routes != row.allowed_routes
        row.allowed_routes = next_routes

    if "password" in payload and payload["password"] is not None:
        password = (payload["password"] or "").strip()
        if password:
            password_error = validate_password(password)
            if password_error:
                raise HTTPException(status_code=400, detail=password_error)
            row.password_hash = hash_password(password)
            row.password_changed_at = datetime.utcnow()
            row.password_reset_requested_at = None
            row.token_invalidated_at = datetime.utcnow()
            clear_login_failures(row)

    _record_audit(
        db,
        request,
        action="user_update",
        actor_id=current_user.id,
        target_id=row.id,
        detail=f'{{"role_changed":{str(role_changed).lower()}}}',
    )
    if permission_changed:
        _record_audit(
            db,
            request,
            action="permission_change",
            actor_id=current_user.id,
            target_id=row.id,
        )
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.patch("/api/users/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master),
):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    row.is_active = False
    row.is_pending_approval = False
    _record_audit(
        db,
        request,
        action="user_update",
        actor_id=current_user.id,
        target_id=row.id,
        detail='{"is_active":false}',
    )
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return row


@router.post("/api/users/{user_id}/reset-password", response_model=dict[str, bool])
def admin_reset_password(
    user_id: int,
    data: AdminResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master),
):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    password_error = validate_password(data.new_password)
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)

    row.password_hash = hash_password(data.new_password)
    row.password_changed_at = datetime.utcnow()
    row.password_reset_requested_at = None
    row.token_invalidated_at = datetime.utcnow()
    clear_login_failures(row)
    _record_audit(
        db,
        request,
        action="admin_password_reset",
        actor_id=current_user.id,
        target_id=row.id,
    )
    db.commit()
    return {"ok": True}


@router.post("/api/users/{user_id}/generate-reset-token", response_model=ResetPasswordTokenResponse)
def generate_reset_token(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master),
):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    token = create_password_reset_token(row.id)
    reset_url = f"/reset-password?token={token}"
    _record_audit(
        db,
        request,
        action="password_reset_token_generate",
        actor_id=current_user.id,
        target_id=row.id,
    )
    db.commit()
    return ResetPasswordTokenResponse(
        reset_token=token,
        reset_url=reset_url,
        expires_in_minutes=PASSWORD_RESET_TOKEN_EXPIRE_MINUTES,
    )


@router.post("/api/users/{user_id}/unlock", response_model=UserResponse)
def unlock_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master),
):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    clear_login_failures(row)
    _record_audit(
        db,
        request,
        action="user_unlock",
        actor_id=current_user.id,
        target_id=row.id,
    )
    db.commit()
    db.refresh(row)
    return row
