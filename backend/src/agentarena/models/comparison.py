"""Comparison model evaluation - for DouBao, Qwen, DeepSeek, etc."""

from sqlalchemy import Column, String, Text, ForeignKey, Float
from sqlalchemy.orm import relationship

from agentarena.models.base import Base, TimestampMixin


# 支持的对比模型类型
COMPARISON_MODELS = ("doubao", "qwen", "deepseek")


class ComparisonEvaluation(Base, TimestampMixin):
    """通用大模型对比评测（每 testcase 每模型一条）。"""

    __tablename__ = "comparison_evaluations"

    id: Column[str] = Column(String(50), primary_key=True)
    task_id: Column[str] = Column(String(50), ForeignKey("tasks.id"), nullable=True)
    task_run_id: Column[str] = Column(String(50), ForeignKey("task_runs.id"), nullable=True)
    testcase_id: Column[str] = Column(String(50), ForeignKey("testcases.id"), nullable=False)
    model_type: Column[str] = Column(String(50), nullable=False)  # doubao | qwen | deepseek
    question: Column[str] = Column(Text, nullable=False)
    answer: Column[str] = Column(Text, nullable=True)
    latency: Column[float] = Column(Float, nullable=True)

    score = relationship("ComparisonScore", back_populates="evaluation", uselist=False)


class ComparisonScore(Base, TimestampMixin):
    """对比模型的 LLM Judge 评分。"""

    __tablename__ = "comparison_scores"

    id: Column[str] = Column(String(50), primary_key=True)
    comparison_evaluation_id: Column[str] = Column(
        String(50), ForeignKey("comparison_evaluations.id"), nullable=False
    )
    correctness: Column[float] = Column(Float, nullable=True)
    completeness: Column[float] = Column(Float, nullable=True)
    clarity: Column[float] = Column(Float, nullable=True)
    hallucination: Column[float] = Column(Float, nullable=True)
    avg_score: Column[float] = Column(Float, nullable=True)
    pros: Column[str] = Column(Text, nullable=True)
    cons: Column[str] = Column(Text, nullable=True)
    optimization: Column[str] = Column(Text, nullable=True)

    evaluation = relationship("ComparisonEvaluation", back_populates="score")
