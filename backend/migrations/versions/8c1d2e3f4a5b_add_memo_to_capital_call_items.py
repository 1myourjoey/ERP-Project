"""add memo to capital_call_items

Revision ID: 8c1d2e3f4a5b
Revises: 712923f11162
Create Date: 2026-02-18 01:05:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "8c1d2e3f4a5b"
down_revision = "712923f11162"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("capital_call_items", sa.Column("memo", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("capital_call_items", "memo")
