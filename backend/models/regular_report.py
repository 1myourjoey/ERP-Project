from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text

from database import Base


class RegularReport(Base):
    __tablename__ = "regular_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_target = Column(String, nullable=False, default="농금원")
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)
    period = Column(String, nullable=False, default="")
    due_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="예정")
    submitted_date = Column(Date, nullable=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
