from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text

from database import Base


class BizReport(Base):
    __tablename__ = "biz_reports"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    report_year = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="작성중")
    submission_date = Column(Date, nullable=True)

    total_commitment = Column(Numeric, nullable=True)
    total_paid_in = Column(Numeric, nullable=True)
    total_invested = Column(Numeric, nullable=True)
    total_distributed = Column(Numeric, nullable=True)
    fund_nav = Column(Numeric, nullable=True)
    irr = Column(Numeric, nullable=True)
    tvpi = Column(Numeric, nullable=True)
    dpi = Column(Numeric, nullable=True)

    market_overview = Column(Text, nullable=True)
    portfolio_summary = Column(Text, nullable=True)
    investment_activity = Column(Text, nullable=True)
    key_issues = Column(Text, nullable=True)
    outlook = Column(Text, nullable=True)
    memo = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
