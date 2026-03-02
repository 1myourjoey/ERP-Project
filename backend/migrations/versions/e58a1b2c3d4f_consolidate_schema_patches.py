"""Consolidate schema compatibility patches previously executed at startup.

Revision ID: e58a1b2c3d4f
Revises: 8c1d2e3f4a5b, d7f33a1c4b2e
Create Date: 2026-03-01
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "e58a1b2c3d4f"
down_revision = ("8c1d2e3f4a5b", "d7f33a1c4b2e")
branch_labels = None
depends_on = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(col.get("name") == column_name for col in inspector.get_columns(table_name))


def _ensure_column(bind, inspector: sa.Inspector, table_name: str, column_name: str, sql_type: str) -> None:
    if not _has_table(inspector, table_name) or _has_column(inspector, table_name, column_name):
        return
    bind.exec_driver_sql(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {sql_type}")


def _ensure_table_audit_logs(bind, inspector: sa.Inspector) -> None:
    if _has_table(inspector, "audit_logs"):
        return
    bind.exec_driver_sql(
        """
        CREATE TABLE audit_logs (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id INTEGER,
            detail TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME
        )
        """
    )
    bind.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs(user_id)")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    _ensure_table_audit_logs(bind, inspector)

    _ensure_column(bind, inspector, "workflow_warnings", "category", "VARCHAR DEFAULT 'warning'")

    for table_name, column_name, sql_type in [
        ("workflow_instances", "investment_id", "INTEGER"),
        ("workflow_instances", "company_id", "INTEGER"),
        ("workflow_instances", "fund_id", "INTEGER"),
        ("workflow_instances", "gp_entity_id", "INTEGER"),
        ("workflow_instances", "created_by", "INTEGER"),
        ("investment_documents", "due_date", "DATE"),
        ("document_templates", "builder_name", "VARCHAR"),
        ("document_templates", "custom_data", "TEXT DEFAULT '{}'"),
        ("workflow_step_documents", "attachment_ids", "TEXT DEFAULT '[]'"),
        ("workflow_step_instance_documents", "attachment_ids", "TEXT DEFAULT '[]'"),
        ("periodic_schedules", "workflow_template_id", "INTEGER"),
        ("periodic_schedules", "fund_type_filter", "TEXT"),
        ("periodic_schedules", "reminder_offsets", "TEXT DEFAULT '[]'"),
        ("periodic_schedules", "is_active", "INTEGER DEFAULT 1"),
        ("periodic_schedules", "created_at", "DATETIME"),
        ("periodic_schedules", "updated_at", "DATETIME"),
        ("periodic_schedules", "steps_json", "TEXT DEFAULT '[]'"),
        ("periodic_schedules", "description", "TEXT"),
        ("funds", "maturity_date", "DATE"),
        ("funds", "dissolution_date", "DATE"),
        ("funds", "mgmt_fee_rate", "REAL"),
        ("funds", "performance_fee_rate", "REAL"),
        ("funds", "hurdle_rate", "REAL"),
        ("funds", "account_number", "TEXT"),
        ("funds", "fund_manager", "TEXT"),
        ("funds", "investment_period_end", "DATE"),
        ("funds", "gp_commitment", "REAL"),
        ("funds", "contribution_type", "TEXT"),
        ("portfolio_companies", "corp_number", "TEXT"),
        ("portfolio_companies", "founded_date", "DATE"),
        ("portfolio_companies", "analyst", "TEXT"),
        ("portfolio_companies", "contact_name", "TEXT"),
        ("portfolio_companies", "contact_email", "TEXT"),
        ("portfolio_companies", "contact_phone", "TEXT"),
        ("portfolio_companies", "memo", "TEXT"),
        ("investments", "round", "TEXT"),
        ("investments", "valuation_pre", "REAL"),
        ("investments", "valuation_post", "REAL"),
        ("investments", "ownership_pct", "REAL"),
        ("investments", "board_seat", "TEXT"),
        ("transactions", "transaction_subtype", "TEXT"),
        ("transactions", "counterparty", "TEXT"),
        ("transactions", "conversion_detail", "TEXT"),
        ("transactions", "settlement_date", "DATE"),
        ("exit_committees", "performance_fee", "REAL"),
        ("exit_committees", "agenda_summary", "TEXT"),
        ("exit_committees", "resolution", "TEXT"),
        ("exit_committees", "attendees", "TEXT"),
        ("exit_trades", "settlement_status", "TEXT DEFAULT 'pending'"),
        ("exit_trades", "settlement_date", "DATE"),
        ("exit_trades", "settlement_amount", "REAL"),
        ("exit_trades", "related_transaction_id", "INTEGER"),
        ("biz_reports", "fund_id", "INTEGER"),
        ("biz_report_requests", "doc_financial_statement", "TEXT DEFAULT 'not_requested'"),
        ("biz_report_requests", "doc_biz_registration", "TEXT DEFAULT 'not_requested'"),
        ("biz_report_requests", "doc_shareholder_list", "TEXT DEFAULT 'not_requested'"),
        ("biz_report_requests", "doc_corp_registry", "TEXT DEFAULT 'not_requested'"),
        ("biz_report_requests", "doc_insurance_cert", "TEXT DEFAULT 'not_requested'"),
        ("biz_report_requests", "doc_credit_report", "TEXT DEFAULT 'not_requested'"),
        ("biz_report_requests", "doc_other_changes", "TEXT DEFAULT 'not_requested'"),
        ("biz_report_requests", "request_sent_date", "DATE"),
        ("biz_report_requests", "request_deadline", "DATE"),
        ("biz_report_requests", "all_docs_received_date", "DATE"),
        ("checklists", "investment_id", "INTEGER"),
        ("tasks", "category", "TEXT"),
        ("tasks", "fund_id", "INTEGER"),
        ("tasks", "investment_id", "INTEGER"),
        ("tasks", "gp_entity_id", "INTEGER"),
        ("tasks", "created_by", "INTEGER"),
        ("tasks", "obligation_id", "INTEGER"),
        ("tasks", "auto_generated", "INTEGER DEFAULT 0"),
        ("tasks", "source", "TEXT"),
        ("attachments", "uploaded_by", "INTEGER"),
        ("capital_calls", "request_percent", "REAL"),
        ("capital_calls", "linked_workflow_instance_id", "INTEGER"),
        ("capital_call_items", "memo", "TEXT"),
        ("lps", "business_number", "TEXT"),
        ("lps", "address", "TEXT"),
        ("lps", "address_book_id", "INTEGER"),
        ("lp_address_books", "business_number", "TEXT"),
        ("lp_address_books", "contact", "TEXT"),
        ("lp_address_books", "address", "TEXT"),
        ("lp_address_books", "memo", "TEXT"),
        ("lp_address_books", "gp_entity_id", "INTEGER"),
        ("lp_address_books", "is_active", "INTEGER"),
        ("lp_address_books", "created_at", "DATETIME"),
        ("lp_address_books", "updated_at", "DATETIME"),
        ("fund_notice_periods", "day_basis", "TEXT DEFAULT 'business'"),
        ("valuations", "valuation_method", "TEXT"),
        ("valuations", "instrument_type", "TEXT"),
        ("valuations", "conversion_price", "REAL"),
        ("valuations", "exercise_price", "REAL"),
        ("valuations", "liquidation_pref", "REAL"),
        ("valuations", "participation_cap", "REAL"),
        ("valuations", "fair_value_per_share", "REAL"),
        ("valuations", "total_fair_value", "REAL"),
        ("valuations", "book_value", "REAL"),
        ("valuations", "unrealized_gain_loss", "REAL"),
        ("valuations", "valuation_date", "DATE"),
        ("compliance_documents", "title", "TEXT"),
        ("compliance_documents", "document_type", "TEXT"),
        ("compliance_documents", "version", "TEXT"),
        ("compliance_documents", "effective_date", "DATETIME"),
    ]:
        _ensure_column(bind, inspector, table_name, column_name, sql_type)

    if _has_table(inspector, "document_templates") and _has_column(inspector, "document_templates", "custom_data"):
        bind.exec_driver_sql("UPDATE document_templates SET custom_data='{}' WHERE custom_data IS NULL")

    if _has_table(inspector, "workflow_step_documents") and _has_column(inspector, "workflow_step_documents", "attachment_ids"):
        bind.exec_driver_sql(
            "UPDATE workflow_step_documents SET attachment_ids='[]' WHERE attachment_ids IS NULL OR TRIM(attachment_ids)=''"
        )

    if _has_table(inspector, "workflow_step_instance_documents") and _has_column(inspector, "workflow_step_instance_documents", "attachment_ids"):
        bind.exec_driver_sql(
            "UPDATE workflow_step_instance_documents SET attachment_ids='[]' WHERE attachment_ids IS NULL OR TRIM(attachment_ids)=''"
        )

    if _has_table(inspector, "periodic_schedules"):
        if _has_column(inspector, "periodic_schedules", "reminder_offsets"):
            bind.exec_driver_sql(
                "UPDATE periodic_schedules SET reminder_offsets='[]' WHERE reminder_offsets IS NULL OR TRIM(reminder_offsets)=''"
            )
        if _has_column(inspector, "periodic_schedules", "steps_json"):
            bind.exec_driver_sql(
                "UPDATE periodic_schedules SET steps_json='[]' WHERE steps_json IS NULL OR TRIM(steps_json)=''"
            )
        if _has_column(inspector, "periodic_schedules", "created_at"):
            bind.exec_driver_sql(
                "UPDATE periodic_schedules SET created_at=CURRENT_TIMESTAMP WHERE created_at IS NULL OR TRIM(CAST(created_at AS TEXT))=''"
            )
        if _has_column(inspector, "periodic_schedules", "updated_at"):
            bind.exec_driver_sql(
                "UPDATE periodic_schedules SET updated_at=CURRENT_TIMESTAMP WHERE updated_at IS NULL OR TRIM(CAST(updated_at AS TEXT))=''"
            )

    if _has_table(inspector, "workflow_warnings") and _has_column(inspector, "workflow_warnings", "category"):
        bind.exec_driver_sql("UPDATE workflow_warnings SET category='warning' WHERE category IS NULL")

    if _has_table(inspector, "biz_report_requests"):
        for column_name in [
            "doc_financial_statement",
            "doc_biz_registration",
            "doc_shareholder_list",
            "doc_corp_registry",
            "doc_insurance_cert",
            "doc_credit_report",
            "doc_other_changes",
        ]:
            if _has_column(inspector, "biz_report_requests", column_name):
                bind.exec_driver_sql(
                    f"UPDATE biz_report_requests SET {column_name}='not_requested' WHERE {column_name} IS NULL OR TRIM({column_name})=''"
                )

    if _has_table(inspector, "fund_notice_periods") and _has_column(inspector, "fund_notice_periods", "day_basis"):
        bind.exec_driver_sql(
            "UPDATE fund_notice_periods SET day_basis='business' WHERE day_basis IS NULL OR TRIM(day_basis)=''"
        )


def downgrade() -> None:
    # Consolidation migration intentionally keeps compatibility columns/tables in place.
    pass
