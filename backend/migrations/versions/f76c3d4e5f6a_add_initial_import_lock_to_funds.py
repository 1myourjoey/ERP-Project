"""add initial import lock to funds

Revision ID: f76c3d4e5f6a
Revises: f75b2c3d4e5f
Create Date: 2026-03-09 02:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f76c3d4e5f6a"
down_revision: Union[str, Sequence[str], None] = "f75b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(column.get("name") == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "funds") and not _has_column(inspector, "funds", "initial_import_completed_at"):
        op.add_column("funds", sa.Column("initial_import_completed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "funds") and _has_column(inspector, "funds", "initial_import_completed_at"):
        op.drop_column("funds", "initial_import_completed_at")
