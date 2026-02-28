"""phase38 vics monthly reports

Revision ID: f38a1b2c3d4e
Revises: e37a1b2c3d4e
Create Date: 2026-02-24 10:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f38a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = "e37a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("vics_monthly_reports"):
        op.create_table(
            "vics_monthly_reports",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_id", sa.Integer(), nullable=False),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("month", sa.Integer(), nullable=False),
            sa.Column("report_code", sa.String(), nullable=False),
            sa.Column("data_json", sa.Text(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.Column("confirmed_at", sa.DateTime(), nullable=True),
            sa.Column("submitted_at", sa.DateTime(), nullable=True),
            sa.Column("discrepancy_notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
            sa.UniqueConstraint("fund_id", "year", "month", "report_code", name="uq_vics_report_period_code"),
        )
        op.create_index("ix_vics_monthly_reports_fund_id", "vics_monthly_reports", ["fund_id"], unique=False)
        op.create_index("ix_vics_monthly_reports_year", "vics_monthly_reports", ["year"], unique=False)
        op.create_index("ix_vics_monthly_reports_month", "vics_monthly_reports", ["month"], unique=False)
        op.create_index("ix_vics_monthly_reports_report_code", "vics_monthly_reports", ["report_code"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("vics_monthly_reports"):
        op.drop_table("vics_monthly_reports")
