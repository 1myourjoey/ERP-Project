"""Audit trail middleware for successful mutating API requests."""

from __future__ import annotations

import json
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from database import SessionLocal
from dependencies.auth import decode_token
from models.audit_log import AuditLog


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Automatically writes audit log rows for successful CRUD requests."""

    _MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
    _ACTION_MAP = {
        "POST": "create",
        "PUT": "update",
        "PATCH": "update",
        "DELETE": "delete",
    }

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        request_body = await self._read_body(request)
        response = await call_next(request)

        if request.method in self._MUTATING_METHODS and 200 <= response.status_code < 300:
            await self._log_action(request, response, request_body)

        return response

    async def _read_body(self, request: Request) -> str | None:
        try:
            body = await request.body()
            if not body:
                return None
            text = body.decode("utf-8", errors="ignore").strip()
            if not text:
                return None
            if len(text) > 500:
                text = text[:500]
            return text
        except Exception:
            return None

    async def _log_action(self, request: Request, response: Response, body_text: str | None) -> None:
        if not request.url.path.startswith("/api"):
            return

        user_id = self._extract_user_id(request)
        target_type, target_id = self._extract_target(request.url.path)
        detail = self._build_detail(body_text, response.status_code)

        db = SessionLocal()
        try:
            db.add(
                AuditLog(
                    user_id=user_id,
                    action=self._ACTION_MAP.get(request.method, request.method.lower()),
                    target_type=target_type,
                    target_id=target_id,
                    detail=detail,
                    ip_address=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent"),
                )
            )
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

    def _extract_user_id(self, request: Request) -> int | None:
        auth_header = request.headers.get("authorization") or ""
        if not auth_header.lower().startswith("bearer "):
            return None
        token = auth_header.split(" ", 1)[1].strip()
        if not token:
            return None

        try:
            payload = decode_token(token, expected_type="access")
            value = payload.get("sub")
            return int(value) if value is not None else None
        except Exception:
            return None

    def _extract_target(self, path: str) -> tuple[str | None, int | None]:
        parts = [part for part in path.split("/") if part]
        if len(parts) < 2:
            return None, None

        resource = parts[1]
        target_type = resource[:-1] if resource.endswith("s") and len(resource) > 1 else resource

        target_id = None
        if parts and parts[-1].isdigit():
            target_id = int(parts[-1])

        return target_type, target_id

    def _build_detail(self, body_text: str | None, status_code: int) -> str | None:
        payload: dict[str, Any] = {"status_code": status_code}
        if body_text:
            try:
                parsed = json.loads(body_text)
                payload["request"] = parsed
            except json.JSONDecodeError:
                payload["request"] = body_text
        return json.dumps(payload, ensure_ascii=False)[:500]
