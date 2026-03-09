"""add gp entity link to funds

Revision ID: f78e5f6a7b8c
Revises: f77d4e5f6a7b
Create Date: 2026-03-09 20:10:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f78e5f6a7b8c"
down_revision: Union[str, Sequence[str], None] = "f77d4e5f6a7b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(column.get("name") == column_name for column in inspector.get_columns(table_name))


def _has_fk(inspector: sa.Inspector, table_name: str, fk_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return fk_name in {fk.get("name") for fk in inspector.get_foreign_keys(table_name)}


def _has_index(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return index_name in {index.get("name") for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "funds") or not _has_table(inspector, "gp_entities"):
        return

    if not _has_column(inspector, "funds", "gp_entity_id"):
        with op.batch_alter_table("funds", schema=None) as batch_op:
            batch_op.add_column(sa.Column("gp_entity_id", sa.Integer(), nullable=True))

    inspector = sa.inspect(bind)
    if not _has_fk(inspector, "funds", "fk_funds_gp_entity_id"):
        with op.batch_alter_table("funds", schema=None) as batch_op:
            batch_op.create_foreign_key("fk_funds_gp_entity_id", "gp_entities", ["gp_entity_id"], ["id"])

    inspector = sa.inspect(bind)
    if not _has_index(inspector, "funds", "ix_funds_gp_entity_id"):
        with op.batch_alter_table("funds", schema=None) as batch_op:
            batch_op.create_index("ix_funds_gp_entity_id", ["gp_entity_id"], unique=False)

    rows = bind.execute(
        sa.text(
            """
            SELECT id, gp
            FROM funds
            WHERE gp_entity_id IS NULL
              AND gp IS NOT NULL
            """
        )
    ).mappings().all()

    for row in rows:
        gp_name = str(row.get("gp") or "").strip()
        if not gp_name:
            continue
        entity = bind.execute(
            sa.text(
                """
                SELECT id, name
                FROM gp_entities
                WHERE lower(name) = lower(:gp_name)
                ORDER BY is_primary DESC, id ASC
                LIMIT 1
                """
            ),
            {"gp_name": gp_name},
        ).mappings().first()
        if not entity:
            continue
        bind.execute(
            sa.text(
                """
                UPDATE funds
                SET gp_entity_id = :gp_entity_id,
                    gp = :gp_name
                WHERE id = :fund_id
                """
            ),
            {
                "gp_entity_id": int(entity["id"]),
                "gp_name": str(entity["name"]),
                "fund_id": int(row["id"]),
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "funds"):
        return

    if _has_index(inspector, "funds", "ix_funds_gp_entity_id"):
        with op.batch_alter_table("funds", schema=None) as batch_op:
            batch_op.drop_index("ix_funds_gp_entity_id")

    inspector = sa.inspect(bind)
    if _has_fk(inspector, "funds", "fk_funds_gp_entity_id"):
        with op.batch_alter_table("funds", schema=None) as batch_op:
            batch_op.drop_constraint("fk_funds_gp_entity_id", type_="foreignkey")

    inspector = sa.inspect(bind)
    if _has_column(inspector, "funds", "gp_entity_id"):
        with op.batch_alter_table("funds", schema=None) as batch_op:
            batch_op.drop_column("gp_entity_id")
