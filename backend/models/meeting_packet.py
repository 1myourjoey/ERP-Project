from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


class AssemblyAgendaItem(Base):
    __tablename__ = "assembly_agenda_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    assembly_id = Column(Integer, ForeignKey("assemblies.id", ondelete="CASCADE"), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    kind = Column(String, nullable=False, default="custom")
    title = Column(String, nullable=False)
    short_title = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    requires_vote = Column(Boolean, nullable=False, default=True)
    source_type = Column(String, nullable=True)
    source_ref = Column(String, nullable=True)
    draft_basis_json = Column(Text, nullable=True)
    resolution_text = Column(Text, nullable=True)
    vote_result = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    assembly = relationship("Assembly", back_populates="agenda_items")


class MeetingPacketRun(Base):
    __tablename__ = "meeting_packet_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    assembly_id = Column(Integer, ForeignKey("assemblies.id", ondelete="CASCADE"), nullable=False, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="CASCADE"), nullable=False, index=True)
    packet_type = Column(String, nullable=False)
    report_year = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="draft")
    include_bylaw_amendment = Column(Boolean, nullable=False, default=False)
    zip_attachment_id = Column(Integer, ForeignKey("attachments.id", ondelete="SET NULL"), nullable=True)
    warnings_json = Column(Text, nullable=True)
    missing_slots_json = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    assembly = relationship("Assembly", back_populates="meeting_packet_runs")
    zip_attachment = relationship("Attachment", foreign_keys=[zip_attachment_id])
    documents = relationship("MeetingPacketDocument", back_populates="run", cascade="all, delete-orphan", order_by="MeetingPacketDocument.id.asc()")


class MeetingPacketDocument(Base):
    __tablename__ = "meeting_packet_documents"
    __table_args__ = (UniqueConstraint("run_id", "slot", name="uq_meeting_packet_documents_run_slot"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("meeting_packet_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    slot = Column(String, nullable=False)
    attachment_id = Column(Integer, ForeignKey("attachments.id", ondelete="SET NULL"), nullable=True)
    external_document_id = Column(Integer, ForeignKey("compliance_documents.id", ondelete="SET NULL"), nullable=True)
    source_mode = Column(String, nullable=False, default="generated")
    status = Column(String, nullable=False, default="draft")
    layout_mode = Column(String, nullable=True)
    generation_payload_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    run = relationship("MeetingPacketRun", back_populates="documents")
    attachment = relationship("Attachment", foreign_keys=[attachment_id])
    external_document = relationship("ComplianceDocument", foreign_keys=[external_document_id])
