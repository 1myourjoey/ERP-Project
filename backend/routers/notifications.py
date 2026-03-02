from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import get_current_user
from models.notification import Notification
from models.user import User
from services.notification_service import (
    create_notification,
    get_notifications,
    get_unread_count,
    mark_all_as_read,
    mark_as_read,
)

router = APIRouter(tags=["notifications"])


class NotificationCreateBody(BaseModel):
    user_id: int | None = Field(default=None, ge=1)
    category: str
    severity: str = "info"
    title: str
    message: str | None = None
    target_type: str | None = None
    target_id: int | None = None
    action_type: str = "navigate"
    action_url: str | None = None
    action_payload: dict | None = None


def _serialize(row: Notification) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "category": row.category,
        "severity": row.severity,
        "title": row.title,
        "message": row.message,
        "target_type": row.target_type,
        "target_id": row.target_id,
        "action_type": row.action_type,
        "action_url": row.action_url,
        "action_payload": row.action_payload,
        "is_read": bool(row.is_read),
        "read_at": row.read_at.isoformat() if row.read_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.post("/api/notifications")
async def create_notification_api(
    body: NotificationCreateBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_user_id = body.user_id or current_user.id
    row = await create_notification(
        db,
        user_id=target_user_id,
        category=body.category,
        severity=body.severity,
        title=body.title,
        message=body.message,
        target_type=body.target_type,
        target_id=body.target_id,
        action_type=body.action_type,
        action_url=body.action_url,
        action_payload=body.action_payload,
    )
    return _serialize(row)


@router.get("/api/notifications")
async def list_notifications(
    category: str | None = None,
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = await get_notifications(
        db,
        user_id=current_user.id,
        category=category,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
    )
    unread_count = await get_unread_count(db, current_user.id)
    return {
        "notifications": [_serialize(row) for row in rows],
        "unread_count": unread_count,
    }


@router.get("/api/notifications/unread-count")
async def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"count": await get_unread_count(db, current_user.id)}


@router.patch("/api/notifications/{notification_id}/read")
async def read_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ok = await mark_as_read(db, notification_id, current_user.id)
    return {"success": bool(ok)}


@router.patch("/api/notifications/read-all")
async def read_all_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = await mark_all_as_read(db, current_user.id)
    return {"marked_count": count}
