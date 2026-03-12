"""normalize meeting packet types and add document ordering

Revision ID: f82a1b2c3d4e
Revises: f81a1b2c3d4e
Create Date: 2026-03-12 15:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f82a1b2c3d4e"
down_revision = "f81a1b2c3d4e"
branch_labels = None
depends_on = None

LEGACY_PACKET_TYPE = "fund_lp_regular_meeting_pex"
CANONICAL_PACKET_TYPE = "fund_lp_regular_meeting_nongmotae"

DEFAULT_SLOT_ORDER = {
    CANONICAL_PACKET_TYPE: [
        "official_notice",
        "agenda_explanation",
        "audit_report",
        "business_report",
        "proxy_vote_notice",
    ],
    "fund_lp_regular_meeting_project": [
        "official_notice",
        "agenda_explanation",
        "audit_report",
        "business_report",
        "written_resolution",
        "minutes",
    ],
    "fund_lp_regular_meeting_project_with_bylaw_amendment": [
        "official_notice",
        "agenda_explanation",
        "audit_report",
        "business_report",
        "bylaw_amendment_draft",
        "bylaw_redline",
        "written_resolution",
        "minutes",
    ],
    "gp_shareholders_meeting": [
        "official_notice",
        "agenda_explanation",
        "financial_statement_certificate",
        "written_resolution",
        "minutes",
    ],
}


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(row["name"] == column_name for row in inspector.get_columns(table_name))


def _rewrite_packet_types(old_value: str, new_value: str) -> None:
    bind = op.get_bind()
    if _has_table("meeting_packet_runs") and _has_column("meeting_packet_runs", "packet_type"):
        bind.execute(
            sa.text(
                "UPDATE meeting_packet_runs SET packet_type = :new_value WHERE packet_type = :old_value"
            ),
            {"old_value": old_value, "new_value": new_value},
        )
    if _has_table("assemblies") and _has_column("assemblies", "packet_type"):
        bind.execute(
            sa.text(
                "UPDATE assemblies SET packet_type = :new_value WHERE packet_type = :old_value"
            ),
            {"old_value": old_value, "new_value": new_value},
        )


def _backfill_document_sort_order() -> None:
    if not (_has_table("meeting_packet_documents") and _has_table("meeting_packet_runs")):
        return
    bind = op.get_bind()
    for packet_type, slots in DEFAULT_SLOT_ORDER.items():
        for sort_order, slot in enumerate(slots):
            bind.execute(
                sa.text(
                    """
                    UPDATE meeting_packet_documents
                    SET sort_order = :sort_order
                    WHERE slot = :slot
                      AND run_id IN (
                        SELECT id FROM meeting_packet_runs WHERE packet_type = :packet_type
                      )
                    """
                ),
                {"packet_type": packet_type, "slot": slot, "sort_order": sort_order},
            )


def upgrade() -> None:
    if _has_table("meeting_packet_documents") and not _has_column("meeting_packet_documents", "sort_order"):
        op.add_column(
            "meeting_packet_documents",
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        )

    _rewrite_packet_types(LEGACY_PACKET_TYPE, CANONICAL_PACKET_TYPE)
    _backfill_document_sort_order()


def downgrade() -> None:
    _rewrite_packet_types(CANONICAL_PACKET_TYPE, LEGACY_PACKET_TYPE)

    if _has_table("meeting_packet_documents") and _has_column("meeting_packet_documents", "sort_order"):
        op.drop_column("meeting_packet_documents", "sort_order")
