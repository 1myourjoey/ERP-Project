from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from database import Base


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class ProposalTemplate(Base):
    __tablename__ = "proposal_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(60), nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=False)
    institution_type = Column(String(30), nullable=True, index=True)
    legacy_template_type = Column(String(30), nullable=True, index=True)
    description = Column(Text, nullable=True)
    output_format = Column(String(20), nullable=False, default="xlsx")
    source_family = Column(String(30), nullable=False, default="excel")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)


class ProposalTemplateVersion(Base):
    __tablename__ = "proposal_template_versions"
    __table_args__ = (
        UniqueConstraint("template_id", "version_label", name="uq_proposal_template_versions_label"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    template_id = Column(Integer, ForeignKey("proposal_templates.id"), nullable=False, index=True)
    version_label = Column(String(60), nullable=False)
    status = Column(String(20), nullable=False, default="draft", index=True)
    source_path = Column(String(500), nullable=True)
    source_filename = Column(String(255), nullable=True)
    effective_from = Column(Date, nullable=True)
    effective_to = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)


class ProposalTemplateSheet(Base):
    __tablename__ = "proposal_template_sheets"
    __table_args__ = (
        UniqueConstraint("template_version_id", "sheet_code", name="uq_proposal_template_sheet_code"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    template_version_id = Column(Integer, ForeignKey("proposal_template_versions.id"), nullable=False, index=True)
    sheet_code = Column(String(80), nullable=False)
    sheet_name = Column(String(120), nullable=False)
    sheet_kind = Column(String(20), nullable=False, default="table")
    display_order = Column(Integer, nullable=False, default=0)
    is_required = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)


class ProposalTemplateFieldMapping(Base):
    __tablename__ = "proposal_template_field_mappings"
    __table_args__ = (
        UniqueConstraint(
            "template_version_id",
            "sheet_id",
            "field_key",
            name="uq_proposal_template_field_mapping",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    template_version_id = Column(Integer, ForeignKey("proposal_template_versions.id"), nullable=False, index=True)
    sheet_id = Column(Integer, ForeignKey("proposal_template_sheets.id"), nullable=False, index=True)
    field_key = Column(String(120), nullable=False)
    target_cell = Column(String(40), nullable=False)
    value_source = Column(String(255), nullable=True)
    transform_rule = Column(String(255), nullable=True)
    default_value_json = Column(Text, nullable=True)
    source_note_hint = Column(String(255), nullable=True)
    is_required = Column(Boolean, nullable=False, default=False)
    display_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)


class ProposalTemplateTableMapping(Base):
    __tablename__ = "proposal_template_table_mappings"
    __table_args__ = (
        UniqueConstraint(
            "template_version_id",
            "sheet_id",
            "table_key",
            name="uq_proposal_template_table_mapping",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    template_version_id = Column(Integer, ForeignKey("proposal_template_versions.id"), nullable=False, index=True)
    sheet_id = Column(Integer, ForeignKey("proposal_template_sheets.id"), nullable=False, index=True)
    table_key = Column(String(120), nullable=False)
    start_cell = Column(String(40), nullable=False)
    row_source = Column(String(255), nullable=False)
    columns_json = Column(Text, nullable=False, default="[]")
    row_key_field = Column(String(120), nullable=True)
    append_mode = Column(String(20), nullable=False, default="insert")
    max_rows = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)


class ProposalTemplateValidationRule(Base):
    __tablename__ = "proposal_template_validation_rules"
    __table_args__ = (
        UniqueConstraint("template_version_id", "rule_code", name="uq_proposal_template_validation_rule"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    template_version_id = Column(Integer, ForeignKey("proposal_template_versions.id"), nullable=False, index=True)
    sheet_id = Column(Integer, ForeignKey("proposal_template_sheets.id"), nullable=True, index=True)
    rule_code = Column(String(120), nullable=False)
    rule_type = Column(String(40), nullable=False)
    severity = Column(String(20), nullable=False, default="error")
    target_ref = Column(String(120), nullable=True)
    rule_payload_json = Column(Text, nullable=False, default="{}")
    message = Column(String(255), nullable=False)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)
