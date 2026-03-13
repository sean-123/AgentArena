"""Agent and AgentVersion models."""

from sqlalchemy import Column, String, Text, ForeignKey
from sqlalchemy.orm import relationship

from agentarena.models.base import Base, TimestampMixin


class Agent(Base, TimestampMixin):
    """AI Agent definition."""

    __tablename__ = "agents"

    id: Column[str] = Column(String(50), primary_key=True)
    name: Column[str] = Column(String(255), nullable=False)
    description: Column[str] = Column(Text, nullable=True)

    versions = relationship("AgentVersion", back_populates="agent")


class AgentVersion(Base, TimestampMixin):
    """Versioned agent configuration."""

    __tablename__ = "agent_versions"

    id: Column[str] = Column(String(50), primary_key=True)
    agent_id: Column[str] = Column(String(50), ForeignKey("agents.id"), nullable=False)
    version: Column[str] = Column(String(50), nullable=False, default="v1")
    config_json: Column[str] = Column(Text, nullable=True)  # base_url, endpoint, etc.

    agent = relationship("Agent", back_populates="versions")
