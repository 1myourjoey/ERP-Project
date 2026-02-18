"""phase20_2 lp transfer gp entity

Revision ID: 20f2a1b4c6d8
Revises: 8c1d2e3f4a5b
Create Date: 2026-02-18 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20f2a1b4c6d8"
down_revision: Union[str, Sequence[str], None] = "8c1d2e3f4a5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    lp_columns = {col["name"] for col in inspector.get_columns("lps")}
    if "business_number" not in lp_columns:
        with op.batch_alter_table("lps", schema=None) as batch_op:
            batch_op.add_column(sa.Column("business_number", sa.String(), nullable=True))
    if "address" not in lp_columns:
        with op.batch_alter_table("lps", schema=None) as batch_op:
            batch_op.add_column(sa.Column("address", sa.String(), nullable=True))

    if not inspector.has_table("gp_entities"):
        op.create_table(
            "gp_entities",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("entity_type", sa.String(), nullable=False),
            sa.Column("business_number", sa.String(), nullable=True),
            sa.Column("registration_number", sa.String(), nullable=True),
            sa.Column("representative", sa.String(), nullable=True),
            sa.Column("address", sa.String(), nullable=True),
            sa.Column("phone", sa.String(), nullable=True),
            sa.Column("email", sa.String(), nullable=True),
            sa.Column("founding_date", sa.Date(), nullable=True),
            sa.Column("license_date", sa.Date(), nullable=True),
            sa.Column("capital", sa.Float(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("is_primary", sa.Integer(), nullable=False, server_default="1"),
            sa.PrimaryKeyConstraint("id"),
        )

    task_columns = {col["name"] for col in inspector.get_columns("tasks")}
    task_fk_names = {fk.get("name") for fk in inspector.get_foreign_keys("tasks")}
    if "gp_entity_id" not in task_columns:
        with op.batch_alter_table("tasks", schema=None) as batch_op:
            batch_op.add_column(sa.Column("gp_entity_id", sa.Integer(), nullable=True))
    if "fk_tasks_gp_entity_id" not in task_fk_names:
        with op.batch_alter_table("tasks", schema=None) as batch_op:
            batch_op.create_foreign_key("fk_tasks_gp_entity_id", "gp_entities", ["gp_entity_id"], ["id"])

    wf_columns = {col["name"] for col in inspector.get_columns("workflow_instances")}
    wf_fk_names = {fk.get("name") for fk in inspector.get_foreign_keys("workflow_instances")}
    if "gp_entity_id" not in wf_columns:
        with op.batch_alter_table("workflow_instances", schema=None) as batch_op:
            batch_op.add_column(sa.Column("gp_entity_id", sa.Integer(), nullable=True))
    if "fk_workflow_instances_gp_entity_id" not in wf_fk_names:
        with op.batch_alter_table("workflow_instances", schema=None) as batch_op:
            batch_op.create_foreign_key(
                "fk_workflow_instances_gp_entity_id",
                "gp_entities",
                ["gp_entity_id"],
                ["id"],
            )

    if not inspector.has_table("lp_transfers"):
        op.create_table(
            "lp_transfers",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("fund_id", sa.Integer(), nullable=False),
            sa.Column("from_lp_id", sa.Integer(), nullable=False),
            sa.Column("to_lp_id", sa.Integer(), nullable=True),
            sa.Column("to_lp_name", sa.String(), nullable=True),
            sa.Column("to_lp_type", sa.String(), nullable=True),
            sa.Column("to_lp_business_number", sa.String(), nullable=True),
            sa.Column("to_lp_address", sa.String(), nullable=True),
            sa.Column("to_lp_contact", sa.String(), nullable=True),
            sa.Column("transfer_amount", sa.Integer(), nullable=False),
            sa.Column("transfer_date", sa.Date(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("workflow_instance_id", sa.Integer(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.Date(), nullable=True),
            sa.ForeignKeyConstraint(["from_lp_id"], ["lps.id"]),
            sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
            sa.ForeignKeyConstraint(["to_lp_id"], ["lps.id"]),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("lp_transfers"):
        op.drop_table("lp_transfers")

    if inspector.has_table("workflow_instances"):
        wf_columns = {col["name"] for col in inspector.get_columns("workflow_instances")}
        wf_fk_names = {fk.get("name") for fk in inspector.get_foreign_keys("workflow_instances")}
        if "fk_workflow_instances_gp_entity_id" in wf_fk_names:
            with op.batch_alter_table("workflow_instances", schema=None) as batch_op:
                batch_op.drop_constraint("fk_workflow_instances_gp_entity_id", type_="foreignkey")
        if "gp_entity_id" in wf_columns:
            with op.batch_alter_table("workflow_instances", schema=None) as batch_op:
                batch_op.drop_column("gp_entity_id")

    if inspector.has_table("tasks"):
        task_columns = {col["name"] for col in inspector.get_columns("tasks")}
        task_fk_names = {fk.get("name") for fk in inspector.get_foreign_keys("tasks")}
        if "fk_tasks_gp_entity_id" in task_fk_names:
            with op.batch_alter_table("tasks", schema=None) as batch_op:
                batch_op.drop_constraint("fk_tasks_gp_entity_id", type_="foreignkey")
        if "gp_entity_id" in task_columns:
            with op.batch_alter_table("tasks", schema=None) as batch_op:
                batch_op.drop_column("gp_entity_id")

    if inspector.has_table("gp_entities"):
        op.drop_table("gp_entities")

    if inspector.has_table("lps"):
        lp_columns = {col["name"] for col in inspector.get_columns("lps")}
        if "address" in lp_columns:
            with op.batch_alter_table("lps", schema=None) as batch_op:
                batch_op.drop_column("address")
        if "business_number" in lp_columns:
            with op.batch_alter_table("lps", schema=None) as batch_op:
                batch_op.drop_column("business_number")
