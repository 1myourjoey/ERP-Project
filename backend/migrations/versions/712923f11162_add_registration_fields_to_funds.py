"""add registration fields to funds

Revision ID: 712923f11162
Revises: 2a4b6c8d0e1f
Create Date: 2026-02-17 21:31:21.787502
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '712923f11162'
down_revision = '2a4b6c8d0e1f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("funds", sa.Column("registration_number", sa.String(), nullable=True))
    op.add_column("funds", sa.Column("registration_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("funds", "registration_date")
    op.drop_column("funds", "registration_number")
