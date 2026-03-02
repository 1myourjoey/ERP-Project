"""phase70 notifications and compliance template link

Revision ID: f70a1b2c3d4e
Revises: e58a1b2c3d4f
Create Date: 2026-03-01
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f70a1b2c3d4e"
down_revision = "e58a1b2c3d4f"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(col.get("name") == column_name for col in inspector.get_columns(table_name))


def _has_index(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(idx.get("name") == index_name for idx in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "notifications"):
        op.create_table(
            "notifications",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("category", sa.String(length=30), nullable=False),
            sa.Column("severity", sa.String(length=10), nullable=False, server_default="info"),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("message", sa.Text(), nullable=True),
            sa.Column("target_type", sa.String(length=30), nullable=True),
            sa.Column("target_id", sa.Integer(), nullable=True),
            sa.Column("action_type", sa.String(length=30), nullable=True),
            sa.Column("action_url", sa.String(length=500), nullable=True),
            sa.Column("action_payload", sa.JSON(), nullable=True),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("read_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    inspector = sa.inspect(bind)
    if _has_table(inspector, "notifications"):
        # Backfill missing columns for environments that created an earlier partial table.
        if not _has_column(inspector, "notifications", "category"):
            op.add_column("notifications", sa.Column("category", sa.String(length=30), nullable=False, server_default="system"))
        if not _has_column(inspector, "notifications", "severity"):
            op.add_column("notifications", sa.Column("severity", sa.String(length=10), nullable=False, server_default="info"))
        if not _has_column(inspector, "notifications", "title"):
            op.add_column("notifications", sa.Column("title", sa.String(length=200), nullable=False, server_default="알림"))
        if not _has_column(inspector, "notifications", "message"):
            op.add_column("notifications", sa.Column("message", sa.Text(), nullable=True))
        if not _has_column(inspector, "notifications", "target_type"):
            op.add_column("notifications", sa.Column("target_type", sa.String(length=30), nullable=True))
        if not _has_column(inspector, "notifications", "target_id"):
            op.add_column("notifications", sa.Column("target_id", sa.Integer(), nullable=True))
        if not _has_column(inspector, "notifications", "action_type"):
            op.add_column("notifications", sa.Column("action_type", sa.String(length=30), nullable=True))
        if not _has_column(inspector, "notifications", "action_url"):
            op.add_column("notifications", sa.Column("action_url", sa.String(length=500), nullable=True))
        if not _has_column(inspector, "notifications", "action_payload"):
            op.add_column("notifications", sa.Column("action_payload", sa.JSON(), nullable=True))
        if not _has_column(inspector, "notifications", "is_read"):
            op.add_column("notifications", sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("0")))
        if not _has_column(inspector, "notifications", "read_at"):
            op.add_column("notifications", sa.Column("read_at", sa.DateTime(), nullable=True))
        if not _has_column(inspector, "notifications", "created_at"):
            op.add_column("notifications", sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))

    inspector = sa.inspect(bind)
    if _has_table(inspector, "notifications") and not _has_index(inspector, "notifications", "ix_notifications_user_read"):
        op.create_index("ix_notifications_user_read", "notifications", ["user_id", "is_read"])
    inspector = sa.inspect(bind)
    if _has_table(inspector, "notifications") and not _has_index(inspector, "notifications", "ix_notifications_created"):
        op.create_index("ix_notifications_created", "notifications", ["created_at"])

    inspector = sa.inspect(bind)
    if _has_table(inspector, "compliance_obligations") and not _has_column(inspector, "compliance_obligations", "template_id"):
        op.add_column(
            "compliance_obligations",
            sa.Column("template_id", sa.Integer(), nullable=True),
        )

    inspector = sa.inspect(bind)
    if _has_table(inspector, "compliance_obligations") and not _has_index(
        inspector,
        "compliance_obligations",
        "ix_compliance_obligations_template_id",
    ):
        op.create_index(
            "ix_compliance_obligations_template_id",
            "compliance_obligations",
            ["template_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "notifications"):
        if _has_index(inspector, "notifications", "ix_notifications_created"):
            op.drop_index("ix_notifications_created", table_name="notifications")
        inspector = sa.inspect(bind)
        if _has_index(inspector, "notifications", "ix_notifications_user_read"):
            op.drop_index("ix_notifications_user_read", table_name="notifications")
        op.drop_table("notifications")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "compliance_obligations") and _has_index(
        inspector,
        "compliance_obligations",
        "ix_compliance_obligations_template_id",
    ):
        op.drop_index("ix_compliance_obligations_template_id", table_name="compliance_obligations")
