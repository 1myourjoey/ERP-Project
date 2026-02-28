"""phase37 compliance engine

Revision ID: e37a1b2c3d4e
Revises: d7f33a1c4b2e
Create Date: 2026-02-24 09:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e37a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = "d7f33a1c4b2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("compliance_rules"):
        op.create_table(
            "compliance_rules",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("category", sa.String(), nullable=False),
            sa.Column("subcategory", sa.String(), nullable=False),
            sa.Column("rule_code", sa.String(), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("trigger_event", sa.String(), nullable=True),
            sa.Column("frequency", sa.String(), nullable=True),
            sa.Column("deadline_rule", sa.String(), nullable=True),
            sa.Column("target_system", sa.String(), nullable=True),
            sa.Column("guideline_ref", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("fund_type_filter", sa.String(), nullable=True),
        )
        op.create_index("ix_compliance_rules_rule_code", "compliance_rules", ["rule_code"], unique=True)

    if not inspector.has_table("compliance_obligations"):
        op.create_table(
            "compliance_obligations",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("rule_id", sa.Integer(), nullable=False),
            sa.Column("fund_id", sa.Integer(), nullable=False),
            sa.Column("period_type", sa.String(), nullable=True),
            sa.Column("due_date", sa.Date(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("completed_date", sa.Date(), nullable=True),
            sa.Column("completed_by", sa.String(), nullable=True),
            sa.Column("evidence_note", sa.Text(), nullable=True),
            sa.Column("investment_id", sa.Integer(), nullable=True),
            sa.Column("task_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["rule_id"], ["compliance_rules.id"]),
            sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
            sa.ForeignKeyConstraint(["investment_id"], ["investments.id"]),
            sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
            sa.UniqueConstraint(
                "rule_id",
                "fund_id",
                "period_type",
                "investment_id",
                name="uq_compliance_obligations_period",
            ),
        )
        op.create_index("ix_compliance_obligations_rule_id", "compliance_obligations", ["rule_id"], unique=False)
        op.create_index("ix_compliance_obligations_fund_id", "compliance_obligations", ["fund_id"], unique=False)
        op.create_index("ix_compliance_obligations_due_date", "compliance_obligations", ["due_date"], unique=False)
        op.create_index("ix_compliance_obligations_investment_id", "compliance_obligations", ["investment_id"], unique=False)
        op.create_index("ix_compliance_obligations_task_id", "compliance_obligations", ["task_id"], unique=False)

    if not inspector.has_table("investment_limit_checks"):
        op.create_table(
            "investment_limit_checks",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_id", sa.Integer(), nullable=False),
            sa.Column("investment_id", sa.Integer(), nullable=True),
            sa.Column("check_date", sa.DateTime(), nullable=False),
            sa.Column("rule_code", sa.String(), nullable=False),
            sa.Column("check_result", sa.String(), nullable=False),
            sa.Column("current_value", sa.Float(), nullable=True),
            sa.Column("limit_value", sa.Float(), nullable=True),
            sa.Column("detail", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["fund_id"], ["funds.id"]),
            sa.ForeignKeyConstraint(["investment_id"], ["investments.id"]),
        )
        op.create_index("ix_investment_limit_checks_fund_id", "investment_limit_checks", ["fund_id"], unique=False)
        op.create_index("ix_investment_limit_checks_investment_id", "investment_limit_checks", ["investment_id"], unique=False)

    if inspector.has_table("tasks"):
        task_columns = {col["name"] for col in inspector.get_columns("tasks")}
        with op.batch_alter_table("tasks", schema=None) as batch_op:
            if "obligation_id" not in task_columns:
                batch_op.add_column(sa.Column("obligation_id", sa.Integer(), nullable=True))
            if "auto_generated" not in task_columns:
                batch_op.add_column(sa.Column("auto_generated", sa.Boolean(), nullable=False, server_default=sa.false()))
            if "source" not in task_columns:
                batch_op.add_column(sa.Column("source", sa.String(), nullable=True))

        task_fks = {fk.get("name") for fk in inspector.get_foreign_keys("tasks")}
        if "fk_tasks_obligation_id" not in task_fks:
            with op.batch_alter_table("tasks", schema=None) as batch_op:
                batch_op.create_foreign_key(
                    "fk_tasks_obligation_id",
                    "compliance_obligations",
                    ["obligation_id"],
                    ["id"],
                )

        task_indexes = {idx.get("name") for idx in inspector.get_indexes("tasks")}
        if "ix_tasks_obligation_id" not in task_indexes:
            with op.batch_alter_table("tasks", schema=None) as batch_op:
                batch_op.create_index("ix_tasks_obligation_id", ["obligation_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("tasks"):
        task_columns = {col["name"] for col in inspector.get_columns("tasks")}
        task_fks = {fk.get("name") for fk in inspector.get_foreign_keys("tasks")}
        task_indexes = {idx.get("name") for idx in inspector.get_indexes("tasks")}
        with op.batch_alter_table("tasks", schema=None) as batch_op:
            if "ix_tasks_obligation_id" in task_indexes:
                batch_op.drop_index("ix_tasks_obligation_id")
            if "fk_tasks_obligation_id" in task_fks:
                batch_op.drop_constraint("fk_tasks_obligation_id", type_="foreignkey")
            if "source" in task_columns:
                batch_op.drop_column("source")
            if "auto_generated" in task_columns:
                batch_op.drop_column("auto_generated")
            if "obligation_id" in task_columns:
                batch_op.drop_column("obligation_id")

    if inspector.has_table("investment_limit_checks"):
        op.drop_table("investment_limit_checks")
    if inspector.has_table("compliance_obligations"):
        op.drop_table("compliance_obligations")
    if inspector.has_table("compliance_rules"):
        op.drop_table("compliance_rules")
