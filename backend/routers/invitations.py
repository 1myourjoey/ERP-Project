import os
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import require_master
from models.audit_log import AuditLog
from models.invitation import Invitation
from models.user import User
from schemas.user import (
    InvitationCreateRequest,
    InvitationResponse,
    InvitationVerifyResponse,
)

router = APIRouter(tags=["invitations"])

VALID_ROLES = {"master", "admin", "manager", "viewer"}


def _normalize_email(value: str | None) -> str | None:
    normalized = (value or "").strip().lower()
    return normalized or None


def _normalize_role(value: str | None, fallback: str = "viewer") -> str:
    role = (value or fallback).strip().lower() or fallback
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="지원하지 않는 역할입니다.")
    return role


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


def _build_invite_url(token: str) -> str:
    frontend_base = os.environ.get("FRONTEND_BASE_URL", "").strip().rstrip("/")
    suffix = f"/register?invite={token}"
    return f"{frontend_base}{suffix}" if frontend_base else suffix


def _status_of(invitation: Invitation, now: datetime | None = None) -> str:
    now_value = now or datetime.utcnow()
    if invitation.used_at is not None or invitation.used_by is not None:
        return "used"
    if invitation.expires_at < now_value:
        return "expired"
    return "pending"


def _to_response(invitation: Invitation) -> InvitationResponse:
    return InvitationResponse(
        id=invitation.id,
        token=invitation.token,
        email=invitation.email,
        name=invitation.name,
        role=invitation.role,
        department=invitation.department,
        allowed_routes=invitation.allowed_routes,
        created_by=invitation.created_by,
        used_by=invitation.used_by,
        used_at=invitation.used_at,
        expires_at=invitation.expires_at,
        created_at=invitation.created_at,
        status=_status_of(invitation),
        invite_url=_build_invite_url(invitation.token),
    )


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
            target_type="invitation",
            target_id=target_id,
            detail=detail,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )


@router.post("/api/invitations", response_model=InvitationResponse, status_code=201)
def create_invitation(
    data: InvitationCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master),
):
    if data.expires_in_days < 1 or data.expires_in_days > 365:
        raise HTTPException(status_code=400, detail="만료 기간은 1~365일 사이여야 합니다.")

    role = _normalize_role(data.role, fallback="viewer")
    allowed_routes = _normalize_allowed_routes(data.allowed_routes)
    if role in {"master", "admin"}:
        allowed_routes = None

    token = ""
    for _ in range(5):
        candidate = secrets.token_urlsafe(24)
        exists = db.query(Invitation).filter(Invitation.token == candidate).first()
        if not exists:
            token = candidate
            break
    if not token:
        raise HTTPException(status_code=500, detail="초대 토큰 생성에 실패했습니다.")

    row = Invitation(
        token=token,
        email=_normalize_email(data.email),
        name=(data.name or "").strip() or None,
        role=role,
        department=(data.department or "").strip() or None,
        created_by=current_user.id,
        expires_at=datetime.utcnow() + timedelta(days=data.expires_in_days),
    )
    row.allowed_routes = allowed_routes
    db.add(row)
    db.flush()
    _record_audit(
        db,
        request,
        action="invitation_create",
        actor_id=current_user.id,
        target_id=row.id,
        detail=f'{{"role":"{row.role}"}}',
    )
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.get("/api/invitations", response_model=list[InvitationResponse])
def list_invitations(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_master),
):
    rows = db.query(Invitation).order_by(Invitation.id.desc()).all()
    return [_to_response(row) for row in rows]


@router.delete("/api/invitations/{invitation_id}", response_model=dict[str, bool])
def cancel_invitation(
    invitation_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master),
):
    row = db.get(Invitation, invitation_id)
    if not row:
        raise HTTPException(status_code=404, detail="초대를 찾을 수 없습니다.")
    if row.used_at is not None or row.used_by is not None:
        raise HTTPException(status_code=400, detail="이미 사용된 초대는 취소할 수 없습니다.")

    _record_audit(
        db,
        request,
        action="invitation_cancel",
        actor_id=current_user.id,
        target_id=row.id,
    )
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/api/invitations/verify", response_model=InvitationVerifyResponse)
def verify_invitation(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    value = (token or "").strip()
    if not value:
        return InvitationVerifyResponse(valid=False, message="초대 토큰이 없습니다.")

    row = db.query(Invitation).filter(Invitation.token == value).first()
    if not row:
        return InvitationVerifyResponse(valid=False, message="유효하지 않은 초대입니다.")
    if row.used_at is not None or row.used_by is not None:
        return InvitationVerifyResponse(valid=False, message="이미 사용된 초대입니다.")
    if row.expires_at < datetime.utcnow():
        return InvitationVerifyResponse(valid=False, message="만료된 초대입니다.")

    return InvitationVerifyResponse(valid=True, invitation=_to_response(row))
