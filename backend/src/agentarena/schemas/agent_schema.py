"""Agent schemas."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class AgentVersionCreate(BaseModel):
    """Create agent version request."""

    version: Optional[str] = "v1"
    config_json: Optional[dict[str, Any]] = None


class AgentVersionUpdate(BaseModel):
    """Update agent version config."""

    config_json: Optional[dict[str, Any]] = None


class AgentCreate(BaseModel):
    """Create agent request."""

    name: str
    description: Optional[str] = None
    config_json: Optional[dict[str, Any]] = None  # HTTP config: base_url, endpoint, question_key, extra_payload, stream, auth_token, auth_token_env


class AgentUpdate(BaseModel):
    """Update agent request."""

    name: Optional[str] = None
    description: Optional[str] = None


class AgentResponse(BaseModel):
    """Agent response."""

    id: str
    name: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AgentVersionResponse(BaseModel):
    """Agent version response."""

    id: str
    agent_id: str
    version: str
    config_json: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
