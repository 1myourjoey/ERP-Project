"""add transactions table

Revision ID: 9b3f4c2d1a00
Revises: 7f2a1b4c9d10
Create Date: 2026-02-13 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9b3f4c2d1a00"
down_revision = "7f2a1b4c9d10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("investment_id", sa.Integer(), nullable=False),
        sa.Column("fund_id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("shares_change", sa.Integer(), nullable=True),
        sa.Column("balance_before", sa.Integer(), nullable=True),
        sa.Column("balance_after", sa.Integer(), nullable=True),
        sa.Column("realized_gain", sa.Integer(), nullable=True),
        sa.Column("cumulative_gain", sa.Integer(), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["portfolio_companies.id"]),
        sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
        sa.ForeignKeyConstraint(["investment_id"], ["investments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("transactions")
