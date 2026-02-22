"""add performance indexes and workflow-step uniqueness

Revision ID: a9d8c7b6e5f4
Revises: f1a2b3c4d5e6
Create Date: 2026-02-22 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a9d8c7b6e5f4"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {row["name"] for row in inspector.get_indexes(table_name)}


def _unique_constraint_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {
        row["name"]
        for row in inspector.get_unique_constraints(table_name)
        if row.get("name")
    }


def _table_names(inspector: sa.Inspector) -> set[str]:
    return set(inspector.get_table_names())


def _ensure_index(
    inspector: sa.Inspector,
    table_name: str,
    index_name: str,
    columns: list[str],
    *,
    unique: bool = False,
) -> None:
    if index_name in _index_names(inspector, table_name):
        return
    op.create_index(index_name, table_name, columns, unique=unique)


def _drop_index_if_exists(inspector: sa.Inspector, table_name: str, index_name: str) -> None:
    if index_name not in _index_names(inspector, table_name):
        return
    op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)

    _ensure_index(inspector, "tasks", "ix_tasks_status", ["status"])
    _ensure_index(inspector, "tasks", "ix_tasks_deadline", ["deadline"])
    _ensure_index(inspector, "tasks", "ix_tasks_category", ["category"])
    _ensure_index(inspector, "tasks", "ix_tasks_fund_id", ["fund_id"])
    _ensure_index(inspector, "tasks", "ix_tasks_workflow_instance_id", ["workflow_instance_id"])
    _ensure_index(inspector, "tasks", "ix_tasks_is_notice", ["is_notice"])
    _ensure_index(inspector, "tasks", "ix_tasks_is_report", ["is_report"])

    _ensure_index(inspector, "worklogs", "ix_worklogs_category", ["category"])
    _ensure_index(inspector, "worklogs", "ix_worklogs_task_id", ["task_id"])
    _ensure_index(inspector, "worklogs", "ix_worklogs_date", ["date"])

    _ensure_index(
        inspector,
        "workflow_step_instances",
        "ix_workflow_step_instances_instance_id",
        ["instance_id"],
    )
    _ensure_index(
        inspector,
        "workflow_step_instances",
        "ix_workflow_step_instances_task_id",
        ["task_id"],
    )

    existing_unique = _unique_constraint_names(inspector, "workflow_step_instances")
    if "uq_step_instance" not in existing_unique:
        with op.batch_alter_table("workflow_step_instances", schema=None) as batch_op:
            batch_op.create_unique_constraint(
                "uq_step_instance",
                ["instance_id", "workflow_step_id"],
            )

    _ensure_index(
        inspector,
        "workflow_step_instance_documents",
        "ix_workflow_step_instance_documents_step_instance_id",
        ["step_instance_id"],
    )

    _ensure_index(inspector, "calendar_events", "ix_calendar_events_date", ["date"])

    if "task_categories" in table_names:
        # Remove exact-name duplicates so the unique constraint can be applied safely.
        bind.execute(
            sa.text(
                """
                DELETE FROM task_categories
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM task_categories
                    GROUP BY name
                )
                """
            )
        )
        existing_unique = _unique_constraint_names(inspector, "task_categories")
        if "uq_task_categories_name" not in existing_unique:
            with op.batch_alter_table("task_categories", schema=None) as batch_op:
                batch_op.create_unique_constraint("uq_task_categories_name", ["name"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = _table_names(inspector)

    if "task_categories" in table_names:
        existing_unique = _unique_constraint_names(inspector, "task_categories")
        if "uq_task_categories_name" in existing_unique:
            with op.batch_alter_table("task_categories", schema=None) as batch_op:
                batch_op.drop_constraint("uq_task_categories_name", type_="unique")

    existing_unique = _unique_constraint_names(inspector, "workflow_step_instances")
    if "uq_step_instance" in existing_unique:
        with op.batch_alter_table("workflow_step_instances", schema=None) as batch_op:
            batch_op.drop_constraint("uq_step_instance", type_="unique")

    _drop_index_if_exists(inspector, "calendar_events", "ix_calendar_events_date")
    _drop_index_if_exists(
        inspector,
        "workflow_step_instance_documents",
        "ix_workflow_step_instance_documents_step_instance_id",
    )
    _drop_index_if_exists(
        inspector,
        "workflow_step_instances",
        "ix_workflow_step_instances_task_id",
    )
    _drop_index_if_exists(
        inspector,
        "workflow_step_instances",
        "ix_workflow_step_instances_instance_id",
    )
    _drop_index_if_exists(inspector, "worklogs", "ix_worklogs_date")
    _drop_index_if_exists(inspector, "worklogs", "ix_worklogs_task_id")
    _drop_index_if_exists(inspector, "worklogs", "ix_worklogs_category")
    _drop_index_if_exists(inspector, "tasks", "ix_tasks_is_report")
    _drop_index_if_exists(inspector, "tasks", "ix_tasks_is_notice")
    _drop_index_if_exists(inspector, "tasks", "ix_tasks_workflow_instance_id")
    _drop_index_if_exists(inspector, "tasks", "ix_tasks_fund_id")
    _drop_index_if_exists(inspector, "tasks", "ix_tasks_category")
    _drop_index_if_exists(inspector, "tasks", "ix_tasks_deadline")
    _drop_index_if_exists(inspector, "tasks", "ix_tasks_status")
