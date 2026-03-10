from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from database import Base


class ErpSubject(Base):
    __tablename__ = "erp_subjects"
    __table_args__ = (
        UniqueConstraint("subject_type", "native_id", name="uq_erp_subject_type_native"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    subject_type = Column(String(64), nullable=False, index=True)
    native_id = Column(Integer, nullable=False, index=True)
    display_name = Column(String(255), nullable=True)
    state_code = Column(String(64), nullable=True, index=True)
    lifecycle_stage = Column(String(32), nullable=False, default="active", index=True)

    fund_id = Column(Integer, nullable=True, index=True)
    gp_entity_id = Column(Integer, nullable=True, index=True)
    company_id = Column(Integer, nullable=True, index=True)
    investment_id = Column(Integer, nullable=True, index=True)
    lp_id = Column(Integer, nullable=True, index=True)
    task_id = Column(Integer, nullable=True, index=True)
    workflow_instance_id = Column(Integer, nullable=True, index=True)
    obligation_id = Column(Integer, nullable=True, index=True)

    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ErpRelation(Base):
    __tablename__ = "erp_relations"
    __table_args__ = (
        UniqueConstraint("parent_subject_id", "child_subject_id", "relation_type", name="uq_erp_relation_edge"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    parent_subject_id = Column(Integer, ForeignKey("erp_subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    child_subject_id = Column(Integer, ForeignKey("erp_subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    relation_type = Column(String(80), nullable=False, index=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ErpEvent(Base):
    __tablename__ = "erp_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    subject_id = Column(Integer, ForeignKey("erp_subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(80), nullable=False, index=True)
    actor_user_id = Column(Integer, nullable=True, index=True)
    correlation_key = Column(String(120), nullable=True, index=True)
    origin_model = Column(String(80), nullable=True, index=True)
    origin_id = Column(Integer, nullable=True, index=True)
    fund_id = Column(Integer, nullable=True, index=True)
    investment_id = Column(Integer, nullable=True, index=True)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    before_json = Column(Text, nullable=True)
    after_json = Column(Text, nullable=True)
    payload_json = Column(Text, nullable=True)


class ErpDocumentRecord(Base):
    __tablename__ = "erp_document_records"
    __table_args__ = (
        UniqueConstraint("origin_model", "origin_id", "origin_key", name="uq_erp_document_origin"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_role = Column(String(32), nullable=False, default="artifact", index=True)
    origin_model = Column(String(80), nullable=False, index=True)
    origin_id = Column(Integer, nullable=False, index=True)
    origin_key = Column(String(80), nullable=False, default="", index=True)

    title = Column(String(255), nullable=False)
    document_type = Column(String(80), nullable=True)
    status_code = Column(String(40), nullable=False, default="pending", index=True)
    lifecycle_stage = Column(String(32), nullable=False, default="open", index=True)

    template_id = Column(Integer, nullable=True, index=True)
    attachment_id = Column(Integer, nullable=True, index=True)
    due_date = Column(Date, nullable=True, index=True)
    requested_at = Column(DateTime, nullable=True)
    received_at = Column(DateTime, nullable=True)
    verified_at = Column(DateTime, nullable=True)

    note = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ErpDocumentLink(Base):
    __tablename__ = "erp_document_links"
    __table_args__ = (
        UniqueConstraint("document_record_id", "subject_id", "link_type", name="uq_erp_document_link"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_record_id = Column(Integer, ForeignKey("erp_document_records.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("erp_subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    link_type = Column(String(40), nullable=False, default="related", index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class ErpAutomationOutbox(Base):
    __tablename__ = "erp_automation_outbox"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("erp_events.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("erp_subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = Column(String(40), nullable=False, default="internal_rpa", index=True)
    status = Column(String(32), nullable=False, default="pending", index=True)
    available_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    payload_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
