"""phase39 internal reviews and company reviews

Revision ID: f39a1b2c3d4e
Revises: f38a1b2c3d4e
Create Date: 2026-02-24 11:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "f39a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = "f38a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("internal_reviews"):
        op.create_table(
            "internal_reviews",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_id", sa.Integer(), nullable=False),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("quarter", sa.Integer(), nullable=False),
            sa.Column("reference_date", sa.Date(), nullable=True),
            sa.Column("review_date", sa.Date(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="preparing"),
            sa.Column("attendees_json", sa.Text(), nullable=True),
            sa.Column("compliance_opinion", sa.Text(), nullable=True),
            sa.Column("compliance_officer", sa.String(), nullable=True),
            sa.Column("minutes_document_id", sa.Integer(), nullable=True),
            sa.Column("obligation_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
            sa.ForeignKeyConstraint(["obligation_id"], ["compliance_obligations.id"]),
            sa.UniqueConstraint("fund_id", "year", "quarter", name="uq_internal_review_period"),
        )
        op.create_index("ix_internal_reviews_fund_id", "internal_reviews", ["fund_id"], unique=False)
        op.create_index("ix_internal_reviews_year", "internal_reviews", ["year"], unique=False)
        op.create_index("ix_internal_reviews_quarter", "internal_reviews", ["quarter"], unique=False)
        op.create_index("ix_internal_reviews_obligation_id", "internal_reviews", ["obligation_id"], unique=False)

    if not inspector.has_table("company_reviews"):
        op.create_table(
            "company_reviews",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("review_id", sa.Integer(), nullable=False),
            sa.Column("investment_id", sa.Integer(), nullable=False),
            sa.Column("quarterly_revenue", sa.Float(), nullable=True),
            sa.Column("quarterly_operating_income", sa.Float(), nullable=True),
            sa.Column("quarterly_net_income", sa.Float(), nullable=True),
            sa.Column("total_assets", sa.Float(), nullable=True),
            sa.Column("total_liabilities", sa.Float(), nullable=True),
            sa.Column("total_equity", sa.Float(), nullable=True),
            sa.Column("cash_and_equivalents", sa.Float(), nullable=True),
            sa.Column("paid_in_capital", sa.Float(), nullable=True),
            sa.Column("employee_count", sa.Integer(), nullable=True),
            sa.Column("employee_change", sa.Integer(), nullable=True),
            sa.Column("asset_rating", sa.String(), nullable=True),
            sa.Column("rating_reason", sa.Text(), nullable=True),
            sa.Column("impairment_type", sa.String(), nullable=True),
            sa.Column("impairment_amount", sa.Float(), nullable=True),
            sa.Column("impairment_flags_json", sa.Text(), nullable=True),
            sa.Column("key_issues", sa.Text(), nullable=True),
            sa.Column("follow_up_actions", sa.Text(), nullable=True),
            sa.Column("board_attendance", sa.String(), nullable=True),
            sa.Column("investment_opinion", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["review_id"], ["internal_reviews.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["investment_id"], ["investments.id"]),
            sa.UniqueConstraint("review_id", "investment_id", name="uq_company_review_investment"),
        )
        op.create_index("ix_company_reviews_review_id", "company_reviews", ["review_id"], unique=False)
        op.create_index("ix_company_reviews_investment_id", "company_reviews", ["investment_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("company_reviews"):
        op.drop_table("company_reviews")
    if inspector.has_table("internal_reviews"):
        op.drop_table("internal_reviews")
