"""add request_percent to capital_calls

Revision ID: 2a4b6c8d0e1f
Revises: 1d2e3f4a5b6c
Create Date: 2026-02-17 20:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2a4b6c8d0e1f"
down_revision = "1d2e3f4a5b6c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("capital_calls", sa.Column("request_percent", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("capital_calls", "request_percent")
