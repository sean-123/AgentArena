"""Leaderboard and Arena models."""

from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship

from agentarena.models.base import Base, TimestampMixin


class Leaderboard(Base, TimestampMixin):
    """Leaderboard entry (per task_run + agent). Each run has its own leaderboard rows."""

    __tablename__ = "leaderboard"

    id: Column[str] = Column(String(50), primary_key=True)
    task_id: Column[str] = Column(String(50), ForeignKey("tasks.id"), nullable=True)
    task_run_id: Column[str] = Column(String(50), ForeignKey("task_runs.id"), nullable=True)
    agent_name: Column[str] = Column(String(255), nullable=False)
    agent_version_id: Column[str] = Column(
        String(50), ForeignKey("agent_versions.id"), nullable=True
    )
    # 通用大模型对比行：有值表示该 leaderboard 行对应 doubao/qwen/deepseek；Agent 行为 NULL
    comparison_model_type: Column[str] = Column(String(50), nullable=True)
    avg_score: Column[float] = Column(Float, nullable=True)
    elo: Column[float] = Column(Float, default=1500.0)
    evaluation_count: int = Column(Integer, default=0)


class ArenaMatch(Base, TimestampMixin):
    """Pairwise arena match result."""

    __tablename__ = "arena_matches"

    id: Column[str] = Column(String(50), primary_key=True)
    task_id: Column[str] = Column(String(50), ForeignKey("tasks.id"), nullable=True)
    testcase_id: Column[str] = Column(String(50), ForeignKey("testcases.id"), nullable=False)
    winner_agent_id: Column[str] = Column(String(50), ForeignKey("agent_versions.id"), nullable=True)
    loser_agent_id: Column[str] = Column(String(50), ForeignKey("agent_versions.id"), nullable=True)
