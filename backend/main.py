from contextlib import asynccontextmanager

from fastapi import FastAPI
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
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
async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={"detail": "입력값 검증 실패", "errors": str(exc.errors())},
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}
