from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers.dashboard import router as dashboard_router
from routers.tasks import router as tasks_router
from routers.workflows import router as workflows_router
from routers.worklogs import router as worklogs_router


app = FastAPI(
    title="VC Backoffice ERP API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(tasks_router)
app.include_router(worklogs_router)
app.include_router(workflows_router)
app.include_router(dashboard_router)

