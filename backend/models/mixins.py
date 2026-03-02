"""Shared SQLAlchemy model mixins."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime


class SoftDeleteMixin:
    """Soft-delete behavior that can be mixed into models incrementally."""

    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.deleted_at = datetime.utcnow()

    def restore(self) -> None:
        self.is_deleted = False
        self.deleted_at = None
