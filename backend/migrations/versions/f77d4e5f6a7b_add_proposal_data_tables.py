"""add proposal data tables and proposal-related columns

Revision ID: f77d4e5f6a7b
Revises: f76c3d4e5f6a
Create Date: 2026-03-09 15:20:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f77d4e5f6a7b"
down_revision: Union[str, Sequence[str], None] = "f76c3d4e5f6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(column.get("name") == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "gp_entities") and not _has_column(inspector, "gp_entities", "total_employees"):
        op.add_column("gp_entities", sa.Column("total_employees", sa.Integer(), nullable=True))
    if _has_table(inspector, "gp_entities") and not _has_column(inspector, "gp_entities", "fund_manager_count"):
        op.add_column("gp_entities", sa.Column("fund_manager_count", sa.Integer(), nullable=True))
    if _has_table(inspector, "gp_entities") and not _has_column(inspector, "gp_entities", "paid_in_capital"):
        op.add_column("gp_entities", sa.Column("paid_in_capital", sa.Float(), nullable=True))

    if _has_table(inspector, "funds") and not _has_column(inspector, "funds", "business_number"):
        op.add_column("funds", sa.Column("business_number", sa.String(), nullable=True))
    if _has_table(inspector, "funds") and not _has_column(inspector, "funds", "regulation_type"):
        op.add_column("funds", sa.Column("regulation_type", sa.String(), nullable=True))
    if _has_table(inspector, "funds") and not _has_column(inspector, "funds", "setup_type"):
        op.add_column("funds", sa.Column("setup_type", sa.String(), nullable=True))
    if _has_table(inspector, "funds") and not _has_column(inspector, "funds", "has_co_gp"):
        op.add_column("funds", sa.Column("has_co_gp", sa.Boolean(), nullable=False, server_default=sa.false()))

    if _has_table(inspector, "portfolio_companies") and not _has_column(inspector, "portfolio_companies", "industry_code"):
        op.add_column("portfolio_companies", sa.Column("industry_code", sa.String(), nullable=True))

    if _has_table(inspector, "investments") and not _has_column(inspector, "investments", "is_recovered"):
        op.add_column("investments", sa.Column("is_recovered", sa.Boolean(), nullable=False, server_default=sa.false()))
    if _has_table(inspector, "investments") and not _has_column(inspector, "investments", "impairment_amount"):
        op.add_column("investments", sa.Column("impairment_amount", sa.Float(), nullable=True))
    if _has_table(inspector, "investments") and not _has_column(inspector, "investments", "impairment_date"):
        op.add_column("investments", sa.Column("impairment_date", sa.Date(), nullable=True))

    inspector = sa.inspect(bind)

    if not _has_table(inspector, "gp_entity_histories"):
        op.create_table(
            "gp_entity_histories",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("gp_entity_id", sa.Integer(), sa.ForeignKey("gp_entities.id"), nullable=False),
            sa.Column("valid_from", sa.Date(), nullable=False),
            sa.Column("valid_to", sa.Date(), nullable=True),
            sa.Column("snapshot_json", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "fund_histories"):
        op.create_table(
            "fund_histories",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_id", sa.Integer(), sa.ForeignKey("funds.id"), nullable=False),
            sa.Column("valid_from", sa.Date(), nullable=False),
            sa.Column("valid_to", sa.Date(), nullable=True),
            sa.Column("snapshot_json", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "portfolio_company_histories"):
        op.create_table(
            "portfolio_company_histories",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("portfolio_companies.id"), nullable=False),
            sa.Column("valid_from", sa.Date(), nullable=False),
            sa.Column("valid_to", sa.Date(), nullable=True),
            sa.Column("snapshot_json", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "gp_financials"):
        op.create_table(
            "gp_financials",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("gp_entity_id", sa.Integer(), sa.ForeignKey("gp_entities.id"), nullable=False),
            sa.Column("fiscal_year_end", sa.Date(), nullable=False),
            sa.Column("total_assets", sa.Float(), nullable=True),
            sa.Column("current_assets", sa.Float(), nullable=True),
            sa.Column("total_liabilities", sa.Float(), nullable=True),
            sa.Column("current_liabilities", sa.Float(), nullable=True),
            sa.Column("total_equity", sa.Float(), nullable=True),
            sa.Column("paid_in_capital", sa.Float(), nullable=True),
            sa.Column("revenue", sa.Float(), nullable=True),
            sa.Column("operating_income", sa.Float(), nullable=True),
            sa.Column("net_income", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "gp_shareholders"):
        op.create_table(
            "gp_shareholders",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("gp_entity_id", sa.Integer(), sa.ForeignKey("gp_entities.id"), nullable=False),
            sa.Column("snapshot_date", sa.Date(), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("shares", sa.Integer(), nullable=True),
            sa.Column("acquisition_amount", sa.Float(), nullable=True),
            sa.Column("ownership_pct", sa.Float(), nullable=True),
            sa.Column("is_largest", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("relationship", sa.String(length=100), nullable=True),
            sa.Column("memo", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "fund_managers"):
        op.create_table(
            "fund_managers",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("gp_entity_id", sa.Integer(), sa.ForeignKey("gp_entities.id"), nullable=True),
            sa.Column("name", sa.String(length=50), nullable=False),
            sa.Column("birth_date", sa.Date(), nullable=True),
            sa.Column("nationality", sa.String(length=30), nullable=True),
            sa.Column("phone", sa.String(length=20), nullable=True),
            sa.Column("fax", sa.String(length=20), nullable=True),
            sa.Column("email", sa.String(length=100), nullable=True),
            sa.Column("department", sa.String(length=50), nullable=True),
            sa.Column("position", sa.String(length=50), nullable=True),
            sa.Column("join_date", sa.Date(), nullable=True),
            sa.Column("resign_date", sa.Date(), nullable=True),
            sa.Column("is_core", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("is_representative", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "fund_manager_profile_histories"):
        op.create_table(
            "fund_manager_profile_histories",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_manager_id", sa.Integer(), sa.ForeignKey("fund_managers.id"), nullable=False),
            sa.Column("valid_from", sa.Date(), nullable=False),
            sa.Column("valid_to", sa.Date(), nullable=True),
            sa.Column("snapshot_json", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "manager_careers"):
        op.create_table(
            "manager_careers",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_manager_id", sa.Integer(), sa.ForeignKey("fund_managers.id"), nullable=False),
            sa.Column("company_name", sa.String(length=100), nullable=False),
            sa.Column("company_type", sa.String(length=50), nullable=True),
            sa.Column("department", sa.String(length=50), nullable=True),
            sa.Column("position", sa.String(length=50), nullable=True),
            sa.Column("start_date", sa.Date(), nullable=True),
            sa.Column("end_date", sa.Date(), nullable=True),
            sa.Column("main_task", sa.String(length=200), nullable=True),
            sa.Column("is_investment_exp", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("employment_type", sa.String(length=20), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "manager_educations"):
        op.create_table(
            "manager_educations",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_manager_id", sa.Integer(), sa.ForeignKey("fund_managers.id"), nullable=False),
            sa.Column("school_name", sa.String(length=100), nullable=False),
            sa.Column("major", sa.String(length=100), nullable=True),
            sa.Column("degree", sa.String(length=20), nullable=True),
            sa.Column("admission_date", sa.Date(), nullable=True),
            sa.Column("graduation_date", sa.Date(), nullable=True),
            sa.Column("country", sa.String(length=30), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "manager_investments"):
        op.create_table(
            "manager_investments",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_manager_id", sa.Integer(), sa.ForeignKey("fund_managers.id"), nullable=False),
            sa.Column("investment_id", sa.Integer(), sa.ForeignKey("investments.id"), nullable=True),
            sa.Column("fund_id", sa.Integer(), sa.ForeignKey("funds.id"), nullable=True),
            sa.Column("source_company_name", sa.String(length=100), nullable=True),
            sa.Column("fund_name", sa.String(length=200), nullable=True),
            sa.Column("company_name", sa.String(length=200), nullable=True),
            sa.Column("investment_date", sa.Date(), nullable=True),
            sa.Column("instrument", sa.String(length=50), nullable=True),
            sa.Column("amount", sa.Float(), nullable=True),
            sa.Column("exit_date", sa.Date(), nullable=True),
            sa.Column("exit_amount", sa.Float(), nullable=True),
            sa.Column("role", sa.String(length=30), nullable=True),
            sa.Column("discovery_contrib", sa.Float(), nullable=True),
            sa.Column("review_contrib", sa.Float(), nullable=True),
            sa.Column("contrib_rate", sa.Float(), nullable=True),
            sa.Column("is_current_company", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "fund_manager_histories"):
        op.create_table(
            "fund_manager_histories",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_id", sa.Integer(), sa.ForeignKey("funds.id"), nullable=False),
            sa.Column("fund_manager_id", sa.Integer(), sa.ForeignKey("fund_managers.id"), nullable=False),
            sa.Column("change_date", sa.Date(), nullable=False),
            sa.Column("change_type", sa.String(length=20), nullable=False),
            sa.Column("role_before", sa.String(length=30), nullable=True),
            sa.Column("role_after", sa.String(length=30), nullable=True),
            sa.Column("memo", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "fund_subscriptions"):
        op.create_table(
            "fund_subscriptions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_id", sa.Integer(), sa.ForeignKey("funds.id"), nullable=False),
            sa.Column("subscription_type", sa.String(length=30), nullable=False),
            sa.Column("subscription_date", sa.Date(), nullable=False),
            sa.Column("result", sa.String(length=20), nullable=True),
            sa.Column("target_irr", sa.Float(), nullable=True),
            sa.Column("target_commitment", sa.Float(), nullable=True),
            sa.Column("actual_commitment", sa.Float(), nullable=True),
            sa.Column("memo", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "manager_awards"):
        op.create_table(
            "manager_awards",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fund_manager_id", sa.Integer(), sa.ForeignKey("fund_managers.id"), nullable=False),
            sa.Column("award_date", sa.Date(), nullable=True),
            sa.Column("award_name", sa.String(length=200), nullable=False),
            sa.Column("organization", sa.String(length=100), nullable=True),
            sa.Column("memo", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "proposal_versions"):
        op.create_table(
            "proposal_versions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("template_type", sa.String(length=30), nullable=False),
            sa.Column("gp_entity_id", sa.Integer(), sa.ForeignKey("gp_entities.id"), nullable=True),
            sa.Column("fund_ids_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("as_of_date", sa.Date(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
            sa.Column("render_snapshot_json", sa.Text(), nullable=True),
            sa.Column("generated_filename", sa.String(length=255), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "proposal_applications"):
        op.create_table(
            "proposal_applications",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("template_type", sa.String(length=30), nullable=False),
            sa.Column("institution_type", sa.String(length=30), nullable=True),
            sa.Column("gp_entity_id", sa.Integer(), sa.ForeignKey("gp_entities.id"), nullable=True),
            sa.Column("as_of_date", sa.Date(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
            sa.Column("submitted_at", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "proposal_application_funds"):
        op.create_table(
            "proposal_application_funds",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("application_id", sa.Integer(), sa.ForeignKey("proposal_applications.id"), nullable=False),
            sa.Column("fund_id", sa.Integer(), sa.ForeignKey("funds.id"), nullable=False),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("application_id", "fund_id", name="uq_proposal_application_funds"),
        )

    if not _has_table(inspector, "proposal_field_overrides"):
        op.create_table(
            "proposal_field_overrides",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("application_id", sa.Integer(), sa.ForeignKey("proposal_applications.id"), nullable=False),
            sa.Column("sheet_code", sa.String(length=80), nullable=False),
            sa.Column("field_key", sa.String(length=120), nullable=False),
            sa.Column("value_json", sa.Text(), nullable=False),
            sa.Column("source_note", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("application_id", "sheet_code", "field_key", name="uq_proposal_field_overrides"),
        )

    if not _has_table(inspector, "proposal_row_overrides"):
        op.create_table(
            "proposal_row_overrides",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("application_id", sa.Integer(), sa.ForeignKey("proposal_applications.id"), nullable=False),
            sa.Column("sheet_code", sa.String(length=80), nullable=False),
            sa.Column("row_key", sa.String(length=120), nullable=False),
            sa.Column("row_mode", sa.String(length=20), nullable=False, server_default="override"),
            sa.Column("row_payload_json", sa.Text(), nullable=False),
            sa.Column("source_note", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("application_id", "sheet_code", "row_key", name="uq_proposal_row_overrides"),
        )

    if not _has_table(inspector, "proposal_snapshots"):
        op.create_table(
            "proposal_snapshots",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("application_id", sa.Integer(), sa.ForeignKey("proposal_applications.id"), nullable=False),
            sa.Column("snapshot_type", sa.String(length=30), nullable=False, server_default="resolved"),
            sa.Column("payload_json", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table_name in [
        "proposal_snapshots",
        "proposal_row_overrides",
        "proposal_field_overrides",
        "proposal_application_funds",
        "proposal_applications",
        "proposal_versions",
        "manager_awards",
        "fund_subscriptions",
        "fund_manager_histories",
        "manager_investments",
        "manager_educations",
        "manager_careers",
        "fund_manager_profile_histories",
        "fund_managers",
        "gp_shareholders",
        "gp_financials",
        "portfolio_company_histories",
        "fund_histories",
        "gp_entity_histories",
    ]:
        if _has_table(inspector, table_name):
            op.drop_table(table_name)
            inspector = sa.inspect(bind)

    if _has_table(inspector, "investments") and _has_column(inspector, "investments", "impairment_date"):
        op.drop_column("investments", "impairment_date")
    if _has_table(inspector, "investments") and _has_column(inspector, "investments", "impairment_amount"):
        op.drop_column("investments", "impairment_amount")
    if _has_table(inspector, "investments") and _has_column(inspector, "investments", "is_recovered"):
        op.drop_column("investments", "is_recovered")

    if _has_table(inspector, "portfolio_companies") and _has_column(inspector, "portfolio_companies", "industry_code"):
        op.drop_column("portfolio_companies", "industry_code")

    if _has_table(inspector, "funds") and _has_column(inspector, "funds", "has_co_gp"):
        op.drop_column("funds", "has_co_gp")
    if _has_table(inspector, "funds") and _has_column(inspector, "funds", "setup_type"):
        op.drop_column("funds", "setup_type")
    if _has_table(inspector, "funds") and _has_column(inspector, "funds", "regulation_type"):
        op.drop_column("funds", "regulation_type")
    if _has_table(inspector, "funds") and _has_column(inspector, "funds", "business_number"):
        op.drop_column("funds", "business_number")

    if _has_table(inspector, "gp_entities") and _has_column(inspector, "gp_entities", "paid_in_capital"):
        op.drop_column("gp_entities", "paid_in_capital")
    if _has_table(inspector, "gp_entities") and _has_column(inspector, "gp_entities", "fund_manager_count"):
        op.drop_column("gp_entities", "fund_manager_count")
    if _has_table(inspector, "gp_entities") and _has_column(inspector, "gp_entities", "total_employees"):
        op.drop_column("gp_entities", "total_employees")
