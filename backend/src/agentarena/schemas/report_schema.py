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


# === 任务总结报告 ===


class TopItem(BaseModel):
    """高频项（优点/缺点）。"""

    text: str
    count: int


class OptimizationByCategory(BaseModel):
    """按类别分类的优化建议。"""

    answer_modification: list[str] = []  # 回答应如何修改
    prompt_optimization: list[str] = []  # 提示词相关
    rag_optimization: list[str] = []  # RAG 相关
    agent_development: list[str] = []  # Agent 架构/模型/开发相关


class AgentSummary(BaseModel):
    """单 Agent 的总结。"""

    agent_name: str
    agent_version_id: str
    evaluation_count: int
    top_pros: list[TopItem] = []
    top_cons: list[TopItem] = []
    optimization: OptimizationByCategory


class TaskSummaryReportResponse(BaseModel):
    """任务总结报告（整批次汇总）。"""

    task_id: str
    task_run_id: str | None
    task_name: str
    total_evaluations: int
    by_agent: list[AgentSummary] = []
    overall_top_pros: list[TopItem] = []
    overall_top_cons: list[TopItem] = []
    overall_optimization: OptimizationByCategory | None = None
    agent_development_suggestions: list[str] = []  # Agent 开发优化建议汇总
