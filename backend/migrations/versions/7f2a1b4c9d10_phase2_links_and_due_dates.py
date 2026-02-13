"""phase2 links and due dates

Revision ID: 7f2a1b4c9d10
Revises: 12d924b712e3
Create Date: 2026-02-13 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "7f2a1b4c9d10"
down_revision = "12d924b712e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("workflow_instances", schema=None) as batch_op:
        batch_op.add_column(sa.Column("investment_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("company_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("fund_id", sa.Integer(), nullable=True))

    with op.batch_alter_table("investment_documents", schema=None) as batch_op:
        batch_op.add_column(sa.Column("due_date", sa.Date(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("investment_documents", schema=None) as batch_op:
        batch_op.drop_column("due_date")

    with op.batch_alter_table("workflow_instances", schema=None) as batch_op:
        batch_op.drop_column("fund_id")
        batch_op.drop_column("company_id")
        batch_op.drop_column("investment_id")
