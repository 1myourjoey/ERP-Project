"""add phase3 core tables

Revision ID: c3d9e1f4a2b7
Revises: a7e2c1b8f901
Create Date: 2026-02-13 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c3d9e1f4a2b7"
down_revision = "a7e2c1b8f901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assemblies",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("fund_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("agenda", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("minutes_completed", sa.Integer(), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "capital_calls",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("fund_id", sa.Integer(), nullable=False),
        sa.Column("call_date", sa.Date(), nullable=False),
        sa.Column("call_type", sa.String(), nullable=False),
        sa.Column("total_amount", sa.Integer(), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "distributions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("fund_id", sa.Integer(), nullable=False),
        sa.Column("dist_date", sa.Date(), nullable=False),
        sa.Column("dist_type", sa.String(), nullable=False),
        sa.Column("principal_total", sa.Integer(), nullable=False),
        sa.Column("profit_total", sa.Integer(), nullable=False),
        sa.Column("performance_fee", sa.Integer(), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "exit_committees",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("meeting_date", sa.Date(), nullable=False),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("agenda", sa.Text(), nullable=True),
        sa.Column("exit_strategy", sa.String(), nullable=True),
        sa.Column("analyst_opinion", sa.Text(), nullable=True),
        sa.Column("vote_result", sa.String(), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["portfolio_companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "capital_call_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("capital_call_id", sa.Integer(), nullable=False),
        sa.Column("lp_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("paid", sa.Integer(), nullable=False),
        sa.Column("paid_date", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["capital_call_id"], ["capital_calls.id"]),
        sa.ForeignKeyConstraint(["lp_id"], ["lps.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "distribution_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("distribution_id", sa.Integer(), nullable=False),
        sa.Column("lp_id", sa.Integer(), nullable=False),
        sa.Column("principal", sa.Integer(), nullable=False),
        sa.Column("profit", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["distribution_id"], ["distributions.id"]),
        sa.ForeignKeyConstraint(["lp_id"], ["lps.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "exit_committee_funds",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("exit_committee_id", sa.Integer(), nullable=False),
        sa.Column("fund_id", sa.Integer(), nullable=False),
        sa.Column("investment_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["exit_committee_id"], ["exit_committees.id"]),
        sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
        sa.ForeignKeyConstraint(["investment_id"], ["investments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "exit_trades",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("exit_committee_id", sa.Integer(), nullable=True),
        sa.Column("investment_id", sa.Integer(), nullable=False),
        sa.Column("fund_id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("exit_type", sa.String(), nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("shares_sold", sa.Integer(), nullable=True),
        sa.Column("price_per_share", sa.Integer(), nullable=True),
        sa.Column("fees", sa.Integer(), nullable=False),
        sa.Column("net_amount", sa.Integer(), nullable=True),
        sa.Column("realized_gain", sa.Integer(), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["exit_committee_id"], ["exit_committees.id"]),
        sa.ForeignKeyConstraint(["investment_id"], ["investments.id"]),
        sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
        sa.ForeignKeyConstraint(["company_id"], ["portfolio_companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("exit_trades")
    op.drop_table("exit_committee_funds")
    op.drop_table("distribution_items")
    op.drop_table("capital_call_items")
    op.drop_table("exit_committees")
    op.drop_table("distributions")
    op.drop_table("capital_calls")
    op.drop_table("assemblies")
