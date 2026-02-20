"""add lp address book table

Revision ID: f1a2b3c4d5e6
Revises: c8a1d9e2f3b4
Create Date: 2026-02-19 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f1a2b3c4d5e6"
down_revision = "c8a1d9e2f3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("lp_address_books"):
        op.create_table(
            "lp_address_books",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("type", sa.String(), nullable=False),
            sa.Column("contact", sa.String(), nullable=True),
            sa.Column("business_number", sa.String(), nullable=True),
            sa.Column("address", sa.String(), nullable=True),
            sa.Column("memo", sa.Text(), nullable=True),
            sa.Column("gp_entity_id", sa.Integer(), nullable=True),
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["gp_entity_id"], ["gp_entities.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    current_cols = {col["name"] for col in inspector.get_columns("lp_address_books")}
    if "business_number" not in current_cols:
        op.add_column("lp_address_books", sa.Column("business_number", sa.String(), nullable=True))
    if "is_active" not in current_cols:
        op.add_column("lp_address_books", sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"))
    if "created_at" not in current_cols:
        op.add_column("lp_address_books", sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    if "updated_at" not in current_cols:
        op.add_column("lp_address_books", sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))

    indexes = {idx["name"] for idx in inspector.get_indexes("lp_address_books")}
    if "ux_lp_address_books_business_number" not in indexes:
        op.create_index(
            "ux_lp_address_books_business_number",
            "lp_address_books",
            ["business_number"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("lp_address_books"):
        indexes = {idx["name"] for idx in inspector.get_indexes("lp_address_books")}
        if "ux_lp_address_books_business_number" in indexes:
            op.drop_index("ux_lp_address_books_business_number", table_name="lp_address_books")
        op.drop_table("lp_address_books")
