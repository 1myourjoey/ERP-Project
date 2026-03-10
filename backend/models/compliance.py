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
    template_id = Column(Integer, ForeignKey("document_templates.id"), nullable=True, index=True)

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
    source_tier = Column(String, nullable=False, default="law")
    scope = Column(String, nullable=False, default="global")
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=True)
    attachment_id = Column(Integer, ForeignKey("attachments.id"), nullable=True)
    document_role = Column(String, nullable=True)
    fund_type_filter = Column(String, nullable=True)
    version = Column(String, nullable=True)
    effective_date = Column(DateTime, nullable=True)
    effective_from = Column(DateTime, nullable=True)
    effective_to = Column(DateTime, nullable=True)
    supersedes_document_id = Column(Integer, ForeignKey("compliance_documents.id"), nullable=True)
    content_summary = Column(Text, nullable=True)
    file_path = Column(String, nullable=True)
    ingest_status = Column(String, nullable=False, default="pending")
    ocr_status = Column(String, nullable=False, default="not_needed")
    index_status = Column(String, nullable=False, default="pending")
    extraction_quality = Column(Float, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    fund = relationship("Fund", backref="compliance_documents", foreign_keys=[fund_id])
    rules = relationship("FundComplianceRule", back_populates="document")
    chunks = relationship("ComplianceDocumentChunk", back_populates="document", cascade="all, delete-orphan")
    supersedes_document = relationship("ComplianceDocument", remote_side=[id], foreign_keys=[supersedes_document_id])


class ComplianceDocumentChunk(Base):
    """Persisted legal chunks for evidence audit and re-index bookkeeping."""

    __tablename__ = "compliance_document_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("compliance_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_key = Column(String, nullable=False, unique=True, index=True)
    page_no = Column(Integer, nullable=True)
    section_ref = Column(String, nullable=True)
    clause_type = Column(String, nullable=True)
    chunk_index = Column(Integer, nullable=False, default=0)
    token_count = Column(Integer, nullable=True)
    text = Column(Text, nullable=False)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    document = relationship("ComplianceDocument", back_populates="chunks")


class ComplianceReviewRun(Base):
    """Document-grounded compliance review execution record."""

    __tablename__ = "compliance_review_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True, index=True)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=True, index=True)
    target_type = Column(String, nullable=False, default="fund")
    scenario = Column(String, nullable=False)
    query = Column(Text, nullable=False)
    trigger_type = Column(String, nullable=False, default="manual")
    result = Column(String, nullable=False, default="needs_review")
    prevailing_tier = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    review_status = Column(String, nullable=False, default="pending")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)

    evidence_rows = relationship("ComplianceReviewEvidence", back_populates="review_run", cascade="all, delete-orphan")


class ComplianceReviewEvidence(Base):
    """Evidence rows attached to a document-grounded compliance review."""

    __tablename__ = "compliance_review_evidence"

    id = Column(Integer, primary_key=True, autoincrement=True)
    review_run_id = Column(Integer, ForeignKey("compliance_review_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("compliance_documents.id"), nullable=False, index=True)
    chunk_id = Column(Integer, ForeignKey("compliance_document_chunks.id"), nullable=True, index=True)
    source_tier = Column(String, nullable=False)
    role = Column(String, nullable=False, default="supporting")
    page_no = Column(Integer, nullable=True)
    section_ref = Column(String, nullable=True)
    snippet = Column(Text, nullable=False)
    relevance_score = Column(Float, nullable=True)
    metadata_json = Column(JSON, nullable=True)

    review_run = relationship("ComplianceReviewRun", back_populates="evidence_rows")


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
