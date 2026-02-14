"""add fund notice periods and key terms

Revision ID: d4e8f7a6b901
Revises: c3d9e1f4a2b7
Create Date: 2026-02-14 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d4e8f7a6b901"
down_revision = "c3d9e1f4a2b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fund_notice_periods",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("fund_id", sa.Integer(), nullable=False),
        sa.Column("notice_type", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("business_days", sa.Integer(), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "fund_key_terms",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("fund_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("article_ref", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("fund_key_terms")
    op.drop_table("fund_notice_periods")
