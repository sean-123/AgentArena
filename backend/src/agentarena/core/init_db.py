"""One-click database initialization."""

import uuid
from contextlib import contextmanager
from typing import Generator

import pymysql
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from agentarena.core.config import get_settings
from agentarena.models.base import Base
from agentarena.models.task import Task, TaskRun
from agentarena.models.dataset import Dataset, DatasetVersion, Testcase
from agentarena.models.agent import Agent, AgentVersion
from agentarena.models.evaluation import Evaluation, Score
from agentarena.models.leaderboard import Leaderboard, ArenaMatch
from agentarena.models.system_config import SystemConfig


def _get_base_engine() -> Engine:
    """Create sync engine without database (for creating DB)."""
    settings = get_settings()
    base_url = (
        f"mysql+pymysql://{settings.db_user}:{settings.db_password}"
        f"@{settings.db_host}:{settings.db_port}"
    )
    return create_engine(base_url, echo=False)


def create_database_if_not_exists() -> None:
    """Create database if it doesn't exist."""
    settings = get_settings()
    engine = _get_base_engine()
    with engine.connect() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{settings.db_name}`"))
        conn.commit()


def init_tables(engine: Engine) -> None:
    """Create all tables."""
    # Import all models so they're registered
    _ = (
        Task,
        TaskRun,
        Dataset,
        DatasetVersion,
        Testcase,
        Agent,
        AgentVersion,
        Evaluation,
        Score,
        Leaderboard,
        ArenaMatch,
        SystemConfig,
    )
    Base.metadata.create_all(bind=engine)


@contextmanager
def get_init_engine() -> Generator[Engine, None, None]:
    """Engine connected to the target database."""
    settings = get_settings()
    create_database_if_not_exists()
    engine = create_engine(settings.database_url_sync)
    try:
        yield engine
    finally:
        engine.dispose()


def run_init() -> dict:
    """
    One-click database initialization.
    Creates database, tables, indexes, and default configs.
    """
    with get_init_engine() as engine:
        init_tables(engine)
        # Migration: add task_run_id to leaderboard if missing
        settings = get_settings()
        with engine.connect() as conn:
            try:
                r = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = 'leaderboard' AND COLUMN_NAME = 'task_run_id'"
                ), {"db": settings.db_name})
                if (r.scalar() or 0) == 0:
                    conn.execute(text("ALTER TABLE leaderboard ADD COLUMN task_run_id VARCHAR(50) NULL"))
                    conn.commit()
            except Exception:
                pass
        # Insert default config if empty
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT COUNT(*) FROM system_config WHERE `key` = 'db_initialized'")
            )
            count = result.scalar() or 0
            if count == 0:
                uid = f"config_{uuid.uuid4().hex[:12]}"
                conn.execute(
                    text(
                        "INSERT INTO system_config (id, `key`, value, created_at, updated_at) "
                        "VALUES (:id, 'db_initialized', 'true', NOW(), NOW())"
                    ),
                    {"id": uid},
                )
                conn.commit()
    return {"status": "ok", "message": "Database initialized successfully"}
