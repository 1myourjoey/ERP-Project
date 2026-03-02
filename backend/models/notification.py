from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    category = Column(String(30), nullable=False)
    severity = Column(String(10), nullable=False, default="info")
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=True)

    target_type = Column(String(30), nullable=True)
    target_id = Column(Integer, nullable=True)

    action_type = Column(String(30), nullable=True, default="navigate")
    action_url = Column(String(500), nullable=True)
    action_payload = Column(JSON, nullable=True)

    is_read = Column(Boolean, nullable=False, default=False, index=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now(), default=datetime.utcnow, index=True)

    user = relationship("User", backref="notifications")
