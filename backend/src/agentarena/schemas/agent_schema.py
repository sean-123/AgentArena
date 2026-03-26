"""Agent schemas."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class LangfuseConfigSchema(BaseModel):
    """Agent 级 Langfuse 配置（config_json.langfuse）。"""

    host: str  # Langfuse API 地址，如 https://cloud.langfuse.com
    public_key: str
    secret_key: str
    environment: Optional[str] = None
    prompt_ids: Optional[list[str]] = None  # 指定关联的 prompt ID，不指定则拉取全部


class AgentVersionCreate(BaseModel):
    """Create agent version request.

    config_json 支持 HTTP 配置（base_url, endpoint, auth_token 等）及可选的 langfuse 配置：
    langfuse: { host, public_key, secret_key, environment?, prompt_ids? }
    配置后，总结报告将拉取 Langfuse 中的 prompt 并给出针对性优化建议。
    """

    version: Optional[str] = "v1"
    config_json: Optional[dict[str, Any]] = None
    # config_json 可含: base_url, endpoint, auth_token, persona, langfuse(host, public_key, secret_key, prompt_ids)


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
