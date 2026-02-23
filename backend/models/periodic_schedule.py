from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class PeriodicSchedule(Base):
    __tablename__ = "periodic_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    recurrence = Column(String, nullable=False)
    base_month = Column(Integer, nullable=False)
    base_day = Column(Integer, nullable=False)
    workflow_template_id = Column(Integer, ForeignKey("workflows.id"), nullable=True)
    fund_type_filter = Column(String, nullable=True)
    reminder_offsets = Column(String, nullable=False, default="[]")
    is_active = Column(Boolean, nullable=False, default=True)
    steps_json = Column(Text, nullable=True, default="[]")
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    workflow_template = relationship("Workflow", lazy="joined")
