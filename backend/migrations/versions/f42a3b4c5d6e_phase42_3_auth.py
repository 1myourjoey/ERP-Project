"""phase42_3 auth, rbac, audit fields

Revision ID: f42a3b4c5d6e
Revises: f41a1b2c3d4e
Create Date: 2026-02-24 18:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f42a3b4c5d6e"
down_revision: Union[str, Sequence[str], None] = "f41a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_names(inspector: sa.Inspector) -> set[str]:
    return set(inspector.get_table_names())


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {row["name"] for row in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {row["name"] for row in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "users" in tables:
        columns = _column_names(inspector, "users")
        with op.batch_alter_table("users", schema=None) as batch_op:
            if "username" not in columns:
                batch_op.add_column(sa.Column("username", sa.String(), nullable=True))
            if "allowed_routes" not in columns:
                batch_op.add_column(sa.Column("allowed_routes", sa.Text(), nullable=True))
            if "google_id" not in columns:
                batch_op.add_column(sa.Column("google_id", sa.String(), nullable=True))
            if "avatar_url" not in columns:
                batch_op.add_column(sa.Column("avatar_url", sa.String(), nullable=True))
            if "login_fail_count" not in columns:
                batch_op.add_column(sa.Column("login_fail_count", sa.Integer(), nullable=False, server_default="0"))
            if "locked_until" not in columns:
                batch_op.add_column(sa.Column("locked_until", sa.DateTime(), nullable=True))
            if "password_changed_at" not in columns:
                batch_op.add_column(sa.Column("password_changed_at", sa.DateTime(), nullable=True))

        rows = bind.execute(sa.text("SELECT id, email, username FROM users ORDER BY id ASC")).fetchall()
        used_usernames: set[str] = set()
        for user_id, email, username in rows:
            base = (username or "").strip().lower()
            if not base:
                email_value = (email or "").strip().lower()
                if "@" in email_value:
                    base = email_value.split("@", 1)[0]
                elif email_value:
                    base = email_value
                else:
                    base = f"user{user_id}"
            if not base:
                base = f"user{user_id}"
            candidate = base
            suffix = 1
            while candidate in used_usernames:
                suffix += 1
                candidate = f"{base}{suffix}"
            used_usernames.add(candidate)
            if candidate != (username or "").strip().lower():
                bind.execute(
                    sa.text("UPDATE users SET username = :username WHERE id = :user_id"),
                    {"username": candidate, "user_id": user_id},
                )

        bind.execute(
            sa.text(
                "UPDATE users SET login_fail_count = 0 "
                "WHERE login_fail_count IS NULL"
            )
        )

        inspector = sa.inspect(bind)
        user_columns = inspector.get_columns("users")
        email_column = next((col for col in user_columns if col["name"] == "email"), None)
        username_column = next((col for col in user_columns if col["name"] == "username"), None)
        if email_column and not bool(email_column.get("nullable", True)):
            with op.batch_alter_table("users", schema=None) as batch_op:
                batch_op.alter_column(
                    "email",
                    existing_type=sa.String(),
                    nullable=True,
                )
        if username_column and bool(username_column.get("nullable", True)):
            with op.batch_alter_table("users", schema=None) as batch_op:
                batch_op.alter_column(
                    "username",
                    existing_type=sa.String(),
                    nullable=False,
                )

        inspector = sa.inspect(bind)
        indexes = _index_names(inspector, "users")
        if "ix_users_username" not in indexes:
            op.create_index("ix_users_username", "users", ["username"], unique=True)
        if "ix_users_google_id" not in indexes:
            op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)

    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "tasks" in tables:
        task_columns = _column_names(inspector, "tasks")
        if "created_by" not in task_columns:
            with op.batch_alter_table("tasks", schema=None) as batch_op:
                batch_op.add_column(sa.Column("created_by", sa.Integer(), nullable=True))
                batch_op.create_foreign_key("fk_tasks_created_by_users", "users", ["created_by"], ["id"])

    if "attachments" in tables:
        attachment_columns = _column_names(inspector, "attachments")
        if "uploaded_by" not in attachment_columns:
            with op.batch_alter_table("attachments", schema=None) as batch_op:
                batch_op.add_column(sa.Column("uploaded_by", sa.Integer(), nullable=True))
                batch_op.create_foreign_key("fk_attachments_uploaded_by_users", "users", ["uploaded_by"], ["id"])

    if "workflow_instances" in tables:
        workflow_instance_columns = _column_names(inspector, "workflow_instances")
        if "created_by" not in workflow_instance_columns:
            with op.batch_alter_table("workflow_instances", schema=None) as batch_op:
                batch_op.add_column(sa.Column("created_by", sa.Integer(), nullable=True))
                batch_op.create_foreign_key(
                    "fk_workflow_instances_created_by_users",
                    "users",
                    ["created_by"],
                    ["id"],
                )

    if "audit_logs" not in tables:
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("target_type", sa.String(), nullable=True),
            sa.Column("target_id", sa.Integer(), nullable=True),
            sa.Column("detail", sa.Text(), nullable=True),
            sa.Column("ip_address", sa.String(), nullable=True),
            sa.Column("user_agent", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        )
        op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "audit_logs" in tables:
        indexes = _index_names(inspector, "audit_logs")
        if "ix_audit_logs_user_id" in indexes:
            op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
        op.drop_table("audit_logs")

    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "workflow_instances" in tables:
        columns = _column_names(inspector, "workflow_instances")
        if "created_by" in columns:
            with op.batch_alter_table("workflow_instances", schema=None) as batch_op:
                batch_op.drop_column("created_by")

    if "attachments" in tables:
        columns = _column_names(inspector, "attachments")
        if "uploaded_by" in columns:
            with op.batch_alter_table("attachments", schema=None) as batch_op:
                batch_op.drop_column("uploaded_by")

    if "tasks" in tables:
        columns = _column_names(inspector, "tasks")
        if "created_by" in columns:
            with op.batch_alter_table("tasks", schema=None) as batch_op:
                batch_op.drop_column("created_by")

    if "users" in tables:
        columns = _column_names(inspector, "users")
        with op.batch_alter_table("users", schema=None) as batch_op:
            for column_name in [
                "password_changed_at",
                "locked_until",
                "login_fail_count",
                "avatar_url",
                "google_id",
                "allowed_routes",
                "username",
            ]:
                if column_name in columns:
                    batch_op.drop_column(column_name)
