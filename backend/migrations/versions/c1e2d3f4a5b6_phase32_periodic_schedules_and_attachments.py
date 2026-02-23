"""phase32 periodic schedules and attachments

Revision ID: c1e2d3f4a5b6
Revises: a9d8c7b6e5f4
Create Date: 2026-02-23 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c1e2d3f4a5b6"
down_revision = "a9d8c7b6e5f4"
branch_labels = None
depends_on = None


def _table_names(inspector: sa.Inspector) -> set[str]:
    return set(inspector.get_table_names())


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {row["name"] for row in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)

    if "attachments" not in table_names:
        op.create_table(
            "attachments",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("filename", sa.String(), nullable=False),
            sa.Column("original_filename", sa.String(), nullable=False),
            sa.Column("file_path", sa.String(), nullable=False),
            sa.Column("file_size", sa.Integer(), nullable=True),
            sa.Column("mime_type", sa.String(), nullable=True),
            sa.Column("entity_type", sa.String(), nullable=True),
            sa.Column("entity_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        )

    if "periodic_schedules" not in table_names:
        op.create_table(
            "periodic_schedules",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=False),
            sa.Column("recurrence", sa.String(), nullable=False),
            sa.Column("base_month", sa.Integer(), nullable=False),
            sa.Column("base_day", sa.Integer(), nullable=False),
            sa.Column("workflow_template_id", sa.Integer(), nullable=True),
            sa.Column("fund_type_filter", sa.String(), nullable=True),
            sa.Column("reminder_offsets", sa.String(), nullable=False, server_default=sa.text("'[]'")),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("steps_json", sa.Text(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["workflow_template_id"], ["workflows.id"]),
        )
        table_names.add("periodic_schedules")

    inspector = sa.inspect(bind)
    if "periodic_schedules" in table_names:
        columns = _column_names(inspector, "periodic_schedules")
        with op.batch_alter_table("periodic_schedules", schema=None) as batch_op:
            if "steps_json" not in columns:
                batch_op.add_column(
                    sa.Column("steps_json", sa.Text(), nullable=True, server_default=sa.text("'[]'"))
                )
            if "description" not in columns:
                batch_op.add_column(sa.Column("description", sa.Text(), nullable=True))
            if "reminder_offsets" not in columns:
                batch_op.add_column(
                    sa.Column("reminder_offsets", sa.String(), nullable=True, server_default=sa.text("'[]'"))
                )
            if "created_at" not in columns:
                batch_op.add_column(
                    sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.func.now())
                )
            if "updated_at" not in columns:
                batch_op.add_column(
                    sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now())
                )

        bind.execute(
            sa.text(
                "UPDATE periodic_schedules "
                "SET steps_json = '[]' "
                "WHERE steps_json IS NULL OR TRIM(steps_json) = ''"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE periodic_schedules "
                "SET reminder_offsets = '[]' "
                "WHERE reminder_offsets IS NULL OR TRIM(reminder_offsets) = ''"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE periodic_schedules "
                "SET created_at = CURRENT_TIMESTAMP "
                "WHERE created_at IS NULL OR TRIM(CAST(created_at AS TEXT)) = ''"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE periodic_schedules "
                "SET updated_at = CURRENT_TIMESTAMP "
                "WHERE updated_at IS NULL OR TRIM(CAST(updated_at AS TEXT)) = ''"
            )
        )

    if "workflow_step_documents" in table_names:
        columns = _column_names(inspector, "workflow_step_documents")
        if "attachment_ids" not in columns:
            with op.batch_alter_table("workflow_step_documents", schema=None) as batch_op:
                batch_op.add_column(
                    sa.Column(
                        "attachment_ids",
                        sa.Text(),
                        nullable=False,
                        server_default=sa.text("'[]'"),
                    )
                )
            bind.execute(
                sa.text(
                    "UPDATE workflow_step_documents "
                    "SET attachment_ids = '[]' "
                    "WHERE attachment_ids IS NULL OR TRIM(attachment_ids) = ''"
                )
            )

    if "workflow_step_instance_documents" in table_names:
        columns = _column_names(inspector, "workflow_step_instance_documents")
        if "attachment_ids" not in columns:
            with op.batch_alter_table("workflow_step_instance_documents", schema=None) as batch_op:
                batch_op.add_column(
                    sa.Column(
                        "attachment_ids",
                        sa.Text(),
                        nullable=False,
                        server_default=sa.text("'[]'"),
                    )
                )
            bind.execute(
                sa.text(
                    "UPDATE workflow_step_instance_documents "
                    "SET attachment_ids = '[]' "
                    "WHERE attachment_ids IS NULL OR TRIM(attachment_ids) = ''"
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)

    if "workflow_step_instance_documents" in table_names:
        columns = _column_names(inspector, "workflow_step_instance_documents")
        if "attachment_ids" in columns:
            with op.batch_alter_table("workflow_step_instance_documents", schema=None) as batch_op:
                batch_op.drop_column("attachment_ids")

    if "workflow_step_documents" in table_names:
        columns = _column_names(inspector, "workflow_step_documents")
        if "attachment_ids" in columns:
            with op.batch_alter_table("workflow_step_documents", schema=None) as batch_op:
                batch_op.drop_column("attachment_ids")

    if "periodic_schedules" in table_names:
        op.drop_table("periodic_schedules")
    if "attachments" in table_names:
        op.drop_table("attachments")
