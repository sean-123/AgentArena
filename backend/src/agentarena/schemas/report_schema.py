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


class TopItemExample(BaseModel):
    """优缺点对应的示例：问题与回答片段。"""

    question: str
    answer_snippet: str  # 回答摘要，约 150 字


class TopItem(BaseModel):
    """高频项（优点/缺点），可含具体举例。"""

    text: str
    count: int
    examples: list[TopItemExample] = []  # 关联的问题与回答示例


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


class ComparisonModelSummary(BaseModel):
    """单通用大模型（DouBao/Qwen/DeepSeek）的对比总结。"""

    model_type: str  # doubao | qwen | deepseek
    model_display_name: str  # 豆包 | 通义千问 | DeepSeek
    evaluation_count: int
    avg_score: Optional[float] = None
    top_pros: list[TopItem] = []
    top_cons: list[TopItem] = []


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
    # 对比通用大模型
    comparison_by_model: list[ComparisonModelSummary] = []  # 各对比模型的评测总结
    agent_vs_comparison: list[str] = []  # Agent 对比通用大模型的优缺点概括
    takeaways_from_comparison: list[str] = []  # 借鉴通用大模型回答的可取之处
    reply_quality_summary: str = ""  # 回复质量总评（清晰度、结构等）
    info_accuracy_summary: str = ""  # 信息准确度（正确性、幻觉控制等）
    reply_experience_suggestions: list[str] = []  # 怎么回复给人的感觉会更好
