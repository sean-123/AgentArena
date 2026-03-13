"""Evaluation and Score models."""

from sqlalchemy import Column, String, Text, ForeignKey, Float
from sqlalchemy.orm import relationship

from agentarena.models.base import Base, TimestampMixin


class Evaluation(Base, TimestampMixin):
    """Single agent evaluation (question + answer)."""

    __tablename__ = "evaluations"

    id: Column[str] = Column(String(50), primary_key=True)
    task_id: Column[str] = Column(String(50), ForeignKey("tasks.id"), nullable=True)
    task_run_id: Column[str] = Column(String(50), ForeignKey("task_runs.id"), nullable=True)
    testcase_id: Column[str] = Column(String(50), ForeignKey("testcases.id"), nullable=False)
    agent_version_id: Column[str] = Column(
        String(50), ForeignKey("agent_versions.id"), nullable=False
    )
    question: Column[str] = Column(Text, nullable=False)
    answer: Column[str] = Column(Text, nullable=True)
    latency: Column[float] = Column(Float, nullable=True)

    score = relationship("Score", back_populates="evaluation", uselist=False)


class Score(Base, TimestampMixin):
    """LLM Judge scores for an evaluation."""

    __tablename__ = "scores"

    id: Column[str] = Column(String(50), primary_key=True)
    evaluation_id: Column[str] = Column(
        String(50), ForeignKey("evaluations.id"), nullable=False
    )
    correctness: Column[float] = Column(Float, nullable=True)
    completeness: Column[float] = Column(Float, nullable=True)
    clarity: Column[float] = Column(Float, nullable=True)
    hallucination: Column[float] = Column(Float, nullable=True)
    avg_score: Column[float] = Column(Float, nullable=True)
    pros: Column[str] = Column(Text, nullable=True)
    cons: Column[str] = Column(Text, nullable=True)
    optimization: Column[str] = Column(Text, nullable=True)

    evaluation = relationship("Evaluation", back_populates="score")
