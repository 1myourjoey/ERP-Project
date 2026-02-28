from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from database import Base


class VicsMonthlyReport(Base):
    """Monthly VICS report snapshot."""

    __tablename__ = "vics_monthly_reports"
    __table_args__ = (
        UniqueConstraint("fund_id", "year", "month", "report_code", name="uq_vics_report_period_code"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    report_code = Column(String, nullable=False, index=True)

    data_json = Column(Text, nullable=True)

    status = Column(String, nullable=False, default="draft")
    confirmed_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    discrepancy_notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
