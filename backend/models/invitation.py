import json
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from database import Base


class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, nullable=True, index=True)
    name = Column(String, nullable=True)
    role = Column(String, nullable=False, default="viewer")
    department = Column(String, nullable=True)
    allowed_routes_raw = Column("allowed_routes", Text, nullable=True, default=None)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    used_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)
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
