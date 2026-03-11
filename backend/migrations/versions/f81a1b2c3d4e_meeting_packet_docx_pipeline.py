"""meeting packet docx pipeline

Revision ID: f81a1b2c3d4e
Revises: f80a1b2c3d4e
Create Date: 2026-03-11 19:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f81a1b2c3d4e"
down_revision = "f80a1b2c3d4e"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(row["name"] == column_name for row in inspector.get_columns(table_name))


def _has_index(table_name: str, index_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(row["name"] == index_name for row in inspector.get_indexes(table_name))


def upgrade() -> None:
    if not _has_column("assemblies", "meeting_time"):
        op.add_column("assemblies", sa.Column("meeting_time", sa.String(), nullable=True))
    if not _has_column("assemblies", "meeting_method"):
        op.add_column("assemblies", sa.Column("meeting_method", sa.String(), nullable=True))
    if not _has_column("assemblies", "location"):
        op.add_column("assemblies", sa.Column("location", sa.String(), nullable=True))
    if not _has_column("assemblies", "chair_name"):
        op.add_column("assemblies", sa.Column("chair_name", sa.String(), nullable=True))
    if not _has_column("assemblies", "document_number"):
        op.add_column("assemblies", sa.Column("document_number", sa.String(), nullable=True))
    if not _has_column("assemblies", "packet_type"):
        op.add_column("assemblies", sa.Column("packet_type", sa.String(), nullable=True))
    if not _has_column("assemblies", "include_bylaw_amendment"):
        op.add_column(
            "assemblies",
            sa.Column("include_bylaw_amendment", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        )

    if not _has_table("assembly_agenda_items"):
        op.create_table(
            "assembly_agenda_items",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("assembly_id", sa.Integer(), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("kind", sa.String(), nullable=False, server_default="custom"),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("short_title", sa.String(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("requires_vote", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("source_type", sa.String(), nullable=True),
            sa.Column("source_ref", sa.String(), nullable=True),
            sa.Column("draft_basis_json", sa.Text(), nullable=True),
            sa.Column("resolution_text", sa.Text(), nullable=True),
            sa.Column("vote_result", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["assembly_id"], ["assemblies.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    if _has_table("assembly_agenda_items") and not _has_index("assembly_agenda_items", op.f("ix_assembly_agenda_items_assembly_id")):
        op.create_index(op.f("ix_assembly_agenda_items_assembly_id"), "assembly_agenda_items", ["assembly_id"], unique=False)

    if not _has_table("meeting_packet_runs"):
        op.create_table(
            "meeting_packet_runs",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("assembly_id", sa.Integer(), nullable=False),
            sa.Column("fund_id", sa.Integer(), nullable=False),
            sa.Column("packet_type", sa.String(), nullable=False),
            sa.Column("report_year", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.Column("include_bylaw_amendment", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("zip_attachment_id", sa.Integer(), nullable=True),
            sa.Column("warnings_json", sa.Text(), nullable=True),
            sa.Column("missing_slots_json", sa.Text(), nullable=True),
            sa.Column("created_by", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["assembly_id"], ["assemblies.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["fund_id"], ["funds.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["zip_attachment_id"], ["attachments.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
    if _has_table("meeting_packet_runs") and not _has_index("meeting_packet_runs", op.f("ix_meeting_packet_runs_assembly_id")):
        op.create_index(op.f("ix_meeting_packet_runs_assembly_id"), "meeting_packet_runs", ["assembly_id"], unique=False)
    if _has_table("meeting_packet_runs") and not _has_index("meeting_packet_runs", op.f("ix_meeting_packet_runs_fund_id")):
        op.create_index(op.f("ix_meeting_packet_runs_fund_id"), "meeting_packet_runs", ["fund_id"], unique=False)

    if not _has_table("meeting_packet_documents"):
        op.create_table(
            "meeting_packet_documents",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("run_id", sa.Integer(), nullable=False),
            sa.Column("slot", sa.String(), nullable=False),
            sa.Column("attachment_id", sa.Integer(), nullable=True),
            sa.Column("external_document_id", sa.Integer(), nullable=True),
            sa.Column("source_mode", sa.String(), nullable=False, server_default="generated"),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.Column("layout_mode", sa.String(), nullable=True),
            sa.Column("generation_payload_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["attachment_id"], ["attachments.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["external_document_id"], ["compliance_documents.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["run_id"], ["meeting_packet_runs.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("run_id", "slot", name="uq_meeting_packet_documents_run_slot"),
        )
    if _has_table("meeting_packet_documents") and not _has_index("meeting_packet_documents", op.f("ix_meeting_packet_documents_run_id")):
        op.create_index(op.f("ix_meeting_packet_documents_run_id"), "meeting_packet_documents", ["run_id"], unique=False)

    # SQLite cannot DROP DEFAULT via ALTER COLUMN. Keeping these defaults is harmless
    # and avoids startup failures on partially applied local databases.


def downgrade() -> None:
    op.drop_index(op.f("ix_meeting_packet_documents_run_id"), table_name="meeting_packet_documents")
    op.drop_table("meeting_packet_documents")
    op.drop_index(op.f("ix_meeting_packet_runs_fund_id"), table_name="meeting_packet_runs")
    op.drop_index(op.f("ix_meeting_packet_runs_assembly_id"), table_name="meeting_packet_runs")
    op.drop_table("meeting_packet_runs")
    op.drop_index(op.f("ix_assembly_agenda_items_assembly_id"), table_name="assembly_agenda_items")
    op.drop_table("assembly_agenda_items")
    op.drop_column("assemblies", "include_bylaw_amendment")
    op.drop_column("assemblies", "packet_type")
    op.drop_column("assemblies", "document_number")
    op.drop_column("assemblies", "chair_name")
    op.drop_column("assemblies", "location")
    op.drop_column("assemblies", "meeting_method")
    op.drop_column("assemblies", "meeting_time")
