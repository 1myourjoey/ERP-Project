"""add scope fields to compliance_documents

Revision ID: f56a1b2c3d4e
Revises: f43a1b2c3d4e
Create Date: 2026-03-02 00:10:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f56a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = "f43a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("compliance_documents"):
        return

    columns = {col["name"] for col in inspector.get_columns("compliance_documents")}

    if "scope" not in columns:
        op.add_column("compliance_documents", sa.Column("scope", sa.String(), nullable=True))
    if "fund_id" not in columns:
        op.add_column("compliance_documents", sa.Column("fund_id", sa.Integer(), nullable=True))
    if "fund_type_filter" not in columns:
        op.add_column("compliance_documents", sa.Column("fund_type_filter", sa.String(), nullable=True))

    op.execute(
        """
        UPDATE compliance_documents
        SET scope = CASE
            WHEN document_type IN ('laws', 'regulations') THEN 'global'
            WHEN document_type = 'guidelines' THEN 'fund_type'
            WHEN document_type IN ('agreements', 'internal') THEN 'fund'
            ELSE 'global'
        END
        WHERE scope IS NULL OR TRIM(scope) = ''
        """
    )

    # Backfill known legacy values from old rows (if any)
    op.execute(
        """
        UPDATE compliance_documents
        SET scope = 'global'
        WHERE scope = 'law'
        """
    )

    with op.batch_alter_table("compliance_documents", schema=None) as batch_op:
        batch_op.alter_column(
            "scope",
            existing_type=sa.String(),
            nullable=False,
            server_default="global",
        )

    fk_names = {fk.get("name") for fk in inspector.get_foreign_keys("compliance_documents")}
    has_fund_fk = any(
        "fund_id" in (fk.get("constrained_columns") or [])
        and (fk.get("referred_table") == "funds")
        for fk in inspector.get_foreign_keys("compliance_documents")
    )
    if not has_fund_fk:
        fk_name = "fk_compliance_documents_fund_id"
        if fk_name in fk_names:
            fk_name = "fk_compliance_doc_fund"
        with op.batch_alter_table("compliance_documents", schema=None) as batch_op:
            batch_op.create_foreign_key(
                fk_name,
                "funds",
                ["fund_id"],
                ["id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("compliance_documents"):
        return

    columns = {col["name"] for col in inspector.get_columns("compliance_documents")}
    fks = inspector.get_foreign_keys("compliance_documents")
    fk_names = {
        fk.get("name")
        for fk in fks
        if "fund_id" in (fk.get("constrained_columns") or [])
        and fk.get("referred_table") == "funds"
    }

    with op.batch_alter_table("compliance_documents", schema=None) as batch_op:
        for fk_name in fk_names:
            if fk_name:
                batch_op.drop_constraint(fk_name, type_="foreignkey")
        if "fund_type_filter" in columns:
            batch_op.drop_column("fund_type_filter")
        if "fund_id" in columns:
            batch_op.drop_column("fund_id")
        if "scope" in columns:
            batch_op.drop_column("scope")
