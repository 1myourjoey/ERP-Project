from datetime import datetime

import json

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=True, index=True)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=True)
    role = Column(String, nullable=False, default="viewer")
    department = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    is_pending_approval = Column(Boolean, nullable=False, default=False)
    last_login_at = Column(DateTime, nullable=True)
    allowed_routes_raw = Column("allowed_routes", Text, nullable=True, default=None)
    google_id = Column(String, unique=True, nullable=True, index=True)
    avatar_url = Column(String, nullable=True)
    login_fail_count = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)
    password_changed_at = Column(DateTime, nullable=True)
    token_invalidated_at = Column(DateTime, nullable=True)
    password_reset_requested_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    @property
    def allowed_routes(self) -> list[str] | None:
        if self.allowed_routes_raw is None:
            return None
        try:
            decoded = json.loads(self.allowed_routes_raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(decoded, list):
            return None
        normalized: list[str] = []
        for item in decoded:
            if not isinstance(item, str):
                continue
            route = item.strip()
            if not route:
                continue
            if route not in normalized:
                normalized.append(route)
        return normalized

    @allowed_routes.setter
    def allowed_routes(self, value: list[str] | None) -> None:
        if value is None:
            self.allowed_routes_raw = None
            return
        normalized: list[str] = []
        for item in value:
            if not isinstance(item, str):
                continue
            route = item.strip()
            if not route:
                continue
            if route not in normalized:
                normalized.append(route)
        self.allowed_routes_raw = json.dumps(normalized, ensure_ascii=False)
