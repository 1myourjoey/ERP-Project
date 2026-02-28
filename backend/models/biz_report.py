from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text

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


class BizReportTemplate(Base):
    __tablename__ = "biz_report_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    report_type = Column(String, nullable=False)
    required_fields = Column(Text, nullable=True)
    template_file_id = Column(Integer, nullable=True)
    instructions = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class BizReportRequest(Base):
    __tablename__ = "biz_report_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    biz_report_id = Column(Integer, ForeignKey("biz_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=False, index=True)

    request_date = Column(Date, nullable=True)
    deadline = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="미요청")

    revenue = Column(Numeric, nullable=True)
    operating_income = Column(Numeric, nullable=True)
    net_income = Column(Numeric, nullable=True)
    total_assets = Column(Numeric, nullable=True)
    total_equity = Column(Numeric, nullable=True)
    cash = Column(Numeric, nullable=True)
    employees = Column(Integer, nullable=True)

    prev_revenue = Column(Numeric, nullable=True)
    prev_operating_income = Column(Numeric, nullable=True)
    prev_net_income = Column(Numeric, nullable=True)

    doc_financial_statement = Column(String, nullable=False, default="not_requested")
    doc_biz_registration = Column(String, nullable=False, default="not_requested")
    doc_shareholder_list = Column(String, nullable=False, default="not_requested")
    doc_corp_registry = Column(String, nullable=False, default="not_requested")
    doc_insurance_cert = Column(String, nullable=False, default="not_requested")
    doc_credit_report = Column(String, nullable=False, default="not_requested")
    doc_other_changes = Column(String, nullable=False, default="not_requested")

    request_sent_date = Column(Date, nullable=True)
    request_deadline = Column(Date, nullable=True)
    all_docs_received_date = Column(Date, nullable=True)

    comment = Column(Text, nullable=True)
    reviewer_comment = Column(Text, nullable=True)
    risk_flag = Column(String, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class BizReportAnomaly(Base):
    __tablename__ = "biz_report_anomalies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    request_id = Column(Integer, ForeignKey("biz_report_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    anomaly_type = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    detail = Column(Text, nullable=True)
    acknowledged = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
