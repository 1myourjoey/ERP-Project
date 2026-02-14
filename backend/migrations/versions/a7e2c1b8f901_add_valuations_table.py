"""add valuations table

Revision ID: a7e2c1b8f901
Revises: 9b3f4c2d1a00
Create Date: 2026-02-13 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a7e2c1b8f901"
down_revision = "9b3f4c2d1a00"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "valuations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("investment_id", sa.Integer(), nullable=False),
        sa.Column("fund_id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("evaluator", sa.String(), nullable=True),
        sa.Column("method", sa.String(), nullable=True),
        sa.Column("instrument", sa.String(), nullable=True),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("prev_value", sa.Integer(), nullable=True),
        sa.Column("change_amount", sa.Integer(), nullable=True),
        sa.Column("change_pct", sa.Float(), nullable=True),
        sa.Column("basis", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["portfolio_companies.id"]),
        sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
        sa.ForeignKeyConstraint(["investment_id"], ["investments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("valuations")
