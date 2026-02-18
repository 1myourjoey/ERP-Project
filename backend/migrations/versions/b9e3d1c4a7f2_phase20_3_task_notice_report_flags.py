"""phase20_3 task and workflow notice/report flags

Revision ID: b9e3d1c4a7f2
Revises: 20f2a1b4c6d8
Create Date: 2026-02-18 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b9e3d1c4a7f2"
down_revision = "20f2a1b4c6d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    task_columns = {col["name"] for col in inspector.get_columns("tasks")}
    if "is_notice" not in task_columns:
        with op.batch_alter_table("tasks", schema=None) as batch_op:
            batch_op.add_column(sa.Column("is_notice", sa.Boolean(), nullable=False, server_default=sa.false()))
    if "is_report" not in task_columns:
        with op.batch_alter_table("tasks", schema=None) as batch_op:
            batch_op.add_column(sa.Column("is_report", sa.Boolean(), nullable=False, server_default=sa.false()))

    workflow_step_columns = {col["name"] for col in inspector.get_columns("workflow_steps")}
    if "is_notice" not in workflow_step_columns:
        with op.batch_alter_table("workflow_steps", schema=None) as batch_op:
            batch_op.add_column(sa.Column("is_notice", sa.Boolean(), nullable=False, server_default=sa.false()))
    if "is_report" not in workflow_step_columns:
        with op.batch_alter_table("workflow_steps", schema=None) as batch_op:
            batch_op.add_column(sa.Column("is_report", sa.Boolean(), nullable=False, server_default=sa.false()))

    with op.batch_alter_table("tasks", schema=None) as batch_op:
        batch_op.alter_column("is_notice", server_default=None)
        batch_op.alter_column("is_report", server_default=None)

    with op.batch_alter_table("workflow_steps", schema=None) as batch_op:
        batch_op.alter_column("is_notice", server_default=None)
        batch_op.alter_column("is_report", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    workflow_step_columns = {col["name"] for col in inspector.get_columns("workflow_steps")}
    if "is_report" in workflow_step_columns:
        with op.batch_alter_table("workflow_steps", schema=None) as batch_op:
            batch_op.drop_column("is_report")
    if "is_notice" in workflow_step_columns:
        with op.batch_alter_table("workflow_steps", schema=None) as batch_op:
            batch_op.drop_column("is_notice")

    task_columns = {col["name"] for col in inspector.get_columns("tasks")}
    if "is_report" in task_columns:
        with op.batch_alter_table("tasks", schema=None) as batch_op:
            batch_op.drop_column("is_report")
    if "is_notice" in task_columns:
        with op.batch_alter_table("tasks", schema=None) as batch_op:
            batch_op.drop_column("is_notice")
