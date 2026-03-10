import base64
import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import or_
from sqlalchemy.orm import Session

try:
    from passlib.context import CryptContext  # type: ignore
except Exception:  # pragma: no cover - optional dependency fallback
    CryptContext = None  # type: ignore

from database import get_db
from models.user import User

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("VON_ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get("VON_REFRESH_TOKEN_EXPIRE_DAYS", "7"))
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = int(
    os.environ.get("VON_PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "30")
)
MAX_LOGIN_FAILURES = int(os.environ.get("VON_MAX_LOGIN_FAILURES", "5"))
LOCK_DURATION_MINUTES = int(os.environ.get("VON_LOCK_DURATION_MINUTES", "30"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto") if CryptContext is not None else None
security = HTTPBearer(auto_error=False)

_PASSWORD_ALPHA = re.compile(r"[A-Za-z]")
_PASSWORD_DIGIT = re.compile(r"\d")


def _env_flag(name: str, default: str = "false") -> bool:
    return os.environ.get(name, default).strip().lower() in {"1", "true", "yes", "y", "on"}


def _auth_disabled() -> bool:
    return _env_flag("VON_AUTH_DISABLED", "true") or _env_flag("AUTH_DISABLED", "true")


def _secret_key() -> str:
    return os.environ.get("VON_SECRET_KEY", "dev-secret-change-in-production")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + pad).encode("ascii"))


def _jwt_encode(payload: dict) -> str:
    header = {"alg": ALGORITHM, "typ": "JWT"}
    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}"
    signature = hmac.new(
        _secret_key().encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def _jwt_decode(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("invalid token")
    header_b64, payload_b64, signature_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}"
    expected_signature = hmac.new(
        _secret_key().encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    provided_signature = _b64url_decode(signature_b64)
    if not hmac.compare_digest(expected_signature, provided_signature):
        raise ValueError("invalid signature")
    payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("invalid payload")
    return payload


def verify_password(plain: str, hashed: str | None) -> bool:
    if not plain or not hashed:
        return False
    # Fallback for local/dev environments where passlib may be unavailable.
    if hashed.startswith("plain$"):
        return secrets.compare_digest(hashed[len("plain$") :], plain)
    if pwd_context is None:
        return False
    try:
        return bool(pwd_context.verify(plain, hashed))
    except Exception:
        return False


def hash_password(password: str) -> str:
    if pwd_context is None:
        return f"plain${password}"
    return str(pwd_context.hash(password))


def validate_password(password: str) -> str | None:
    if len(password) < 8:
        return "비밀번호는 최소 8자 이상이어야 합니다."
    if _PASSWORD_ALPHA.search(password) is None:
        return "비밀번호에는 영문자가 포함되어야 합니다."
    if _PASSWORD_DIGIT.search(password) is None:
        return "비밀번호에는 숫자가 포함되어야 합니다."
    return None


def _create_typed_token(user_id: int, token_type: str, expires_at: datetime) -> str:
    issued_at = _utc_now()
    payload = {
        "sub": str(user_id),
        "exp": int(_as_utc(expires_at).timestamp()),
        "iat": issued_at.timestamp(),
        "type": token_type,
    }
    return _jwt_encode(payload)


def create_access_token(user_id: int) -> str:
    expire = _utc_now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return _create_typed_token(user_id, "access", expire)


def create_refresh_token(user_id: int) -> str:
    expire = _utc_now() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return _create_typed_token(user_id, "refresh", expire)


def create_password_reset_token(
    user_id: int, expires_in_minutes: int = PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
) -> str:
    expire = _utc_now() + timedelta(minutes=expires_in_minutes)
    return _create_typed_token(user_id, "password_reset", expire)


def decode_token(token: str, expected_type: str) -> dict:
    try:
        payload = _jwt_decode(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="유효하지 않은 인증 토큰입니다.") from exc

    try:
        exp = int(payload.get("exp"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="유효하지 않은 인증 토큰입니다.") from exc
    if _utc_now().timestamp() >= exp:
        raise HTTPException(status_code=401, detail="유효하지 않은 인증 토큰입니다.")

    token_type = payload.get("type")
    if token_type != expected_type:
        raise HTTPException(status_code=401, detail="유효하지 않은 인증 토큰입니다.")
    return payload


def normalize_login_id(value: str) -> str:
    return (value or "").strip().lower()


def find_user_by_login_id(db: Session, login_id: str) -> User | None:
    normalized = normalize_login_id(login_id)
    if not normalized:
        return None
    return (
        db.query(User)
        .filter(
            or_(
                User.username == normalized,
                User.email == normalized,
            )
        )
        .first()
    )


def is_user_locked(user: User, now: datetime | None = None) -> bool:
    if user.locked_until is None:
        return False
    current = now or datetime.utcnow()
    return user.locked_until > current


def register_login_failure(user: User) -> None:
    now = datetime.utcnow()
    fails = int(user.login_fail_count or 0) + 1
    user.login_fail_count = fails
    if fails >= MAX_LOGIN_FAILURES:
        user.locked_until = now + timedelta(minutes=LOCK_DURATION_MINUTES)
        user.login_fail_count = 0


def clear_login_failures(user: User) -> None:
    user.login_fail_count = 0
    user.locked_until = None


def get_user_from_access_token(token: str, db: Session) -> User:
    payload = decode_token(token, expected_type="access")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="유효하지 않은 인증 토큰입니다.") from exc

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="비활성화되었거나 존재하지 않는 사용자입니다.")

    if user.token_invalidated_at is not None:
        token_iat_raw = payload.get("iat")
        if token_iat_raw is None:
            raise HTTPException(status_code=401, detail="세션이 만료되었습니다. 다시 로그인해 주세요.")
        try:
            token_iat = datetime.fromtimestamp(float(token_iat_raw), tz=timezone.utc)
        except (TypeError, ValueError):
            raise HTTPException(status_code=401, detail="유효하지 않은 인증 토큰입니다.")
        if token_iat < _as_utc(user.token_invalidated_at):
            raise HTTPException(status_code=401, detail="세션이 만료되었습니다. 다시 로그인해 주세요.")

    return user


def _ensure_dev_auth_user(db: Session) -> User:
    user = db.query(User).filter(User.is_active == 1).order_by(User.id.asc()).first()
    if user:
        return user

    row = User(
        username="dev",
        email="dev@local.invalid",
        name="Dev User",
        password_hash="plain$dev",
        role="master",
        department="DEV",
        is_active=True,
    )
    row.allowed_routes = None
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if _auth_disabled():
        return _ensure_dev_auth_user(db)
    if not credentials:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    return get_user_from_access_token(credentials.credentials, db)


def require_master(user: User = Depends(get_current_user)) -> User:
    if _auth_disabled():
        return user
    if user.role != "master":
        raise HTTPException(status_code=403, detail="마스터 관리자만 접근할 수 있습니다.")
    return user
