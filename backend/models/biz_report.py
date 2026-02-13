from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text

from database import Base


class BizReport(Base):
    __tablename__ = "biz_reports"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=False)
    report_type = Column(String, nullable=False, default="분기보고")
    period = Column(String, nullable=False, default="")
    status = Column(String, nullable=False, default="요청전")
    requested_date = Column(Date, nullable=True)
    received_date = Column(Date, nullable=True)
    reviewed_date = Column(Date, nullable=True)
    analyst_comment = Column(Text, nullable=True)

    revenue = Column(Numeric, nullable=True)
    operating_income = Column(Numeric, nullable=True)
    net_income = Column(Numeric, nullable=True)
    total_assets = Column(Numeric, nullable=True)
    total_liabilities = Column(Numeric, nullable=True)
    employees = Column(Integer, nullable=True)

    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
