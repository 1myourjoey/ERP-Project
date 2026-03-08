"""add analytics views table

Revision ID: f72c3d4e5f6a
Revises: f71b2c3d4e5f
Create Date: 2026-03-08 21:20:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f72c3d4e5f6a"
down_revision: Union[str, Sequence[str], None] = "f71b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_index(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(idx.get("name") == index_name for idx in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "analytics_views"):
        op.create_table(
            "analytics_views",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("subject_key", sa.String(length=50), nullable=False),
            sa.Column("config_json", sa.JSON(), nullable=False),
            sa.Column("is_favorite", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    inspector = sa.inspect(bind)
    if _has_table(inspector, "analytics_views") and not _has_index(inspector, "analytics_views", "ix_analytics_views_owner_user_id"):
        op.create_index("ix_analytics_views_owner_user_id", "analytics_views", ["owner_user_id"], unique=False)
    inspector = sa.inspect(bind)
    if _has_table(inspector, "analytics_views") and not _has_index(inspector, "analytics_views", "ix_analytics_views_subject_key"):
        op.create_index("ix_analytics_views_subject_key", "analytics_views", ["subject_key"], unique=False)
    inspector = sa.inspect(bind)
    if _has_table(inspector, "analytics_views") and not _has_index(inspector, "analytics_views", "ix_analytics_views_is_favorite"):
        op.create_index("ix_analytics_views_is_favorite", "analytics_views", ["is_favorite"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "analytics_views"):
        if _has_index(inspector, "analytics_views", "ix_analytics_views_is_favorite"):
            op.drop_index("ix_analytics_views_is_favorite", table_name="analytics_views")
        inspector = sa.inspect(bind)
        if _has_index(inspector, "analytics_views", "ix_analytics_views_subject_key"):
            op.drop_index("ix_analytics_views_subject_key", table_name="analytics_views")
        inspector = sa.inspect(bind)
        if _has_index(inspector, "analytics_views", "ix_analytics_views_owner_user_id"):
            op.drop_index("ix_analytics_views_owner_user_id", table_name="analytics_views")
        op.drop_table("analytics_views")
