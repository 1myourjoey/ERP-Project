from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String, nullable=False)
    target_type = Column(String, nullable=True)
    target_id = Column(Integer, nullable=True)
    detail = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
