"""Report and leaderboard schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ScoreResponse(BaseModel):
    """Score response."""

    id: str
    evaluation_id: str
    correctness: Optional[float] = None
    completeness: Optional[float] = None
    clarity: Optional[float] = None
    hallucination: Optional[float] = None
    avg_score: Optional[float] = None
    pros: Optional[str] = None
    cons: Optional[str] = None
    optimization: Optional[str] = None

    model_config = {"from_attributes": True}


class EvaluationResponse(BaseModel):
    """Evaluation response."""

    id: str
    task_id: Optional[str] = None
    testcase_id: str
    agent_version_id: str
    question: str
    answer: Optional[str] = None
    latency: Optional[float] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class EvaluationWithScoreResponse(BaseModel):
    """评测详情（含对话与评分：提问、回答、优缺点、优化建议）。"""

    id: str
    task_id: Optional[str] = None
    testcase_id: str
    agent_version_id: str
    question: str
    answer: Optional[str] = None
    latency: Optional[float] = None
    created_at: Optional[datetime] = None
    correctness: Optional[float] = None
    completeness: Optional[float] = None
    clarity: Optional[float] = None
    hallucination: Optional[float] = None
    avg_score: Optional[float] = None
    pros: Optional[str] = None
    cons: Optional[str] = None
    optimization: Optional[str] = None

    model_config = {"from_attributes": True}


class LeaderboardEntry(BaseModel):
    """Leaderboard entry."""

    id: str
    task_id: Optional[str] = None
    task_run_id: Optional[str] = None
    agent_name: str
    agent_version_id: Optional[str] = None
    avg_score: Optional[float] = None
    elo: float
    evaluation_count: int

    model_config = {"from_attributes": True}


class DatabaseConfigSchema(BaseModel):
    """Database configuration."""

    host: str = "localhost"
    port: int = 3306
    database: str = "agent_arena"
    username: str = "root"
    password: str = ""
