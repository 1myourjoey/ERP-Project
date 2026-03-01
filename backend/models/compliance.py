from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from database import Base


class ComplianceRule(Base):
    """Guideline-backed compliance rule master data."""

    __tablename__ = "compliance_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String, nullable=False)
    subcategory = Column(String, nullable=False)
    rule_code = Column(String, nullable=False, unique=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    trigger_event = Column(String, nullable=True)
    frequency = Column(String, nullable=True)
    deadline_rule = Column(String, nullable=True)
    target_system = Column(String, nullable=True)
    guideline_ref = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    fund_type_filter = Column(String, nullable=True)

    obligations = relationship("ComplianceObligation", back_populates="rule")


class ComplianceObligation(Base):
    """Fund-scoped compliance obligation instances."""

    __tablename__ = "compliance_obligations"
    __table_args__ = (
        UniqueConstraint(
            "rule_id",
            "fund_id",
            "period_type",
            "investment_id",
            name="uq_compliance_obligations_period",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_id = Column(Integer, ForeignKey("compliance_rules.id"), nullable=False, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)

    period_type = Column(String, nullable=True)
    due_date = Column(Date, nullable=False, index=True)

    status = Column(String, nullable=False, default="pending")
    completed_date = Column(Date, nullable=True)
    completed_by = Column(String, nullable=True)
    evidence_note = Column(Text, nullable=True)

    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    rule = relationship("ComplianceRule", back_populates="obligations")


class InvestmentLimitCheck(Base):
    """Investment pre-check log for regulatory limits."""

    __tablename__ = "investment_limit_checks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True, index=True)
    check_date = Column(DateTime, nullable=False, default=datetime.utcnow)

    rule_code = Column(String, nullable=False)
    check_result = Column(String, nullable=False)
    current_value = Column(Float, nullable=True)
    limit_value = Column(Float, nullable=True)
    detail = Column(Text, nullable=True)


class ComplianceDocument(Base):
    """Compliance source document metadata (law/guideline/agreement/internal)."""

    __tablename__ = "compliance_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    document_type = Column(String, nullable=False)
    version = Column(String, nullable=True)
    effective_date = Column(DateTime, nullable=True)
    content_summary = Column(Text, nullable=True)
    file_path = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    rules = relationship("FundComplianceRule", back_populates="document")


class FundComplianceRule(Base):
    """Fund-scoped compliance rule definition (L1~L5)."""

    __tablename__ = "fund_compliance_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="CASCADE"), nullable=True, index=True)
    document_id = Column(Integer, ForeignKey("compliance_documents.id"), nullable=True, index=True)

    rule_code = Column(String, nullable=False, unique=True, index=True)
    rule_name = Column(String, nullable=False)
    level = Column(String, nullable=False)  # L1, L2, L3, L4, L5
    category = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    condition = Column(JSON, nullable=False)

    severity = Column(String, nullable=False, default="warning")  # info, warning, error, critical
    auto_task = Column(Boolean, nullable=False, default=False)

    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    document = relationship("ComplianceDocument", back_populates="rules")
    checks = relationship("ComplianceCheck", back_populates="rule")


class ComplianceCheck(Base):
    """Compliance rule evaluation audit log."""

    __tablename__ = "compliance_checks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_id = Column(Integer, ForeignKey("fund_compliance_rules.id"), nullable=False, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)

    checked_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    result = Column(String, nullable=False)  # pass, warning, fail, error
    actual_value = Column(String, nullable=True)
    threshold_value = Column(String, nullable=True)
    detail = Column(Text, nullable=True)

    trigger_type = Column(String, nullable=True)  # manual, event, scheduled
    trigger_source = Column(String, nullable=True)  # investment_create, fund_update, ...
    trigger_source_id = Column(Integer, nullable=True)

    remediation_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)
    resolved_at = Column(DateTime, nullable=True)

    rule = relationship("FundComplianceRule", back_populates="checks")
