"""add workflow step documents

Revision ID: c8a1d9e2f3b4
Revises: b9e3d1c4a7f2
Create Date: 2026-02-18 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c8a1d9e2f3b4"
down_revision = "b9e3d1c4a7f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("workflow_step_documents"):
        return

    op.create_table(
        "workflow_step_documents",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workflow_step_id", sa.Integer(), nullable=False),
        sa.Column("document_template_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("timing", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["workflow_step_id"], ["workflow_steps.id"]),
        sa.ForeignKeyConstraint(["document_template_id"], ["document_templates.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    with op.batch_alter_table("workflow_step_documents", schema=None) as batch_op:
        batch_op.alter_column("required", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("workflow_step_documents"):
        op.drop_table("workflow_step_documents")
