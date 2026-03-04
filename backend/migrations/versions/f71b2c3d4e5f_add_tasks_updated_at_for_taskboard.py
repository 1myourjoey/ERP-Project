"""add tasks.updated_at for taskboard stale tracking

Revision ID: f71b2c3d4e5f
Revises: f56a1b2c3d4e, f70a1b2c3d4e
Create Date: 2026-03-03 18:20:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f71b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = ("f56a1b2c3d4e", "f70a1b2c3d4e")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(col.get("name") == column_name for col in inspector.get_columns(table_name))


def _has_index(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(idx.get("name") == index_name for idx in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "tasks"):
        return

    if not _has_column(inspector, "tasks", "updated_at"):
        with op.batch_alter_table("tasks", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now())
            )

    op.execute(
        """
        UPDATE tasks
        SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
        WHERE updated_at IS NULL
           OR TRIM(CAST(updated_at AS TEXT)) = ''
        """
    )

    inspector = sa.inspect(bind)
    if _has_table(inspector, "tasks") and not _has_index(inspector, "tasks", "ix_tasks_updated_at"):
        op.create_index("ix_tasks_updated_at", "tasks", ["updated_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "tasks"):
        return

    if _has_index(inspector, "tasks", "ix_tasks_updated_at"):
        op.drop_index("ix_tasks_updated_at", table_name="tasks")

    inspector = sa.inspect(bind)
    if _has_column(inspector, "tasks", "updated_at"):
        with op.batch_alter_table("tasks", schema=None) as batch_op:
            batch_op.drop_column("updated_at")
