"""phase33 investment review and transaction extension

Revision ID: d7f33a1c4b2e
Revises: c1e2d3f4a5b6
Create Date: 2026-02-23 00:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d7f33a1c4b2e"
down_revision = "c1e2d3f4a5b6"
branch_labels = None
depends_on = None


def _table_names(inspector: sa.Inspector) -> set[str]:
    return set(inspector.get_table_names())


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {row["name"] for row in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)

    if "investment_reviews" not in table_names:
        op.create_table(
            "investment_reviews",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("company_name", sa.String(), nullable=False),
            sa.Column("sector", sa.String(), nullable=True),
            sa.Column("stage", sa.String(), nullable=True),
            sa.Column("deal_source", sa.String(), nullable=True),
            sa.Column("reviewer", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'소싱'")),
            sa.Column("target_amount", sa.Numeric(), nullable=True),
            sa.Column("pre_valuation", sa.Numeric(), nullable=True),
            sa.Column("post_valuation", sa.Numeric(), nullable=True),
            sa.Column("instrument", sa.String(), nullable=True),
            sa.Column("fund_id", sa.Integer(), nullable=True),
            sa.Column("review_start_date", sa.Date(), nullable=True),
            sa.Column("dd_start_date", sa.Date(), nullable=True),
            sa.Column("committee_date", sa.Date(), nullable=True),
            sa.Column("decision_date", sa.Date(), nullable=True),
            sa.Column("execution_date", sa.Date(), nullable=True),
            sa.Column("review_opinion", sa.Text(), nullable=True),
            sa.Column("committee_opinion", sa.Text(), nullable=True),
            sa.Column("decision_result", sa.String(), nullable=True),
            sa.Column("rejection_reason", sa.Text(), nullable=True),
            sa.Column("investment_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
            sa.ForeignKeyConstraint(["investment_id"], ["investments.id"]),
        )
        op.create_index("ix_investment_reviews_fund_id", "investment_reviews", ["fund_id"], unique=False)
        op.create_index(
            "ix_investment_reviews_investment_id",
            "investment_reviews",
            ["investment_id"],
            unique=False,
        )
        table_names.add("investment_reviews")

    if "review_comments" not in table_names:
        op.create_table(
            "review_comments",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("review_id", sa.Integer(), nullable=False),
            sa.Column("author", sa.String(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("comment_type", sa.String(), nullable=False, server_default=sa.text("'opinion'")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["review_id"], ["investment_reviews.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_review_comments_review_id", "review_comments", ["review_id"], unique=False)
        table_names.add("review_comments")

    if "transactions" in table_names:
        tx_columns = _column_names(inspector, "transactions")
        with op.batch_alter_table("transactions", schema=None) as batch_op:
            if "transaction_subtype" not in tx_columns:
                batch_op.add_column(sa.Column("transaction_subtype", sa.String(), nullable=True))
            if "counterparty" not in tx_columns:
                batch_op.add_column(sa.Column("counterparty", sa.String(), nullable=True))
            if "conversion_detail" not in tx_columns:
                batch_op.add_column(sa.Column("conversion_detail", sa.Text(), nullable=True))
            if "settlement_date" not in tx_columns:
                batch_op.add_column(sa.Column("settlement_date", sa.Date(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)

    if "transactions" in table_names:
        tx_columns = _column_names(inspector, "transactions")
        with op.batch_alter_table("transactions", schema=None) as batch_op:
            if "settlement_date" in tx_columns:
                batch_op.drop_column("settlement_date")
            if "conversion_detail" in tx_columns:
                batch_op.drop_column("conversion_detail")
            if "counterparty" in tx_columns:
                batch_op.drop_column("counterparty")
            if "transaction_subtype" in tx_columns:
                batch_op.drop_column("transaction_subtype")

    if "review_comments" in table_names:
        op.drop_index("ix_review_comments_review_id", table_name="review_comments")
        op.drop_table("review_comments")
    if "investment_reviews" in table_names:
        op.drop_index("ix_investment_reviews_investment_id", table_name="investment_reviews")
        op.drop_index("ix_investment_reviews_fund_id", table_name="investment_reviews")
        op.drop_table("investment_reviews")
