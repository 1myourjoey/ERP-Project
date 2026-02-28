import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    clear_login_failures,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    find_user_by_login_id,
    get_current_user,
    hash_password,
    is_user_locked,
    register_login_failure,
    validate_password,
    verify_password,
)
from models.audit_log import AuditLog
from models.invitation import Invitation
from models.user import User
from schemas.user import (
    AvailabilityResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    GoogleLoginRequest,
    LoginRequest,
    LoginResponse,
    ProfileUpdateRequest,
    RefreshTokenRequest,
    RegisterRequest,
    RegisterResponse,
    RegisterResponseUser,
    RegisterWithInviteRequest,
    ResetPasswordRequest,
    UserResponse,
)

router = APIRouter(tags=["auth"])

VALID_ROLES = {"master", "admin", "manager", "viewer"}
USERNAME_PATTERN = re.compile(r"^[a-z0-9_]+$")


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


def validate_username(username: str) -> str | None:
    if not username or len(username) < 4:
        return "아이디는 최소 4자 이상이어야 합니다."
    if len(username) > 20:
        return "아이디는 최대 20자까지 가능합니다."
    if not USERNAME_PATTERN.match(username):
        return "아이디는 영문 소문자, 숫자, 밑줄(_)만 사용할 수 있습니다."
    return None


def _record_audit(
    db: Session,
    request: Request,
    *,
    action: str,
    user_id: int | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    detail: str | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )


def _login_response(user: User) -> LoginResponse:
    return LoginResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user),
    )


def _verify_google_credential(credential: str) -> dict:
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        raise HTTPException(status_code=503, detail="Google 로그인 설정이 비어 있습니다.")

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Google 로그인 라이브러리가 설치되지 않았습니다.") from exc

    try:
        payload = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Google 토큰 검증에 실패했습니다.") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Google 토큰 검증에 실패했습니다.")
    return payload


def _is_token_invalidated(user: User, payload: dict) -> bool:
    if user.token_invalidated_at is None:
        return False
    token_iat_raw = payload.get("iat")
    if token_iat_raw is None:
        return True
    try:
        token_iat = datetime.fromtimestamp(float(token_iat_raw), tz=timezone.utc)
    except (TypeError, ValueError):
        return True
    invalidated_at = user.token_invalidated_at
    if invalidated_at.tzinfo is None:
        invalidated_at = invalidated_at.replace(tzinfo=timezone.utc)
    else:
        invalidated_at = invalidated_at.astimezone(timezone.utc)
    return token_iat < invalidated_at


@router.post("/api/auth/register", response_model=RegisterResponse, status_code=201)
def register(data: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    username = _normalize_username(data.username)
    username_error = validate_username(username)
    if username_error:
        raise HTTPException(status_code=400, detail=username_error)
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.")

    email = _normalize_email(data.email)
    if email and db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="이미 사용 중인 이메일입니다.")

    password_error = validate_password(data.password)
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)

    row = User(
        username=username,
        email=_resolve_email(email, username),
        name=_normalize_name(data.name, fallback=username),
        password_hash=hash_password(data.password),
        role="viewer",
        department=(data.department or "").strip() or None,
        is_active=False,
        is_pending_approval=True,
    )
    row.allowed_routes = None
    db.add(row)
    db.flush()
    _record_audit(
        db,
        request,
        action="register",
        user_id=row.id,
        target_type="user",
        target_id=row.id,
    )
    db.commit()
    db.refresh(row)
    return RegisterResponse(
        message="가입 신청이 완료되었습니다. 관리자의 승인 후 로그인할 수 있습니다.",
        user=RegisterResponseUser(
            id=row.id,
            username=row.username,
            name=row.name,
            is_active=row.is_active,
        ),
    )


@router.get("/api/auth/check-username", response_model=AvailabilityResponse)
def check_username(
    username: str = Query(...),
    db: Session = Depends(get_db),
):
    normalized = _normalize_username(username)
    username_error = validate_username(normalized)
    if username_error:
        return AvailabilityResponse(available=False, message=username_error)
    exists = db.query(User).filter(User.username == normalized).first() is not None
    if exists:
        return AvailabilityResponse(available=False, message="이미 사용 중인 아이디입니다.")
    return AvailabilityResponse(available=True)


@router.get("/api/auth/check-email", response_model=AvailabilityResponse)
def check_email(
    email: str = Query(...),
    db: Session = Depends(get_db),
):
    normalized = _normalize_email(email)
    if not normalized:
        return AvailabilityResponse(available=True)
    exists = db.query(User).filter(User.email == normalized).first() is not None
    if exists:
        return AvailabilityResponse(available=False, message="이미 사용 중인 이메일입니다.")
    return AvailabilityResponse(available=True)


@router.post("/api/auth/register-with-invite", response_model=LoginResponse)
def register_with_invite(data: RegisterWithInviteRequest, request: Request, db: Session = Depends(get_db)):
    token = (data.token or "").strip()
    invitation = db.query(Invitation).filter(Invitation.token == token).first()
    if not invitation:
        raise HTTPException(status_code=400, detail="유효하지 않은 초대 토큰입니다.")
    if invitation.used_at is not None or invitation.used_by is not None:
        raise HTTPException(status_code=400, detail="이미 사용된 초대 토큰입니다.")
    if invitation.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="만료된 초대 토큰입니다.")

    username = _normalize_username(data.username)
    username_error = validate_username(username)
    if username_error:
        raise HTTPException(status_code=400, detail=username_error)
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.")

    if invitation.email and db.query(User).filter(User.email == invitation.email).first():
        raise HTTPException(status_code=409, detail="초대에 지정된 이메일이 이미 사용 중입니다.")

    password_error = validate_password(data.password)
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)

    role = invitation.role if invitation.role in VALID_ROLES else "viewer"
    user_name = _normalize_name(data.name or invitation.name, fallback=username)
    row = User(
        username=username,
        email=_resolve_email(invitation.email, username),
        name=user_name,
        password_hash=hash_password(data.password),
        role=role,
        department=invitation.department,
        is_active=True,
        is_pending_approval=False,
    )
    row.allowed_routes = _normalize_allowed_routes(invitation.allowed_routes)
    db.add(row)
    db.flush()

    invitation.used_by = row.id
    invitation.used_at = datetime.utcnow()

    _record_audit(
        db,
        request,
        action="register_with_invite",
        user_id=row.id,
        target_type="invitation",
        target_id=invitation.id,
    )
    db.commit()
    db.refresh(row)
    return _login_response(row)


@router.post("/api/auth/login", response_model=LoginResponse)
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = find_user_by_login_id(db, data.login_id)
    if not user or not user.is_active:
        _record_audit(
            db,
            request,
            action="login_fail",
            detail='{"reason":"not_found_or_inactive"}',
        )
        db.commit()
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")

    if is_user_locked(user):
        _record_audit(
            db,
            request,
            action="login_fail",
            user_id=user.id,
            target_type="user",
            target_id=user.id,
            detail='{"reason":"locked"}',
        )
        db.commit()
        raise HTTPException(status_code=400, detail="계정이 잠겼습니다. 잠시 후 다시 시도해 주세요.")

    if not verify_password(data.password, user.password_hash):
        register_login_failure(user)
        lock_detail = '{"reason":"invalid_password"}'
        if is_user_locked(user):
            lock_detail = '{"reason":"locked_after_failures"}'
        _record_audit(
            db,
            request,
            action="login_fail",
            user_id=user.id,
            target_type="user",
            target_id=user.id,
            detail=lock_detail,
        )
        db.commit()
        if is_user_locked(user):
            raise HTTPException(status_code=400, detail="로그인 실패 횟수를 초과해 계정이 잠겼습니다.")
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")

    clear_login_failures(user)
    user.last_login_at = datetime.utcnow()
    _record_audit(
        db,
        request,
        action="login",
        user_id=user.id,
        target_type="user",
        target_id=user.id,
    )
    db.commit()
    db.refresh(user)
    return _login_response(user)


@router.post("/api/auth/google", response_model=LoginResponse)
def google_login(data: GoogleLoginRequest, request: Request, db: Session = Depends(get_db)):
    payload = _verify_google_credential(data.credential)

    google_id = str(payload.get("sub") or "").strip()
    email = _normalize_email(str(payload.get("email") or "").strip())
    name = str(payload.get("name") or "").strip()
    avatar_url = str(payload.get("picture") or "").strip() or None
    if not google_id:
        raise HTTPException(status_code=401, detail="Google 계정 연계 정보가 없습니다.")

    predicates = [User.google_id == google_id]
    if email:
        predicates.append(User.email == email)
    user = db.query(User).filter(or_(*predicates)).first()

    if not user:
        _record_audit(
            db,
            request,
            action="login_fail",
            detail='{"reason":"google_user_not_registered"}',
        )
        db.commit()
        raise HTTPException(status_code=400, detail="등록된 계정이 없습니다. 관리자에게 문의해 주세요.")

    if not user.is_active:
        _record_audit(
            db,
            request,
            action="login_fail",
            user_id=user.id,
            target_type="user",
            target_id=user.id,
            detail='{"reason":"inactive"}',
        )
        db.commit()
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다.")

    if is_user_locked(user):
        _record_audit(
            db,
            request,
            action="login_fail",
            user_id=user.id,
            target_type="user",
            target_id=user.id,
            detail='{"reason":"locked"}',
        )
        db.commit()
        raise HTTPException(status_code=400, detail="계정이 잠겼습니다. 잠시 후 다시 시도해 주세요.")

    user.google_id = google_id
    if email and not user.email:
        user.email = email
    if name and not user.name:
        user.name = name
    user.avatar_url = avatar_url
    user.last_login_at = datetime.utcnow()
    clear_login_failures(user)
    _record_audit(
        db,
        request,
        action="login",
        user_id=user.id,
        target_type="user",
        target_id=user.id,
        detail='{"provider":"google"}',
    )
    db.commit()
    db.refresh(user)
    return _login_response(user)


@router.get("/api/auth/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/api/auth/profile", response_model=UserResponse)
def update_profile(
    data: ProfileUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = data.model_dump(exclude_unset=True)
    if "name" in payload and payload["name"] is not None:
        name = _normalize_name(payload["name"], fallback=current_user.username)
        if not name:
            raise HTTPException(status_code=400, detail="이름을 입력해 주세요.")
        current_user.name = name

    if "email" in payload:
        email = _normalize_email(payload.get("email"))
        if email:
            conflict = db.query(User).filter(User.email == email, User.id != current_user.id).first()
            if conflict:
                raise HTTPException(status_code=409, detail="이미 사용 중인 이메일입니다.")
        current_user.email = _resolve_email(email, current_user.username)

    if "department" in payload:
        current_user.department = (payload.get("department") or "").strip() or None

    if "avatar_url" in payload:
        current_user.avatar_url = (payload.get("avatar_url") or "").strip() or None

    _record_audit(
        db,
        request,
        action="profile_update",
        user_id=current_user.id,
        target_type="user",
        target_id=current_user.id,
    )
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/api/auth/forgot-password", response_model=dict[str, str])
def forgot_password(data: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    user = find_user_by_login_id(db, data.login_id)
    if user:
        user.password_reset_requested_at = datetime.utcnow()
        _record_audit(
            db,
            request,
            action="password_reset_request",
            user_id=user.id,
            target_type="user",
            target_id=user.id,
        )
        db.commit()
    return {"message": "요청이 접수되었습니다."}


@router.post("/api/auth/reset-password", response_model=dict[str, bool])
def reset_password(data: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    password_error = validate_password(data.new_password)
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)

    payload = decode_token(data.token, expected_type="password_reset")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="유효하지 않은 재설정 토큰입니다.") from exc

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    user.password_hash = hash_password(data.new_password)
    user.password_changed_at = datetime.utcnow()
    user.password_reset_requested_at = None
    user.token_invalidated_at = datetime.utcnow()
    clear_login_failures(user)
    _record_audit(
        db,
        request,
        action="password_reset",
        user_id=user.id,
        target_type="user",
        target_id=user.id,
    )
    db.commit()
    return {"ok": True}


@router.post("/api/auth/link-google", response_model=UserResponse)
def link_google(
    data: GoogleLoginRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = _verify_google_credential(data.credential)
    google_id = str(payload.get("sub") or "").strip()
    email = _normalize_email(str(payload.get("email") or "").strip())
    avatar_url = str(payload.get("picture") or "").strip() or None
    if not google_id:
        raise HTTPException(status_code=400, detail="Google 계정 정보를 확인할 수 없습니다.")

    conflict = db.query(User).filter(User.google_id == google_id, User.id != current_user.id).first()
    if conflict:
        raise HTTPException(status_code=409, detail="다른 계정에 이미 연결된 Google 계정입니다.")

    if email:
        email_conflict = db.query(User).filter(User.email == email, User.id != current_user.id).first()
        if email_conflict:
            raise HTTPException(status_code=409, detail="다른 계정에서 사용 중인 이메일입니다.")

    current_user.google_id = google_id
    if email and (not current_user.email or _is_placeholder_email(current_user.email)):
        current_user.email = email
    current_user.avatar_url = avatar_url

    _record_audit(
        db,
        request,
        action="google_link",
        user_id=current_user.id,
        target_type="user",
        target_id=current_user.id,
    )
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/api/auth/unlink-google", response_model=UserResponse)
def unlink_google(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.password_hash:
        raise HTTPException(status_code=400, detail="비밀번호를 먼저 설정한 뒤 Google 연동을 해제할 수 있습니다.")

    current_user.google_id = None
    current_user.avatar_url = None
    _record_audit(
        db,
        request,
        action="google_unlink",
        user_id=current_user.id,
        target_type="user",
        target_id=current_user.id,
    )
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/api/auth/change-password")
def change_password(
    data: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다.")

    error = validate_password(data.new_password)
    if error:
        raise HTTPException(status_code=400, detail=error)

    current_user.password_hash = hash_password(data.new_password)
    current_user.password_changed_at = datetime.utcnow()
    _record_audit(
        db,
        request,
        action="password_change",
        user_id=current_user.id,
        target_type="user",
        target_id=current_user.id,
    )
    db.commit()
    return {"ok": True}


@router.post("/api/auth/logout-all", response_model=dict[str, bool])
def logout_all(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.token_invalidated_at = datetime.utcnow()
    _record_audit(
        db,
        request,
        action="logout_all",
        user_id=current_user.id,
        target_type="user",
        target_id=current_user.id,
    )
    db.commit()
    return {"ok": True}


@router.post("/api/auth/refresh", response_model=LoginResponse)
def refresh(data: RefreshTokenRequest, request: Request, db: Session = Depends(get_db)):
    payload = decode_token(data.refresh_token, expected_type="refresh")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="유효하지 않은 리프레시 토큰입니다.") from exc

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="비활성화되었거나 존재하지 않는 사용자입니다.")
    if _is_token_invalidated(user, payload):
        raise HTTPException(status_code=401, detail="세션이 만료되었습니다. 다시 로그인해 주세요.")

    user.last_login_at = datetime.utcnow()
    _record_audit(
        db,
        request,
        action="login",
        user_id=user.id,
        target_type="user",
        target_id=user.id,
        detail='{"provider":"refresh"}',
    )
    db.commit()
    db.refresh(user)
    return _login_response(user)
