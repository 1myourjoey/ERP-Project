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
        ]:
            if has_table(table) and not has_column(table, column):
                conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")

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
