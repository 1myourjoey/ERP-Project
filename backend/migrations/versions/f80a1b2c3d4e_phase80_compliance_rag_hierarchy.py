"""phase80 compliance rag hierarchy

Revision ID: f80a1b2c3d4e
Revises: f79a1b2c3d4e
Create Date: 2026-03-10 22:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f80a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = "f79a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return column_name in {col["name"] for col in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "compliance_documents"):
        additions: list[tuple[str, sa.Column]] = [
            ("source_tier", sa.Column("source_tier", sa.String(), nullable=True, server_default="law")),
            ("investment_id", sa.Column("investment_id", sa.Integer(), nullable=True)),
            ("company_id", sa.Column("company_id", sa.Integer(), nullable=True)),
            ("attachment_id", sa.Column("attachment_id", sa.Integer(), nullable=True)),
            ("document_role", sa.Column("document_role", sa.String(), nullable=True)),
            ("effective_from", sa.Column("effective_from", sa.DateTime(), nullable=True)),
            ("effective_to", sa.Column("effective_to", sa.DateTime(), nullable=True)),
            ("supersedes_document_id", sa.Column("supersedes_document_id", sa.Integer(), nullable=True)),
            ("ingest_status", sa.Column("ingest_status", sa.String(), nullable=True, server_default="pending")),
            ("ocr_status", sa.Column("ocr_status", sa.String(), nullable=True, server_default="not_needed")),
            ("index_status", sa.Column("index_status", sa.String(), nullable=True, server_default="pending")),
            ("extraction_quality", sa.Column("extraction_quality", sa.Float(), nullable=True)),
        ]
        for column_name, column in additions:
            if not _has_column(inspector, "compliance_documents", column_name):
                op.add_column("compliance_documents", column)

        op.execute(
            """
            UPDATE compliance_documents
            SET source_tier = CASE
                WHEN document_type IN ('laws', 'regulations') THEN 'law'
                WHEN document_type = 'guidelines' THEN 'fund_bylaw'
                WHEN document_type IN ('agreements', 'internal') THEN 'investment_contract'
                ELSE 'law'
            END
            WHERE source_tier IS NULL OR TRIM(source_tier) = ''
            """
        )
        op.execute(
            """
            UPDATE compliance_documents
            SET ingest_status = COALESCE(NULLIF(TRIM(ingest_status), ''), 'indexed'),
                ocr_status = COALESCE(NULLIF(TRIM(ocr_status), ''), 'not_needed'),
                index_status = COALESCE(NULLIF(TRIM(index_status), ''), 'indexed'),
                effective_from = COALESCE(effective_from, effective_date)
            """
        )

        with op.batch_alter_table("compliance_documents", schema=None) as batch_op:
            if _has_column(inspector, "compliance_documents", "source_tier"):
                batch_op.alter_column("source_tier", existing_type=sa.String(), nullable=False, server_default="law")
            if _has_column(inspector, "compliance_documents", "ingest_status"):
                batch_op.alter_column("ingest_status", existing_type=sa.String(), nullable=False, server_default="pending")
            if _has_column(inspector, "compliance_documents", "ocr_status"):
                batch_op.alter_column("ocr_status", existing_type=sa.String(), nullable=False, server_default="not_needed")
            if _has_column(inspector, "compliance_documents", "index_status"):
                batch_op.alter_column("index_status", existing_type=sa.String(), nullable=False, server_default="pending")

    if not _has_table(inspector, "compliance_document_chunks"):
        op.create_table(
            "compliance_document_chunks",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("compliance_documents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("chunk_key", sa.String(), nullable=False),
            sa.Column("page_no", sa.Integer(), nullable=True),
            sa.Column("section_ref", sa.String(), nullable=True),
            sa.Column("clause_type", sa.String(), nullable=True),
            sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("token_count", sa.Integer(), nullable=True),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("chunk_key", name="uq_compliance_document_chunks_chunk_key"),
        )
        op.create_index("ix_compliance_document_chunks_document_id", "compliance_document_chunks", ["document_id"])
        op.create_index("ix_compliance_document_chunks_chunk_key", "compliance_document_chunks", ["chunk_key"])

    if not _has_table(inspector, "compliance_review_runs"):
        op.create_table(
            "compliance_review_runs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_id", sa.Integer(), sa.ForeignKey("funds.id"), nullable=False),
            sa.Column("investment_id", sa.Integer(), sa.ForeignKey("investments.id"), nullable=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("portfolio_companies.id"), nullable=True),
            sa.Column("target_type", sa.String(), nullable=False, server_default="fund"),
            sa.Column("scenario", sa.String(), nullable=False),
            sa.Column("query", sa.Text(), nullable=False),
            sa.Column("trigger_type", sa.String(), nullable=False, server_default="manual"),
            sa.Column("result", sa.String(), nullable=False, server_default="needs_review"),
            sa.Column("prevailing_tier", sa.String(), nullable=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("review_status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_compliance_review_runs_fund_id", "compliance_review_runs", ["fund_id"])
        op.create_index("ix_compliance_review_runs_investment_id", "compliance_review_runs", ["investment_id"])
        op.create_index("ix_compliance_review_runs_company_id", "compliance_review_runs", ["company_id"])
        op.create_index("ix_compliance_review_runs_created_at", "compliance_review_runs", ["created_at"])

    if not _has_table(inspector, "compliance_review_evidence"):
        op.create_table(
            "compliance_review_evidence",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("review_run_id", sa.Integer(), sa.ForeignKey("compliance_review_runs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("compliance_documents.id"), nullable=False),
            sa.Column("chunk_id", sa.Integer(), sa.ForeignKey("compliance_document_chunks.id"), nullable=True),
            sa.Column("source_tier", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False, server_default="supporting"),
            sa.Column("page_no", sa.Integer(), nullable=True),
            sa.Column("section_ref", sa.String(), nullable=True),
            sa.Column("snippet", sa.Text(), nullable=False),
            sa.Column("relevance_score", sa.Float(), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
        )
        op.create_index("ix_compliance_review_evidence_review_run_id", "compliance_review_evidence", ["review_run_id"])
        op.create_index("ix_compliance_review_evidence_document_id", "compliance_review_evidence", ["document_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "compliance_review_evidence"):
        op.drop_index("ix_compliance_review_evidence_document_id", table_name="compliance_review_evidence")
        op.drop_index("ix_compliance_review_evidence_review_run_id", table_name="compliance_review_evidence")
        op.drop_table("compliance_review_evidence")

    if _has_table(inspector, "compliance_review_runs"):
        op.drop_index("ix_compliance_review_runs_created_at", table_name="compliance_review_runs")
        op.drop_index("ix_compliance_review_runs_company_id", table_name="compliance_review_runs")
        op.drop_index("ix_compliance_review_runs_investment_id", table_name="compliance_review_runs")
        op.drop_index("ix_compliance_review_runs_fund_id", table_name="compliance_review_runs")
        op.drop_table("compliance_review_runs")

    if _has_table(inspector, "compliance_document_chunks"):
        op.drop_index("ix_compliance_document_chunks_chunk_key", table_name="compliance_document_chunks")
        op.drop_index("ix_compliance_document_chunks_document_id", table_name="compliance_document_chunks")
        op.drop_table("compliance_document_chunks")

    if _has_table(inspector, "compliance_documents"):
        columns = {col["name"] for col in inspector.get_columns("compliance_documents")}
        removable = [
            "extraction_quality",
            "index_status",
            "ocr_status",
            "ingest_status",
            "supersedes_document_id",
            "effective_to",
            "effective_from",
            "document_role",
            "attachment_id",
            "company_id",
            "investment_id",
            "source_tier",
        ]
        with op.batch_alter_table("compliance_documents", schema=None) as batch_op:
            for column_name in removable:
                if column_name in columns:
                    batch_op.drop_column(column_name)
