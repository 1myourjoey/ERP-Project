"""add fund manager, investment period end, gp commitment to funds

Revision ID: f4b9c8d7e601
Revises: e8f1a2b3c4d5
Create Date: 2026-02-14 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f4b9c8d7e601"
down_revision = "e8f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("funds", sa.Column("fund_manager", sa.String(), nullable=True))
    op.add_column("funds", sa.Column("investment_period_end", sa.Date(), nullable=True))
    op.add_column("funds", sa.Column("gp_commitment", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("funds", "gp_commitment")
    op.drop_column("funds", "investment_period_end")
    op.drop_column("funds", "fund_manager")
