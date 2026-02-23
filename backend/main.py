from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import engine, Base, SessionLocal
from models import *  # noqa: F401,F403 - import all models so tables are created
from seed.seed_accounts import seed_accounts
from scripts.seed_data import seed_all
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
    regular_reports,
    accounting,
    vote_records,
    documents,
    lp_transfers,
    gp_entities,
    lp_address_books,
    admin,
    attachments,
    periodic_schedules,
)

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
            ("checklists", "investment_id", "INTEGER"),
            ("tasks", "category", "TEXT"),
            ("tasks", "fund_id", "INTEGER"),
            ("tasks", "investment_id", "INTEGER"),
            ("tasks", "gp_entity_id", "INTEGER"),
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
        ]:
            if has_table(table) and not has_column(table, column):
                conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")

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
                    email TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    password_hash TEXT,
                    role TEXT NOT NULL DEFAULT 'viewer',
                    department TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    last_login_at DATETIME,
                    created_at DATETIME
                )
                """
            )
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_users_email ON users(email)")

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
        finally:
            db.close()
    yield


app = FastAPI(title="VC ERP API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks.router)
app.include_router(task_categories.router)
app.include_router(task_completion.router)
app.include_router(task_bulk.router)
app.include_router(workflows.router)
app.include_router(worklog_lessons.router)
app.include_router(worklogs.router)
app.include_router(dashboard.router)
app.include_router(funds.router)
app.include_router(investments.router)
app.include_router(investment_reviews.router)
app.include_router(checklists.router)
app.include_router(calendar_events.router)
app.include_router(document_status.router)
app.include_router(search.router)
app.include_router(transactions.router)
app.include_router(valuations.router)
app.include_router(capital_calls.router)
app.include_router(distributions.router)
app.include_router(assemblies.router)
app.include_router(exits.router)
app.include_router(fees.router)
app.include_router(users.router)
app.include_router(performance.router)
app.include_router(biz_reports.router)
app.include_router(regular_reports.router)
app.include_router(accounting.router)
app.include_router(vote_records.router)
app.include_router(documents.router)
app.include_router(lp_transfers.router)
app.include_router(gp_entities.router)
app.include_router(lp_address_books.router)
app.include_router(admin.router)
app.include_router(attachments.router)
app.include_router(periodic_schedules.router)


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
