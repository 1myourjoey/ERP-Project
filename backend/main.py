from __future__ import annotations

from contextlib import asynccontextmanager
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from config import settings
from database import Base, SessionLocal, engine
from dependencies.auth import get_current_user
from middleware.audit_log import AuditLogMiddleware
from models import *  # noqa: F401,F403 - import all models for metadata
from routers import (
    accounting,
    analytics,
    admin,
    assemblies,
    attachments,
    auth,
    biz_reports,
    calendar_events,
    capital_calls,
    checklists,
    compliance,
    dashboard,
    dashboard_summary,
    distributions,
    document_generation,
    document_status,
    documents,
    entity_graph,
    cashflow,
    excel_export,
    excel_import,
    exits,
    fees,
    funds,
    gp_entities,
    gp_profiles,
    internal_reviews,
    invitations,
    investment_reviews,
    investments,
    legal_documents,
    lp_address_books,
    lp_reports,
    lp_contributions,
    lp_transfers,
    notifications,
    performance,
    periodic_schedules,
    proposal_data,
    provisional_fs,
    regular_reports,
    reports,
    search,
    task_bulk,
    task_categories,
    task_completion,
    tasks,
    template_registration,
    transactions,
    users,
    valuations,
    vics_reports,
    vote_records,
    workflows,
    worklog_lessons,
    worklogs,
)
from seed.seed_accounts import seed_accounts
from scripts.seed_data import seed_all
from seeds.compliance_rules import seed_default_compliance_rules
from services.scheduler import get_scheduler_service

logger = logging.getLogger(__name__)
scheduler_service = get_scheduler_service()
# SQLite startup compatibility patches were migrated to Alembic revision e58a1b2c3d4f.


def run_startup_migrations() -> None:
    """Apply Alembic migrations at startup for local/dev DB consistency."""
    backend_dir = Path(__file__).resolve().parent
    alembic_ini_path = backend_dir / "alembic.ini"
    if not alembic_ini_path.exists():
        logger.warning("Alembic config not found at %s; skipping auto-migration.", alembic_ini_path)
        return

    alembic_cfg = AlembicConfig(str(alembic_ini_path))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "migrations"))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    command.upgrade(alembic_cfg, "heads")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.AUTO_RUN_MIGRATIONS:
        run_startup_migrations()

    if settings.AUTO_CREATE_TABLES:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            seed_accounts(db)
            seed_all(db)
            seed_default_compliance_rules(db)
        finally:
            db.close()

    scheduler_service.start()
    try:
        yield
    finally:
        scheduler_service.stop()


app = FastAPI(title="VC ERP API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuditLogMiddleware)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


def include_protected_router(router):
    if settings.AUTH_DISABLED:
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
include_protected_router(dashboard_summary.router)
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
include_protected_router(cashflow.router)
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
include_protected_router(lp_reports.router)
include_protected_router(excel_export.router)
include_protected_router(excel_import.router)
include_protected_router(notifications.router)
include_protected_router(admin.router)
include_protected_router(compliance.router)
include_protected_router(vics_reports.router)
include_protected_router(internal_reviews.router)
include_protected_router(attachments.router)
include_protected_router(periodic_schedules.router)
include_protected_router(proposal_data.router)
include_protected_router(document_generation.router)
include_protected_router(lp_contributions.router)
include_protected_router(template_registration.router)
include_protected_router(legal_documents.router)
include_protected_router(analytics.router)
include_protected_router(entity_graph.router)


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
