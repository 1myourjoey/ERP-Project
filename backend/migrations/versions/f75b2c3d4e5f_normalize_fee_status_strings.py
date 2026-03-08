"""normalize fee status strings

Revision ID: f75b2c3d4e5f
Revises: f74b1c2d3e4f
Create Date: 2026-03-09 00:45:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f75b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "f74b1c2d3e4f"
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

    if _has_table(inspector, "management_fees") and _has_column(inspector, "management_fees", "status"):
        bind.execute(
            sa.text(
                """
                UPDATE management_fees
                SET status = '계산완료'
                WHERE status IS NULL
                   OR status = ''
                   OR status = 'УЛБИ'
                   OR status = '怨꾩궛?꾨즺'
                """
            )
        )

    if _has_table(inspector, "performance_fee_simulations") and _has_column(
        inspector, "performance_fee_simulations", "status"
    ):
        bind.execute(
            sa.text(
                """
                UPDATE performance_fee_simulations
                SET status = '시뮬레이션'
                WHERE status IS NULL
                   OR status = ''
                   OR status = '?쒕??덉씠??'
                """
            )
        )


def downgrade() -> None:
    pass
