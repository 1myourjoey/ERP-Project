"""add proposal template registry tables

Revision ID: f83a1b2c3d4e
Revises: f82a1b2c3d4e
Create Date: 2026-03-13 15:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f83a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = "f82a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "proposal_templates"):
        op.create_table(
            "proposal_templates",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("code", sa.String(length=60), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("institution_type", sa.String(length=30), nullable=True),
            sa.Column("legacy_template_type", sa.String(length=30), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("output_format", sa.String(length=20), nullable=False, server_default="xlsx"),
            sa.Column("source_family", sa.String(length=30), nullable=False, server_default="excel"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("code", name="uq_proposal_templates_code"),
        )

    if not _has_table(inspector, "proposal_template_versions"):
        op.create_table(
            "proposal_template_versions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("template_id", sa.Integer(), sa.ForeignKey("proposal_templates.id"), nullable=False),
            sa.Column("version_label", sa.String(length=60), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
            sa.Column("source_path", sa.String(length=500), nullable=True),
            sa.Column("source_filename", sa.String(length=255), nullable=True),
            sa.Column("effective_from", sa.Date(), nullable=True),
            sa.Column("effective_to", sa.Date(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("template_id", "version_label", name="uq_proposal_template_versions_label"),
        )

    if not _has_table(inspector, "proposal_template_sheets"):
        op.create_table(
            "proposal_template_sheets",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("template_version_id", sa.Integer(), sa.ForeignKey("proposal_template_versions.id"), nullable=False),
            sa.Column("sheet_code", sa.String(length=80), nullable=False),
            sa.Column("sheet_name", sa.String(length=120), nullable=False),
            sa.Column("sheet_kind", sa.String(length=20), nullable=False, server_default="table"),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("template_version_id", "sheet_code", name="uq_proposal_template_sheet_code"),
        )

    if not _has_table(inspector, "proposal_template_field_mappings"):
        op.create_table(
            "proposal_template_field_mappings",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("template_version_id", sa.Integer(), sa.ForeignKey("proposal_template_versions.id"), nullable=False),
            sa.Column("sheet_id", sa.Integer(), sa.ForeignKey("proposal_template_sheets.id"), nullable=False),
            sa.Column("field_key", sa.String(length=120), nullable=False),
            sa.Column("target_cell", sa.String(length=40), nullable=False),
            sa.Column("value_source", sa.String(length=255), nullable=True),
            sa.Column("transform_rule", sa.String(length=255), nullable=True),
            sa.Column("default_value_json", sa.Text(), nullable=True),
            sa.Column("source_note_hint", sa.String(length=255), nullable=True),
            sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint(
                "template_version_id",
                "sheet_id",
                "field_key",
                name="uq_proposal_template_field_mapping",
            ),
        )

    if not _has_table(inspector, "proposal_template_table_mappings"):
        op.create_table(
            "proposal_template_table_mappings",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("template_version_id", sa.Integer(), sa.ForeignKey("proposal_template_versions.id"), nullable=False),
            sa.Column("sheet_id", sa.Integer(), sa.ForeignKey("proposal_template_sheets.id"), nullable=False),
            sa.Column("table_key", sa.String(length=120), nullable=False),
            sa.Column("start_cell", sa.String(length=40), nullable=False),
            sa.Column("row_source", sa.String(length=255), nullable=False),
            sa.Column("columns_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("row_key_field", sa.String(length=120), nullable=True),
            sa.Column("append_mode", sa.String(length=20), nullable=False, server_default="insert"),
            sa.Column("max_rows", sa.Integer(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint(
                "template_version_id",
                "sheet_id",
                "table_key",
                name="uq_proposal_template_table_mapping",
            ),
        )

    if not _has_table(inspector, "proposal_template_validation_rules"):
        op.create_table(
            "proposal_template_validation_rules",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("template_version_id", sa.Integer(), sa.ForeignKey("proposal_template_versions.id"), nullable=False),
            sa.Column("sheet_id", sa.Integer(), sa.ForeignKey("proposal_template_sheets.id"), nullable=True),
            sa.Column("rule_code", sa.String(length=120), nullable=False),
            sa.Column("rule_type", sa.String(length=40), nullable=False),
            sa.Column("severity", sa.String(length=20), nullable=False, server_default="error"),
            sa.Column("target_ref", sa.String(length=120), nullable=True),
            sa.Column("rule_payload_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("message", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("template_version_id", "rule_code", name="uq_proposal_template_validation_rule"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table_name in [
        "proposal_template_validation_rules",
        "proposal_template_table_mappings",
        "proposal_template_field_mappings",
        "proposal_template_sheets",
        "proposal_template_versions",
        "proposal_templates",
    ]:
        if _has_table(inspector, table_name):
            op.drop_table(table_name)
            inspector = sa.inspect(bind)
