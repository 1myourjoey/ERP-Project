"""phase41 add biz report request doc collection fields

Revision ID: f41a1b2c3d4e
Revises: f39a1b2c3d4e
Create Date: 2026-02-24 14:10:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "f41a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = "f39a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_if_missing(existing: set[str], name: str, column: sa.Column) -> None:
    if name in existing:
        return
    op.add_column("biz_report_requests", column)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("biz_report_requests"):
        return

    existing = {row["name"] for row in inspector.get_columns("biz_report_requests")}

    _add_if_missing(
        existing,
        "doc_financial_statement",
        sa.Column("doc_financial_statement", sa.String(), nullable=False, server_default="not_requested"),
    )
    _add_if_missing(
        existing,
        "doc_biz_registration",
        sa.Column("doc_biz_registration", sa.String(), nullable=False, server_default="not_requested"),
    )
    _add_if_missing(
        existing,
        "doc_shareholder_list",
        sa.Column("doc_shareholder_list", sa.String(), nullable=False, server_default="not_requested"),
    )
    _add_if_missing(
        existing,
        "doc_corp_registry",
        sa.Column("doc_corp_registry", sa.String(), nullable=False, server_default="not_requested"),
    )
    _add_if_missing(
        existing,
        "doc_insurance_cert",
        sa.Column("doc_insurance_cert", sa.String(), nullable=False, server_default="not_requested"),
    )
    _add_if_missing(
        existing,
        "doc_credit_report",
        sa.Column("doc_credit_report", sa.String(), nullable=False, server_default="not_requested"),
    )
    _add_if_missing(
        existing,
        "doc_other_changes",
        sa.Column("doc_other_changes", sa.String(), nullable=False, server_default="not_requested"),
    )
    _add_if_missing(existing, "request_sent_date", sa.Column("request_sent_date", sa.Date(), nullable=True))
    _add_if_missing(existing, "request_deadline", sa.Column("request_deadline", sa.Date(), nullable=True))
    _add_if_missing(existing, "all_docs_received_date", sa.Column("all_docs_received_date", sa.Date(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("biz_report_requests"):
        return
    existing = {row["name"] for row in inspector.get_columns("biz_report_requests")}
    for column in [
        "all_docs_received_date",
        "request_deadline",
        "request_sent_date",
        "doc_other_changes",
        "doc_credit_report",
        "doc_insurance_cert",
        "doc_corp_registry",
        "doc_shareholder_list",
        "doc_biz_registration",
        "doc_financial_statement",
    ]:
        if column in existing:
            op.drop_column("biz_report_requests", column)
