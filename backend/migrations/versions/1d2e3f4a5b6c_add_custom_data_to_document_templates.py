"""add custom_data to document_templates

Revision ID: 1d2e3f4a5b6c
Revises: f4b9c8d7e601
Create Date: 2026-02-16 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "1d2e3f4a5b6c"
down_revision = "f4b9c8d7e601"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "document_templates",
        sa.Column("custom_data", sa.Text(), nullable=True, server_default="{}"),
    )
    op.execute("UPDATE document_templates SET custom_data = '{}' WHERE custom_data IS NULL")
    op.alter_column("document_templates", "custom_data", server_default=None)


def downgrade() -> None:
    op.drop_column("document_templates", "custom_data")
