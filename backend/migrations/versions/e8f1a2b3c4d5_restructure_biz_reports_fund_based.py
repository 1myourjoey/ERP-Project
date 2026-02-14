"""restructure biz_reports as fund-based annual reports

Revision ID: e8f1a2b3c4d5
Revises: d4e8f7a6b901
Create Date: 2026-02-14 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e8f1a2b3c4d5"
down_revision = "d4e8f7a6b901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("biz_reports"):
        op.drop_table("biz_reports")

    op.create_table(
        "biz_reports",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("fund_id", sa.Integer(), nullable=False),
        sa.Column("report_year", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("submission_date", sa.Date(), nullable=True),
        sa.Column("total_commitment", sa.Numeric(), nullable=True),
        sa.Column("total_paid_in", sa.Numeric(), nullable=True),
        sa.Column("total_invested", sa.Numeric(), nullable=True),
        sa.Column("total_distributed", sa.Numeric(), nullable=True),
        sa.Column("fund_nav", sa.Numeric(), nullable=True),
        sa.Column("irr", sa.Numeric(), nullable=True),
        sa.Column("tvpi", sa.Numeric(), nullable=True),
        sa.Column("dpi", sa.Numeric(), nullable=True),
        sa.Column("market_overview", sa.Text(), nullable=True),
        sa.Column("portfolio_summary", sa.Text(), nullable=True),
        sa.Column("investment_activity", sa.Text(), nullable=True),
        sa.Column("key_issues", sa.Text(), nullable=True),
        sa.Column("outlook", sa.Text(), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
    )
    op.create_index(op.f("ix_biz_reports_id"), "biz_reports", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_biz_reports_id"), table_name="biz_reports")
    op.drop_table("biz_reports")

    op.create_table(
        "biz_reports",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("fund_id", sa.Integer(), nullable=True),
        sa.Column("report_type", sa.String(), nullable=False),
        sa.Column("period", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("requested_date", sa.Date(), nullable=True),
        sa.Column("received_date", sa.Date(), nullable=True),
        sa.Column("reviewed_date", sa.Date(), nullable=True),
        sa.Column("analyst_comment", sa.Text(), nullable=True),
        sa.Column("revenue", sa.Numeric(), nullable=True),
        sa.Column("operating_income", sa.Numeric(), nullable=True),
        sa.Column("net_income", sa.Numeric(), nullable=True),
        sa.Column("total_assets", sa.Numeric(), nullable=True),
        sa.Column("total_liabilities", sa.Numeric(), nullable=True),
        sa.Column("employees", sa.Integer(), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["portfolio_companies.id"]),
        sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
    )
    op.create_index(op.f("ix_biz_reports_id"), "biz_reports", ["id"], unique=False)

