"""phase43 add document generation tables

Revision ID: f43a1b2c3d4e
Revises: f42a3b4c5d6e
Create Date: 2026-02-25 22:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "f43a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = "f42a3b4c5d6e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_names(inspector: sa.Inspector) -> set[str]:
    return set(inspector.get_table_names())


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {row["name"] for row in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "document_generations" not in tables:
        op.create_table(
            "document_generations",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_id", sa.Integer(), sa.ForeignKey("funds.id"), nullable=False),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("variables_json", sa.Text(), nullable=False),
            sa.Column("stages", sa.String(length=20), nullable=True),
            sa.Column("output_path", sa.String(length=500), nullable=True),
            sa.Column("total_files", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("success_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("warnings_json", sa.Text(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
        )

    if "document_variables" not in tables:
        op.create_table(
            "document_variables",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_id", sa.Integer(), sa.ForeignKey("funds.id"), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("variables_json", sa.Text(), nullable=False),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("fund_id", "name", name="uq_document_variables_fund_name"),
        )

    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "document_generations" in tables:
        indexes = _index_names(inspector, "document_generations")
        if "ix_document_generations_fund_id" not in indexes:
            op.create_index("ix_document_generations_fund_id", "document_generations", ["fund_id"], unique=False)
        if "ix_document_generations_created_by" not in indexes:
            op.create_index("ix_document_generations_created_by", "document_generations", ["created_by"], unique=False)
        if "ix_document_generations_created_at" not in indexes:
            op.create_index("ix_document_generations_created_at", "document_generations", ["created_at"], unique=False)
        if "ix_document_generations_status" not in indexes:
            op.create_index("ix_document_generations_status", "document_generations", ["status"], unique=False)

    if "document_variables" in tables:
        indexes = _index_names(inspector, "document_variables")
        if "ix_document_variables_fund_id" not in indexes:
            op.create_index("ix_document_variables_fund_id", "document_variables", ["fund_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "document_variables" in tables:
        indexes = _index_names(inspector, "document_variables")
        if "ix_document_variables_fund_id" in indexes:
            op.drop_index("ix_document_variables_fund_id", table_name="document_variables")
        op.drop_table("document_variables")

    inspector = sa.inspect(bind)
    tables = _table_names(inspector)
    if "document_generations" in tables:
        indexes = _index_names(inspector, "document_generations")
        for index_name in [
            "ix_document_generations_status",
            "ix_document_generations_created_at",
            "ix_document_generations_created_by",
            "ix_document_generations_fund_id",
        ]:
            if index_name in indexes:
                op.drop_index(index_name, table_name="document_generations")
        op.drop_table("document_generations")
