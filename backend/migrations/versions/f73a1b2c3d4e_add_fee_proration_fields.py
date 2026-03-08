"""add fee proration fields

Revision ID: f73a1b2c3d4e
Revises: f72c3d4e5f6a
Create Date: 2026-03-08 23:40:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f73a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = "f72c3d4e5f6a"
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

    if _has_table(inspector, "fee_configs") and not _has_column(inspector, "fee_configs", "mgmt_fee_proration_method"):
        op.add_column(
            "fee_configs",
            sa.Column("mgmt_fee_proration_method", sa.String(), nullable=False, server_default="equal_quarter"),
        )

    inspector = sa.inspect(bind)
    if _has_table(inspector, "management_fees") and not _has_column(inspector, "management_fees", "proration_method"):
        op.add_column(
            "management_fees",
            sa.Column("proration_method", sa.String(), nullable=False, server_default="equal_quarter"),
        )

    inspector = sa.inspect(bind)
    if _has_table(inspector, "management_fees") and not _has_column(inspector, "management_fees", "period_days"):
        op.add_column("management_fees", sa.Column("period_days", sa.Integer(), nullable=True))

    inspector = sa.inspect(bind)
    if _has_table(inspector, "management_fees") and not _has_column(inspector, "management_fees", "year_days"):
        op.add_column("management_fees", sa.Column("year_days", sa.Integer(), nullable=True))

    inspector = sa.inspect(bind)
    if _has_table(inspector, "management_fees") and not _has_column(inspector, "management_fees", "applied_phase"):
        op.add_column(
            "management_fees",
            sa.Column("applied_phase", sa.String(), nullable=False, server_default="investment"),
        )

    inspector = sa.inspect(bind)
    if _has_table(inspector, "management_fees") and not _has_column(inspector, "management_fees", "calculation_detail"):
        op.add_column("management_fees", sa.Column("calculation_detail", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "management_fees") and _has_column(inspector, "management_fees", "applied_phase"):
        op.drop_column("management_fees", "applied_phase")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "management_fees") and _has_column(inspector, "management_fees", "calculation_detail"):
        op.drop_column("management_fees", "calculation_detail")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "management_fees") and _has_column(inspector, "management_fees", "year_days"):
        op.drop_column("management_fees", "year_days")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "management_fees") and _has_column(inspector, "management_fees", "period_days"):
        op.drop_column("management_fees", "period_days")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "management_fees") and _has_column(inspector, "management_fees", "proration_method"):
        op.drop_column("management_fees", "proration_method")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "fee_configs") and _has_column(inspector, "fee_configs", "mgmt_fee_proration_method"):
        op.drop_column("fee_configs", "mgmt_fee_proration_method")
