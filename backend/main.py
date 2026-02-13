from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import engine, Base
from models import *  # noqa: F401,F403 - import all models so tables are created
from routers import (
    tasks,
    workflows,
    worklogs,
    dashboard,
    funds,
    investments,
    checklists,
    calendar_events,
    document_status,
)

def ensure_sqlite_compat_columns():
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as conn:
        cols = conn.exec_driver_sql("PRAGMA table_info('workflow_warnings')").fetchall()
        col_names = {row[1] for row in cols}
        if "category" not in col_names:
            conn.exec_driver_sql(
                "ALTER TABLE workflow_warnings ADD COLUMN category VARCHAR DEFAULT 'warning'"
            )
            conn.exec_driver_sql(
                "UPDATE workflow_warnings SET category = 'warning' WHERE category IS NULL"
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("AUTO_CREATE_TABLES", "true").lower() == "true":
        Base.metadata.create_all(bind=engine)
        ensure_sqlite_compat_columns()
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
app.include_router(workflows.router)
app.include_router(worklogs.router)
app.include_router(dashboard.router)
app.include_router(funds.router)
app.include_router(investments.router)
app.include_router(checklists.router)
app.include_router(calendar_events.router)
app.include_router(document_status.router)


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
