from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

from fastapi import Depends, FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()  # backend/.env 파일에서 환경변수 로드

from database import engine, Base, SessionLocal
from dependencies.auth import get_current_user
from models import *  # noqa: F401,F403 - import all models so tables are created
from seed.seed_accounts import seed_accounts
from scripts.seed_data import seed_all
from seeds.compliance_rules import seed_default_compliance_rules
from services.scheduler import get_scheduler_service
from routers import (
    tasks,
    task_categories,
    task_completion,
    task_bulk,
    workflows,
    worklogs,
    worklog_lessons,
    dashboard,
    funds,
    investments,
    investment_reviews,
    checklists,
    calendar_events,
    document_status,
    search,
    transactions,
    valuations,
    capital_calls,
    distributions,
    assemblies,
    exits,
    fees,
    users,
    performance,
    biz_reports,
    reports,
    regular_reports,
    accounting,
    provisional_fs,
    vote_records,
    documents,
    lp_transfers,
    gp_entities,
    gp_profiles,
    lp_address_books,
    admin,
    compliance,
    vics_reports,
    internal_reviews,
    attachments,
    periodic_schedules,
    auth,
    invitations,
    document_generation,
    lp_contributions,
    template_registration,
    legal_documents,
)

os.environ.setdefault("LLM_MONTHLY_LIMIT", "500000")
scheduler_service = get_scheduler_service()

def ensure_sqlite_compat_columns():
    if engine.dialect.name != "sqlite":
        return

    def has_table(table: str) -> bool:
        row = conn.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
            (table,),
        ).fetchone()
        return row is not None

    def has_column(table: str, col: str) -> bool:
        if not has_table(table):
            return False
        cols = conn.exec_driver_sql(f"PRAGMA table_info('{table}')").fetchall()
        col_names = {row[1] for row in cols}
        return col in col_names

    with engine.begin() as conn:
        if has_table("workflow_warnings") and not has_column("workflow_warnings", "category"):
            conn.exec_driver_sql(
                "ALTER TABLE workflow_warnings ADD COLUMN category VARCHAR DEFAULT 'warning'"
            )
            conn.exec_driver_sql(
                "UPDATE workflow_warnings SET category = 'warning' WHERE category IS NULL"
            )

        if has_table("workflow_instances"):
            if not has_column("workflow_instances", "investment_id"):
                conn.exec_driver_sql("ALTER TABLE workflow_instances ADD COLUMN investment_id INTEGER")
            if not has_column("workflow_instances", "company_id"):
                conn.exec_driver_sql("ALTER TABLE workflow_instances ADD COLUMN company_id INTEGER")
            if not has_column("workflow_instances", "fund_id"):
                conn.exec_driver_sql("ALTER TABLE workflow_instances ADD COLUMN fund_id INTEGER")
            if not has_column("workflow_instances", "gp_entity_id"):
                conn.exec_driver_sql("ALTER TABLE workflow_instances ADD COLUMN gp_entity_id INTEGER")

        if has_table("investment_documents") and not has_column("investment_documents", "due_date"):
            conn.exec_driver_sql("ALTER TABLE investment_documents ADD COLUMN due_date DATE")

        if has_table("document_templates") and not has_column("document_templates", "builder_name"):
            conn.exec_driver_sql("ALTER TABLE document_templates ADD COLUMN builder_name VARCHAR")

        if has_table("document_templates") and not has_column("document_templates", "custom_data"):
            conn.exec_driver_sql("ALTER TABLE document_templates ADD COLUMN custom_data TEXT DEFAULT '{}'")
            conn.exec_driver_sql("UPDATE document_templates SET custom_data = '{}' WHERE custom_data IS NULL")

        if has_table("workflow_step_documents") and not has_column("workflow_step_documents", "attachment_ids"):
            conn.exec_driver_sql("ALTER TABLE workflow_step_documents ADD COLUMN attachment_ids TEXT DEFAULT '[]'")
            conn.exec_driver_sql(
                "UPDATE workflow_step_documents SET attachment_ids = '[]' "
                "WHERE attachment_ids IS NULL OR TRIM(attachment_ids) = ''"
            )

        if has_table("workflow_step_instance_documents") and not has_column("workflow_step_instance_documents", "attachment_ids"):
            conn.exec_driver_sql("ALTER TABLE workflow_step_instance_documents ADD COLUMN attachment_ids TEXT DEFAULT '[]'")
            conn.exec_driver_sql(
                "UPDATE workflow_step_instance_documents SET attachment_ids = '[]' "
                "WHERE attachment_ids IS NULL OR TRIM(attachment_ids) = ''"
            )

        # Phase 32 compatibility: older local DBs may already have periodic_schedules
        # without the full schema (e.g., missing steps_json/description).
        if has_table("periodic_schedules"):
            if not has_column("periodic_schedules", "workflow_template_id"):
                conn.exec_driver_sql("ALTER TABLE periodic_schedules ADD COLUMN workflow_template_id INTEGER")
            if not has_column("periodic_schedules", "fund_type_filter"):
                conn.exec_driver_sql("ALTER TABLE periodic_schedules ADD COLUMN fund_type_filter TEXT")
            if not has_column("periodic_schedules", "reminder_offsets"):
                conn.exec_driver_sql("ALTER TABLE periodic_schedules ADD COLUMN reminder_offsets TEXT DEFAULT '[]'")
            if not has_column("periodic_schedules", "is_active"):
                conn.exec_driver_sql("ALTER TABLE periodic_schedules ADD COLUMN is_active INTEGER DEFAULT 1")
            if not has_column("periodic_schedules", "created_at"):
                conn.exec_driver_sql("ALTER TABLE periodic_schedules ADD COLUMN created_at DATETIME")
            if not has_column("periodic_schedules", "updated_at"):
                conn.exec_driver_sql("ALTER TABLE periodic_schedules ADD COLUMN updated_at DATETIME")
            if not has_column("periodic_schedules", "steps_json"):
                conn.exec_driver_sql("ALTER TABLE periodic_schedules ADD COLUMN steps_json TEXT DEFAULT '[]'")
            if not has_column("periodic_schedules", "description"):
                conn.exec_driver_sql("ALTER TABLE periodic_schedules ADD COLUMN description TEXT")
            if has_column("periodic_schedules", "reminder_offsets"):
                conn.exec_driver_sql(
                    "UPDATE periodic_schedules SET reminder_offsets = '[]' "
                    "WHERE reminder_offsets IS NULL OR TRIM(reminder_offsets) = ''"
                )
            if has_column("periodic_schedules", "created_at"):
                conn.exec_driver_sql(
                    "UPDATE periodic_schedules SET created_at = CURRENT_TIMESTAMP "
                    "WHERE created_at IS NULL OR TRIM(CAST(created_at AS TEXT)) = ''"
                )
            if has_column("periodic_schedules", "updated_at"):
                conn.exec_driver_sql(
                    "UPDATE periodic_schedules SET updated_at = CURRENT_TIMESTAMP "
                    "WHERE updated_at IS NULL OR TRIM(CAST(updated_at AS TEXT)) = ''"
                )
            if has_column("periodic_schedules", "steps_json"):
                conn.exec_driver_sql(
                    "UPDATE periodic_schedules SET steps_json = '[]' "
                    "WHERE steps_json IS NULL OR TRIM(steps_json) = ''"
                )

        for table, column, sql_type in [
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
            ("workflow_instances", "created_by", "INTEGER"),
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
            ("exit_committees", "agenda_summary", "TEXT"),
            ("exit_committees", "resolution", "TEXT"),
            ("exit_committees", "attendees", "TEXT"),
            ("exit_trades", "settlement_status", "TEXT DEFAULT 'pending'"),
            ("exit_trades", "settlement_date", "DATE"),
            ("exit_trades", "settlement_amount", "REAL"),
            ("exit_trades", "related_transaction_id", "INTEGER"),
            # Phase 49+ compatibility: compliance documents/rules/checks
            ("compliance_documents", "title", "TEXT"),
            ("compliance_documents", "document_type", "TEXT"),
            ("compliance_documents", "version", "TEXT"),
            ("compliance_documents", "effective_date", "DATETIME"),
            ("compliance_documents", "content_summary", "TEXT"),
            ("compliance_documents", "file_path", "TEXT"),
            ("compliance_documents", "is_active", "INTEGER DEFAULT 1"),
            ("compliance_documents", "created_at", "DATETIME"),
            ("compliance_documents", "scope", "TEXT DEFAULT 'global'"),
            ("compliance_documents", "fund_id", "INTEGER"),
            ("compliance_documents", "fund_type_filter", "TEXT"),
            ("fund_compliance_rules", "fund_id", "INTEGER"),
            ("fund_compliance_rules", "document_id", "INTEGER"),
            ("fund_compliance_rules", "rule_name", "TEXT"),
            ("fund_compliance_rules", "level", "TEXT"),
            ("fund_compliance_rules", "category", "TEXT"),
            ("fund_compliance_rules", "description", "TEXT"),
            ("fund_compliance_rules", "condition", "TEXT"),
            ("fund_compliance_rules", "severity", "TEXT DEFAULT 'warning'"),
            ("fund_compliance_rules", "auto_task", "INTEGER DEFAULT 0"),
            ("fund_compliance_rules", "is_active", "INTEGER DEFAULT 1"),
            ("fund_compliance_rules", "created_at", "DATETIME"),
            ("compliance_checks", "actual_value", "TEXT"),
            ("compliance_checks", "threshold_value", "TEXT"),
            ("compliance_checks", "detail", "TEXT"),
            ("compliance_checks", "trigger_type", "TEXT"),
            ("compliance_checks", "trigger_source", "TEXT"),
            ("compliance_checks", "trigger_source_id", "INTEGER"),
            ("compliance_checks", "remediation_task_id", "INTEGER"),
            ("compliance_checks", "resolved_at", "DATETIME"),
            ("llm_usages", "service", "TEXT"),
            ("llm_usages", "model", "TEXT"),
            ("llm_usages", "prompt_tokens", "INTEGER DEFAULT 0"),
            ("llm_usages", "completion_tokens", "INTEGER DEFAULT 0"),
            ("llm_usages", "total_tokens", "INTEGER DEFAULT 0"),
            ("llm_usages", "estimated_cost_usd", "REAL DEFAULT 0"),
            ("llm_usages", "request_summary", "TEXT"),
            ("llm_usages", "user_id", "INTEGER"),
            ("llm_usages", "created_at", "DATETIME"),
        ]:
            if has_table(table) and not has_column(table, column):
                conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")

        if has_table("compliance_documents"):
            if has_column("compliance_documents", "title"):
                conn.exec_driver_sql(
                    "UPDATE compliance_documents SET title = 'Untitled Compliance Document' "
                    "WHERE title IS NULL OR TRIM(title) = ''"
                )
            if has_column("compliance_documents", "document_type"):
                conn.exec_driver_sql(
                    "UPDATE compliance_documents SET document_type = 'laws' "
                    "WHERE document_type IS NULL OR TRIM(document_type) = ''"
                )
                conn.exec_driver_sql(
                    "UPDATE compliance_documents SET document_type = 'laws' "
                    "WHERE LOWER(TRIM(document_type)) = 'law'"
                )
            if has_column("compliance_documents", "is_active"):
                conn.exec_driver_sql(
                    "UPDATE compliance_documents SET is_active = 1 "
                    "WHERE is_active IS NULL"
                )
            if has_column("compliance_documents", "scope"):
                conn.exec_driver_sql(
                    """
                    UPDATE compliance_documents
                    SET scope = CASE
                        WHEN document_type IN ('laws', 'regulations') THEN 'global'
                        WHEN document_type = 'guidelines' THEN 'fund_type'
                        WHEN document_type IN ('agreements', 'internal') THEN 'fund'
                        ELSE 'global'
                    END
                    WHERE scope IS NULL OR TRIM(scope) = ''
                    """
                )

            # Legacy compatibility: some local DBs have compliance_documents with
            # mandatory legacy columns (layer/name/scope/status) that break current inserts.
            # Rebuild table into current schema while preserving existing rows.
            doc_cols = conn.exec_driver_sql("PRAGMA table_info('compliance_documents')").fetchall()
            doc_col_info = {row[1]: {"notnull": int(row[3]), "default": row[4]} for row in doc_cols}
            legacy_required = {"layer", "name", "scope", "status"}
            has_legacy_required = legacy_required.issubset(set(doc_col_info.keys()))
            legacy_without_default = any(
                doc_col_info.get(col, {}).get("notnull") == 1
                and doc_col_info.get(col, {}).get("default") is None
                for col in legacy_required
            )
            if has_legacy_required and legacy_without_default:
                conn.exec_driver_sql("PRAGMA foreign_keys = OFF")
                conn.exec_driver_sql("DROP TABLE IF EXISTS compliance_documents__new")
                conn.exec_driver_sql(
                    """
                    CREATE TABLE compliance_documents__new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        document_type TEXT NOT NULL,
                        scope TEXT NOT NULL DEFAULT 'global',
                        fund_id INTEGER,
                        fund_type_filter TEXT,
                        version TEXT,
                        effective_date DATETIME,
                        content_summary TEXT,
                        file_path TEXT,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(fund_id) REFERENCES funds(id)
                    )
                    """
                )
                conn.exec_driver_sql(
                    """
                    INSERT INTO compliance_documents__new
                    (
                        id,
                        title,
                        document_type,
                        scope,
                        fund_id,
                        fund_type_filter,
                        version,
                        effective_date,
                        content_summary,
                        file_path,
                        is_active,
                        created_at
                    )
                    SELECT
                        id,
                        COALESCE(NULLIF(TRIM(title), ''), NULLIF(TRIM(name), ''), 'Untitled Compliance Document') AS title,
                        COALESCE(NULLIF(TRIM(document_type), ''), NULLIF(TRIM(layer), ''), 'laws') AS document_type,
                        CASE
                            WHEN COALESCE(NULLIF(TRIM(scope), ''), '') <> '' THEN TRIM(scope)
                            WHEN COALESCE(NULLIF(TRIM(document_type), ''), NULLIF(TRIM(layer), '')) IN ('laws', 'regulations') THEN 'global'
                            WHEN COALESCE(NULLIF(TRIM(document_type), ''), NULLIF(TRIM(layer), '')) = 'guidelines' THEN 'fund_type'
                            WHEN COALESCE(NULLIF(TRIM(document_type), ''), NULLIF(TRIM(layer), '')) IN ('agreements', 'internal') THEN 'fund'
                            ELSE 'global'
                        END AS scope,
                        NULL AS fund_id,
                        NULL AS fund_type_filter,
                        CASE WHEN version IS NULL THEN NULL ELSE CAST(version AS TEXT) END AS version,
                        effective_date,
                        COALESCE(content_summary, description) AS content_summary,
                        file_path,
                        CASE WHEN is_active IS NULL THEN 1 ELSE is_active END AS is_active,
                        COALESCE(created_at, CURRENT_TIMESTAMP) AS created_at
                    FROM compliance_documents
                    """
                )
                conn.exec_driver_sql("DROP TABLE compliance_documents")
                conn.exec_driver_sql("ALTER TABLE compliance_documents__new RENAME TO compliance_documents")
                conn.exec_driver_sql("PRAGMA foreign_keys = ON")

        if has_table("fund_compliance_rules"):
            if has_column("fund_compliance_rules", "rule_name"):
                conn.exec_driver_sql(
                    "UPDATE fund_compliance_rules SET rule_name = IFNULL(rule_code, 'Unnamed Rule') "
                    "WHERE rule_name IS NULL OR TRIM(rule_name) = ''"
                )
            if has_column("fund_compliance_rules", "level"):
                conn.exec_driver_sql(
                    "UPDATE fund_compliance_rules SET level = 'L1' "
                    "WHERE level IS NULL OR TRIM(level) = ''"
                )
            if has_column("fund_compliance_rules", "category"):
                conn.exec_driver_sql(
                    "UPDATE fund_compliance_rules SET category = 'general' "
                    "WHERE category IS NULL OR TRIM(category) = ''"
                )
            if has_column("fund_compliance_rules", "condition"):
                conn.exec_driver_sql(
                    "UPDATE fund_compliance_rules SET condition = '{}' "
                    "WHERE condition IS NULL OR TRIM(CAST(condition AS TEXT)) = ''"
                )
            if has_column("fund_compliance_rules", "severity"):
                conn.exec_driver_sql(
                    "UPDATE fund_compliance_rules SET severity = 'warning' "
                    "WHERE severity IS NULL OR TRIM(severity) = ''"
                )
            if has_column("fund_compliance_rules", "auto_task"):
                conn.exec_driver_sql(
                    "UPDATE fund_compliance_rules SET auto_task = 0 "
                    "WHERE auto_task IS NULL"
                )
            if has_column("fund_compliance_rules", "is_active"):
                conn.exec_driver_sql(
                    "UPDATE fund_compliance_rules SET is_active = 1 "
                    "WHERE is_active IS NULL"
                )

            # Legacy compatibility: old rule table had mandatory fund_id/rule_value/enabled shape.
            # Rebuild to current phase schema (supports global rules with NULL fund_id).
            rule_cols = conn.exec_driver_sql("PRAGMA table_info('fund_compliance_rules')").fetchall()
            rule_col_names = {row[1] for row in rule_cols}
            has_legacy_rule_shape = {"rule_value", "enabled"}.issubset(rule_col_names)
            if has_legacy_rule_shape:
                conn.exec_driver_sql("PRAGMA foreign_keys = OFF")
                conn.exec_driver_sql("DROP TABLE IF EXISTS fund_compliance_rules__new")
                conn.exec_driver_sql(
                    """
                    CREATE TABLE fund_compliance_rules__new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        fund_id INTEGER,
                        document_id INTEGER,
                        rule_code TEXT NOT NULL UNIQUE,
                        rule_name TEXT NOT NULL,
                        level TEXT NOT NULL,
                        category TEXT NOT NULL,
                        description TEXT,
                        condition TEXT NOT NULL,
                        severity TEXT NOT NULL DEFAULT 'warning',
                        auto_task INTEGER NOT NULL DEFAULT 0,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                conn.exec_driver_sql(
                    """
                    INSERT INTO fund_compliance_rules__new
                    (id, fund_id, document_id, rule_code, rule_name, level, category, description, condition, severity, auto_task, is_active, created_at)
                    SELECT
                        id,
                        fund_id,
                        document_id,
                        rule_code,
                        COALESCE(NULLIF(TRIM(rule_name), ''), NULLIF(TRIM(rule_code), ''), 'Unnamed Rule') AS rule_name,
                        COALESCE(NULLIF(TRIM(level), ''), 'L1') AS level,
                        COALESCE(NULLIF(TRIM(category), ''), 'general') AS category,
                        description,
                        CASE
                            WHEN condition IS NULL OR TRIM(CAST(condition AS TEXT)) = ''
                            THEN json_object('type', 'legacy_threshold', 'value', rule_value, 'unit', rule_unit)
                            ELSE condition
                        END AS condition,
                        COALESCE(NULLIF(TRIM(severity), ''), 'warning') AS severity,
                        CASE WHEN auto_task IS NULL THEN 0 ELSE auto_task END AS auto_task,
                        CASE
                            WHEN is_active IS NOT NULL THEN is_active
                            WHEN enabled IS NOT NULL THEN CASE WHEN enabled THEN 1 ELSE 0 END
                            ELSE 1
                        END AS is_active,
                        COALESCE(created_at, CURRENT_TIMESTAMP) AS created_at
                    FROM fund_compliance_rules
                    """
                )
                conn.exec_driver_sql("DROP TABLE fund_compliance_rules")
                conn.exec_driver_sql("ALTER TABLE fund_compliance_rules__new RENAME TO fund_compliance_rules")
                conn.exec_driver_sql("PRAGMA foreign_keys = ON")

        if has_table("compliance_checks"):
            # Legacy compatibility: old check table lacked rule_id/checked_at/result columns.
            # Rebuild as current schema and reset legacy logs that cannot be mapped safely.
            check_cols = conn.exec_driver_sql("PRAGMA table_info('compliance_checks')").fetchall()
            check_col_names = {row[1] for row in check_cols}
            missing_core_check_cols = any(
                col not in check_col_names for col in ("rule_id", "checked_at", "result")
            )
            has_legacy_check_cols = {"trigger_event", "check_type", "status"}.issubset(check_col_names)
            if missing_core_check_cols or has_legacy_check_cols:
                conn.exec_driver_sql("PRAGMA foreign_keys = OFF")
                conn.exec_driver_sql("DROP TABLE IF EXISTS compliance_checks__new")
                conn.exec_driver_sql(
                    """
                    CREATE TABLE compliance_checks__new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        rule_id INTEGER NOT NULL,
                        fund_id INTEGER NOT NULL,
                        checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        result TEXT NOT NULL,
                        actual_value TEXT,
                        threshold_value TEXT,
                        detail TEXT,
                        trigger_type TEXT,
                        trigger_source TEXT,
                        trigger_source_id INTEGER,
                        remediation_task_id INTEGER,
                        resolved_at DATETIME
                    )
                    """
                )
                # No data copy: legacy check rows are structurally incompatible with rule-based logs.
                conn.exec_driver_sql("DROP TABLE compliance_checks")
                conn.exec_driver_sql("ALTER TABLE compliance_checks__new RENAME TO compliance_checks")
                conn.exec_driver_sql("PRAGMA foreign_keys = ON")

        if has_table("exit_trades") and has_column("exit_trades", "settlement_status"):
            conn.exec_driver_sql(
                "UPDATE exit_trades SET settlement_status = 'pending' "
                "WHERE settlement_status IS NULL OR TRIM(settlement_status) = ''"
            )

        if has_table("capital_calls") and not has_table("capital_call_details"):
            conn.exec_driver_sql(
                """
                CREATE TABLE capital_call_details (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    capital_call_id INTEGER NOT NULL,
                    lp_id INTEGER NOT NULL,
                    commitment_ratio REAL,
                    call_amount REAL NOT NULL DEFAULT 0,
                    paid_amount REAL NOT NULL DEFAULT 0,
                    paid_date DATE,
                    status TEXT NOT NULL DEFAULT '미납',
                    reminder_sent INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(capital_call_id) REFERENCES capital_calls(id) ON DELETE CASCADE,
                    FOREIGN KEY(lp_id) REFERENCES lps(id)
                )
                """
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_capital_call_details_capital_call_id ON capital_call_details(capital_call_id)"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_capital_call_details_lp_id ON capital_call_details(lp_id)"
            )

        if has_table("distributions") and not has_table("distribution_details"):
            conn.exec_driver_sql(
                """
                CREATE TABLE distribution_details (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    distribution_id INTEGER NOT NULL,
                    lp_id INTEGER NOT NULL,
                    distribution_amount REAL NOT NULL DEFAULT 0,
                    distribution_type TEXT NOT NULL DEFAULT '수익배분',
                    paid INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(distribution_id) REFERENCES distributions(id) ON DELETE CASCADE,
                    FOREIGN KEY(lp_id) REFERENCES lps(id)
                )
                """
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_distribution_details_distribution_id ON distribution_details(distribution_id)"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_distribution_details_lp_id ON distribution_details(lp_id)"
            )

        if not has_table("management_fees"):
            conn.exec_driver_sql(
                """
                CREATE TABLE management_fees (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fund_id INTEGER NOT NULL,
                    year INTEGER NOT NULL,
                    quarter INTEGER NOT NULL,
                    fee_basis TEXT NOT NULL DEFAULT 'commitment',
                    fee_rate REAL NOT NULL DEFAULT 0,
                    basis_amount REAL NOT NULL DEFAULT 0,
                    fee_amount REAL NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT '계산완료',
                    invoice_date DATE,
                    payment_date DATE,
                    memo TEXT,
                    created_at DATETIME,
                    FOREIGN KEY(fund_id) REFERENCES funds(id)
                )
                """
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_management_fees_fund_id ON management_fees(fund_id)"
            )

        if not has_table("fee_configs"):
            conn.exec_driver_sql(
                """
                CREATE TABLE fee_configs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fund_id INTEGER NOT NULL UNIQUE,
                    mgmt_fee_rate REAL NOT NULL DEFAULT 0.02,
                    mgmt_fee_basis TEXT NOT NULL DEFAULT 'commitment',
                    mgmt_fee_period TEXT NOT NULL DEFAULT 'operating',
                    liquidation_fee_rate REAL,
                    liquidation_fee_basis TEXT,
                    hurdle_rate REAL NOT NULL DEFAULT 0.08,
                    carry_rate REAL NOT NULL DEFAULT 0.20,
                    catch_up_rate REAL,
                    clawback INTEGER NOT NULL DEFAULT 1,
                    FOREIGN KEY(fund_id) REFERENCES funds(id)
                )
                """
            )
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_fee_configs_fund_id ON fee_configs(fund_id)")

        if not has_table("performance_fee_simulations"):
            conn.exec_driver_sql(
                """
                CREATE TABLE performance_fee_simulations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fund_id INTEGER NOT NULL,
                    simulation_date DATE NOT NULL,
                    scenario TEXT NOT NULL DEFAULT 'base',
                    total_paid_in REAL,
                    total_distributed REAL,
                    hurdle_amount REAL,
                    excess_profit REAL,
                    carry_amount REAL,
                    lp_net_return REAL,
                    status TEXT NOT NULL DEFAULT '시뮬레이션',
                    created_at DATETIME,
                    FOREIGN KEY(fund_id) REFERENCES funds(id)
                )
                """
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_performance_fee_simulations_fund_id ON performance_fee_simulations(fund_id)"
            )

        if not has_table("biz_report_templates"):
            conn.exec_driver_sql(
                """
                CREATE TABLE biz_report_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    report_type TEXT NOT NULL,
                    required_fields TEXT,
                    template_file_id INTEGER,
                    instructions TEXT,
                    created_at DATETIME
                )
                """
            )

        if has_table("biz_reports") and not has_table("biz_report_requests"):
            conn.exec_driver_sql(
                """
                CREATE TABLE biz_report_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    biz_report_id INTEGER NOT NULL,
                    investment_id INTEGER NOT NULL,
                    request_date DATE,
                    deadline DATE,
                    status TEXT NOT NULL DEFAULT '미요청',
                    revenue REAL,
                    operating_income REAL,
                    net_income REAL,
                    total_assets REAL,
                    total_equity REAL,
                    cash REAL,
                    employees INTEGER,
                    prev_revenue REAL,
                    prev_operating_income REAL,
                    prev_net_income REAL,
                    comment TEXT,
                    reviewer_comment TEXT,
                    risk_flag TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(biz_report_id) REFERENCES biz_reports(id) ON DELETE CASCADE,
                    FOREIGN KEY(investment_id) REFERENCES investments(id)
                )
                """
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_biz_report_requests_biz_report_id ON biz_report_requests(biz_report_id)"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_biz_report_requests_investment_id ON biz_report_requests(investment_id)"
            )

        if has_table("biz_report_requests") and not has_table("biz_report_anomalies"):
            conn.exec_driver_sql(
                """
                CREATE TABLE biz_report_anomalies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id INTEGER NOT NULL,
                    anomaly_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    detail TEXT,
                    acknowledged INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME,
                    FOREIGN KEY(request_id) REFERENCES biz_report_requests(id) ON DELETE CASCADE
                )
                """
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_biz_report_anomalies_request_id ON biz_report_anomalies(request_id)"
            )

        if not has_table("users"):
            conn.exec_driver_sql(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    email TEXT UNIQUE,
                    name TEXT NOT NULL,
                    password_hash TEXT,
                    role TEXT NOT NULL DEFAULT 'viewer',
                    department TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    is_pending_approval INTEGER NOT NULL DEFAULT 0,
                    last_login_at DATETIME,
                    allowed_routes TEXT,
                    google_id TEXT UNIQUE,
                    avatar_url TEXT,
                    login_fail_count INTEGER NOT NULL DEFAULT 0,
                    locked_until DATETIME,
                    password_changed_at DATETIME,
                    created_at DATETIME
                )
                """
            )
            conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users(username)")
            conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users(email)")
            conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users(google_id)")

        if has_table("users"):
            if not has_column("users", "username"):
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN username TEXT")
            if not has_column("users", "allowed_routes"):
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN allowed_routes TEXT")
            if not has_column("users", "google_id"):
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN google_id TEXT")
            if not has_column("users", "avatar_url"):
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN avatar_url TEXT")
            if not has_column("users", "login_fail_count"):
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN login_fail_count INTEGER DEFAULT 0")
            if not has_column("users", "locked_until"):
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN locked_until DATETIME")
            if not has_column("users", "password_changed_at"):
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN password_changed_at DATETIME")
            if not has_column("users", "is_pending_approval"):
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN is_pending_approval INTEGER DEFAULT 0")
            if not has_column("users", "token_invalidated_at"):
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN token_invalidated_at DATETIME")
            if not has_column("users", "password_reset_requested_at"):
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN password_reset_requested_at DATETIME")

            if has_column("users", "is_pending_approval"):
                conn.exec_driver_sql(
                    "UPDATE users SET is_pending_approval = 0 "
                    "WHERE is_pending_approval IS NULL"
                )
                conn.exec_driver_sql(
                    "UPDATE users SET is_pending_approval = 1 "
                    "WHERE is_active = 0 AND IFNULL(last_login_at, '') = '' "
                    "AND IFNULL(role, 'viewer') = 'viewer' "
                    "AND IFNULL(is_pending_approval, 0) = 0"
                )

            rows = conn.exec_driver_sql("SELECT id, email, username FROM users ORDER BY id ASC").fetchall()
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
                    conn.exec_driver_sql(
                        "UPDATE users SET username = ? WHERE id = ?",
                        (candidate, user_id),
                    )

            conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users(username)")
            conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users(google_id)")

        if not has_table("invitations"):
            conn.exec_driver_sql(
                """
                CREATE TABLE invitations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    token TEXT NOT NULL UNIQUE,
                    email TEXT,
                    name TEXT,
                    role TEXT NOT NULL DEFAULT 'viewer',
                    department TEXT,
                    allowed_routes TEXT,
                    created_by INTEGER NOT NULL,
                    used_by INTEGER,
                    used_at DATETIME,
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME
                )
                """
            )
            conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_invitations_token ON invitations(token)")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_invitations_email ON invitations(email)")

        if not has_table("audit_logs"):
            conn.exec_driver_sql(
                """
                CREATE TABLE audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs(user_id)")

        if has_table("biz_report_requests"):
            for col in [
                "doc_financial_statement",
                "doc_biz_registration",
                "doc_shareholder_list",
                "doc_corp_registry",
                "doc_insurance_cert",
                "doc_credit_report",
                "doc_other_changes",
            ]:
                if has_column("biz_report_requests", col):
                    conn.exec_driver_sql(
                        f"UPDATE biz_report_requests SET {col} = 'not_requested' "
                        f"WHERE {col} IS NULL OR TRIM({col}) = ''"
                    )

        if has_table("fund_notice_periods") and has_column("fund_notice_periods", "day_basis"):
            conn.exec_driver_sql(
                "UPDATE fund_notice_periods SET day_basis = 'business' "
                "WHERE day_basis IS NULL OR TRIM(day_basis) = ''"
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    auto_create_tables = os.getenv("AUTO_CREATE_TABLES", "true").lower() == "true"
    if auto_create_tables:
        Base.metadata.create_all(bind=engine)

    ensure_sqlite_compat_columns()

    if auto_create_tables:
        db = SessionLocal()
        try:
            seed_accounts(db)
            seed_all(db)
            seed_default_compliance_rules(db)
        finally:
            db.close()
    await startup_event()
    try:
        yield
    finally:
        await shutdown_event()


app = FastAPI(title="VC ERP API", version="0.2.0", lifespan=lifespan)


@app.on_event("startup")
async def startup_event():
    scheduler_service.start()


@app.on_event("shutdown")
async def shutdown_event():
    scheduler_service.stop()

origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


def _auth_disabled() -> bool:
    return os.environ.get("VON_AUTH_DISABLED", "").strip().lower() in {"1", "true", "yes", "y", "on"}


def include_protected_router(router):
    if _auth_disabled():
        app.include_router(router)
        return
    app.include_router(router, dependencies=[Depends(get_current_user)])


app.include_router(auth.router)
app.include_router(invitations.router)
include_protected_router(tasks.router)
include_protected_router(task_categories.router)
include_protected_router(task_completion.router)
include_protected_router(task_bulk.router)
include_protected_router(workflows.router)
include_protected_router(worklog_lessons.router)
include_protected_router(worklogs.router)
include_protected_router(dashboard.router)
include_protected_router(funds.router)
include_protected_router(investments.router)
include_protected_router(investment_reviews.router)
include_protected_router(checklists.router)
include_protected_router(calendar_events.router)
include_protected_router(document_status.router)
include_protected_router(search.router)
include_protected_router(transactions.router)
include_protected_router(valuations.router)
include_protected_router(capital_calls.router)
include_protected_router(distributions.router)
include_protected_router(assemblies.router)
include_protected_router(exits.router)
include_protected_router(fees.router)
include_protected_router(users.router)
include_protected_router(performance.router)
include_protected_router(biz_reports.router)
include_protected_router(reports.router)
include_protected_router(regular_reports.router)
include_protected_router(accounting.router)
include_protected_router(provisional_fs.router)
include_protected_router(vote_records.router)
include_protected_router(documents.router)
include_protected_router(lp_transfers.router)
include_protected_router(gp_entities.router)
include_protected_router(gp_profiles.router)
include_protected_router(lp_address_books.router)
include_protected_router(admin.router)
include_protected_router(compliance.router)
include_protected_router(vics_reports.router)
include_protected_router(internal_reviews.router)
include_protected_router(attachments.router)
include_protected_router(periodic_schedules.router)
include_protected_router(document_generation.router)
include_protected_router(lp_contributions.router)
include_protected_router(template_registration.router)
include_protected_router(legal_documents.router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": "입력값 검증 실패", "errors": exc.errors()},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}
