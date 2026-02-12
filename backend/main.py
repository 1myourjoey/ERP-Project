from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
from models import *  # noqa: F401,F403 - import all models so tables are created
from routers import tasks, workflows, worklogs, dashboard, funds

app = FastAPI(title="VC ERP API", version="0.1.0")

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


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/api/health")
def health():
    return {"status": "ok"}
