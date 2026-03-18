"""AgentArena FastAPI application."""

from pathlib import Path

from dotenv import load_dotenv

# 先加载 .env（含 NACOS_SERVER_ADDR 等），再尝试 Nacos，最后 pydantic 读取 env
load_dotenv()
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
from agentarena.core.nacos_loader import load_nacos_config_if_configured

load_nacos_config_if_configured()

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agentarena.api.tasks import router as tasks_router
from agentarena.api.datasets import router as datasets_router
from agentarena.api.agents import router as agents_router
from agentarena.api.reports import router as reports_router
from agentarena.api.system import router as system_router
from agentarena.api.evaluation import router as evaluation_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown."""
    yield


app = FastAPI(
    title="AgentArena",
    description="AI Agent Benchmark Platform API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks_router, prefix="/api")
app.include_router(datasets_router, prefix="/api")
app.include_router(agents_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(system_router, prefix="/api")
app.include_router(evaluation_router, prefix="/api")


@app.get("/")
async def root():
    """Health check."""
    return {"service": "AgentArena", "status": "ok"}


@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok"}


def run():
    """CLI entry point."""
    import uvicorn
    from agentarena.core.config import get_settings
    settings = get_settings()
    uvicorn.run(
        "agentarena.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
    )
