"""Agent API routes."""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agentarena.core.database import DbSession
from agentarena.models.agent import Agent, AgentVersion
from agentarena.schemas.agent_schema import (
    AgentCreate,
    AgentResponse,
    AgentUpdate,
    AgentVersionCreate,
    AgentVersionResponse,
    AgentVersionUpdate,
)

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    db: DbSession,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """List agents."""
    result = await db.execute(
        select(Agent).order_by(Agent.created_at.desc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all())


@router.post("", response_model=AgentResponse)
async def create_agent(body: AgentCreate, db: DbSession):
    """Create agent."""
    agent = Agent(
        id=f"agent_{uuid.uuid4().hex[:12]}",
        name=body.name,
        description=body.description,
    )
    db.add(agent)
    # Create initial version with config
    config = body.config_json if body.config_json else {}
    av = AgentVersion(
        id=f"av_{uuid.uuid4().hex[:12]}",
        agent_id=agent.id,
        version="v1",
        config_json=json.dumps(config),
    )
    db.add(av)
    await db.flush()
    return agent  # TimestampMixin 使用 Python 端 default，created_at 已就绪，无需 refresh


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, db: DbSession):
    """Get agent by ID."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, body: AgentUpdate, db: DbSession):
    """Update agent."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agent not found")
    if body.name is not None:
        agent.name = body.name
    if body.description is not None:
        agent.description = body.description
    await db.flush()
    return agent


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str, db: DbSession):
    """Delete agent."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agent not found")
    await db.delete(agent)
    return {"status": "ok"}


@router.get("/{agent_id}/versions", response_model=list[AgentVersionResponse])
async def list_versions(agent_id: str, db: DbSession):
    """List agent versions."""
    result = await db.execute(
        select(AgentVersion)
        .where(AgentVersion.agent_id == agent_id)
        .order_by(AgentVersion.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/{agent_id}/versions", response_model=AgentVersionResponse)
async def create_version(agent_id: str, body: AgentVersionCreate, db: DbSession):
    """Create agent version."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Agent not found")
    av = AgentVersion(
        id=f"av_{uuid.uuid4().hex[:12]}",
        agent_id=agent_id,
        version=body.version or "v1",
        config_json=json.dumps(body.config_json) if body.config_json else None,
    )
    db.add(av)
    await db.flush()
    return av


@router.patch("/{agent_id}/versions/{version_id}", response_model=AgentVersionResponse)
async def update_version(
    agent_id: str, version_id: str, body: AgentVersionUpdate, db: DbSession
):
    """Update agent version config."""
    result = await db.execute(
        select(AgentVersion).where(
            AgentVersion.id == version_id,
            AgentVersion.agent_id == agent_id,
        )
    )
    av = result.scalar_one_or_none()
    if not av:
        raise HTTPException(404, "Version not found")
    if body.config_json is not None:
        av.config_json = json.dumps(body.config_json)
    await db.flush()
    return av
