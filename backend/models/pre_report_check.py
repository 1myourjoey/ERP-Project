from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import relationship

from database import Base


class PreReportCheck(Base):
    """Pre-submission validation result for regular reports."""

    __tablename__ = "pre_report_checks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    report_id = Column(Integer, ForeignKey("regular_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)

    checked_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    overall_status = Column(String, nullable=False, index=True)  # pass, warning, error

    legal_check = Column(JSON, nullable=True)
    cross_check = Column(JSON, nullable=True)
    guideline_check = Column(JSON, nullable=True)
    contract_check = Column(JSON, nullable=True)

    total_errors = Column(Integer, nullable=False, default=0)
    total_warnings = Column(Integer, nullable=False, default=0)
    total_info = Column(Integer, nullable=False, default=0)
    tasks_created = Column(Integer, nullable=False, default=0)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    report = relationship("RegularReport", back_populates="pre_checks")
