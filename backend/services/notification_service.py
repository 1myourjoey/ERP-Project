from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from models.notification import Notification
from models.user import User


def _utcnow_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _normalize_severity(value: str | None) -> str:
    normalized = (value or "info").strip().lower()
    if normalized not in {"info", "warning", "urgent"}:
        return "info"
    return normalized


def _normalize_category(value: str | None) -> str:
    normalized = (value or "system").strip().lower()
    if not normalized:
        return "system"
    return normalized


async def create_notification(
    db: Session,
    user_id: int,
    category: str,
    severity: str,
    title: str,
    message: str | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    action_type: str = "navigate",
    action_url: str | None = None,
    action_payload: dict[str, Any] | None = None,
) -> Notification:
    """Create a notification with 24-hour duplicate guard."""
    cutoff = _utcnow_naive() - timedelta(hours=24)
    existing = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.category == _normalize_category(category),
            Notification.target_type == target_type,
            Notification.target_id == target_id,
            Notification.title == title,
            Notification.created_at >= cutoff,
        )
        .order_by(Notification.id.desc())
        .first()
    )
    if existing:
        return existing

    row = Notification(
        user_id=user_id,
        category=_normalize_category(category),
        severity=_normalize_severity(severity),
        title=(title or "").strip()[:200] or "알림",
        message=(message or "").strip() or None,
        target_type=(target_type or "").strip() or None,
        target_id=target_id,
        action_type=(action_type or "navigate").strip() or "navigate",
        action_url=(action_url or "").strip() or None,
        action_payload=action_payload,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


async def create_notifications_for_active_users(
    db: Session,
    *,
    category: str,
    severity: str,
    title: str,
    message: str | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    action_type: str = "navigate",
    action_url: str | None = None,
    action_payload: dict[str, Any] | None = None,
) -> int:
    normalized_category = _normalize_category(category)
    normalized_severity = _normalize_severity(severity)
    normalized_title = (title or "").strip()[:200] or "알림"
    normalized_message = (message or "").strip() or None
    normalized_target_type = (target_type or "").strip() or None
    normalized_action_type = (action_type or "navigate").strip() or "navigate"
    normalized_action_url = (action_url or "").strip() or None
    cutoff = _utcnow_naive() - timedelta(hours=24)

    user_ids = [int(row.id) for row in db.query(User.id).filter(User.is_active == True).all()]
    if not user_ids:
        return 0

    existing_user_ids = {
        int(row.user_id)
        for row in db.query(Notification.user_id)
        .filter(
            Notification.user_id.in_(user_ids),
            Notification.title == normalized_title,
            Notification.category == normalized_category,
            Notification.target_type == normalized_target_type,
            Notification.target_id == target_id,
            Notification.created_at >= cutoff,
        )
        .all()
    }

    pending_rows = [
        Notification(
            user_id=user_id,
            category=normalized_category,
            severity=normalized_severity,
            title=normalized_title,
            message=normalized_message,
            target_type=normalized_target_type,
            target_id=target_id,
            action_type=normalized_action_type,
            action_url=normalized_action_url,
            action_payload=action_payload,
        )
        for user_id in user_ids
        if user_id not in existing_user_ids
    ]
    if not pending_rows:
        return 0

    db.add_all(pending_rows)
    db.commit()
    return len(pending_rows)


async def get_unread_count(db: Session, user_id: int) -> int:
    return int(
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == user_id, Notification.is_read == False)
        .scalar()
        or 0
    )


async def get_notifications(
    db: Session,
    user_id: int,
    category: str | None = None,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[Notification]:
    query = db.query(Notification).filter(Notification.user_id == user_id)
    if category:
        query = query.filter(Notification.category == _normalize_category(category))
    if unread_only:
        query = query.filter(Notification.is_read == False)

    safe_limit = max(1, min(int(limit or 50), 200))
    safe_offset = max(0, int(offset or 0))
    return (
        query.order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(safe_offset)
        .limit(safe_limit)
        .all()
    )


async def mark_as_read(db: Session, notification_id: int, user_id: int) -> bool:
    row = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if not row:
        return False
    if row.is_read:
        return True
    row.is_read = True
    row.read_at = datetime.utcnow()
    db.commit()
    return True


async def mark_all_as_read(db: Session, user_id: int) -> int:
    target_rows = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)
        .all()
    )
    if not target_rows:
        return 0

    now = datetime.utcnow()
    for row in target_rows:
        row.is_read = True
        row.read_at = now
    db.commit()
    return len(target_rows)


async def cleanup_old_notifications(db: Session, days: int = 90) -> int:
    cutoff = datetime.utcnow() - timedelta(days=max(1, int(days or 90)))
    rows = (
        db.query(Notification)
        .filter(
            Notification.is_read == True,
            Notification.created_at < cutoff,
        )
        .all()
    )
    for row in rows:
        db.delete(row)
    if rows:
        db.commit()
    return len(rows)
