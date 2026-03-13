"""System API routes - database config, init."""

import os
import uuid

from fastapi import APIRouter, HTTPException

from agentarena.core.config import get_settings
from agentarena.core.init_db import run_init
from agentarena.schemas.report_schema import DatabaseConfigSchema

router = APIRouter(prefix="/system", tags=["system"])


@router.post("/database/config")
async def save_database_config(body: DatabaseConfigSchema):
    """
    Save database configuration.
    Updates environment for current process; persistent storage would use system_config table.
    """
    # In production, persist to system_config table
    os.environ["AGENTARENA_DB_HOST"] = body.host
    os.environ["AGENTARENA_DB_PORT"] = str(body.port)
    os.environ["AGENTARENA_DB_USER"] = body.username
    os.environ["AGENTARENA_DB_PASSWORD"] = body.password
    os.environ["AGENTARENA_DB_NAME"] = body.database
    return {"status": "ok", "message": "Configuration saved"}


@router.get("/database/config")
async def get_database_config():
    """Get current database configuration (masks password)."""
    settings = get_settings()
    return {
        "host": settings.db_host,
        "port": settings.db_port,
        "database": settings.db_name,
        "username": settings.db_user,
        "password": "****" if settings.db_password else "",
    }


@router.post("/database/init")
async def init_database():
    """
    One-click database initialization.
    Creates database, tables, indexes, default configs.
    """
    try:
        result = run_init()
        return result
    except Exception as e:
        raise HTTPException(500, f"Database initialization failed: {str(e)}")
