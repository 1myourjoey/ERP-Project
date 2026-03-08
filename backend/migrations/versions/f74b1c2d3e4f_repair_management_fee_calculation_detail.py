"""repair missing management fee calculation detail column

Revision ID: f74b1c2d3e4f
Revises: f73a1b2c3d4e
Create Date: 2026-03-09 00:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f74b1c2d3e4f"
down_revision: Union[str, Sequence[str], None] = "f73a1b2c3d4e"
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

    if _has_table(inspector, "management_fees") and not _has_column(
        inspector, "management_fees", "calculation_detail"
    ):
        op.add_column("management_fees", sa.Column("calculation_detail", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "management_fees") and _has_column(inspector, "management_fees", "calculation_detail"):
        op.drop_column("management_fees", "calculation_detail")
