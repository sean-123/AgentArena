"""Task and TaskRun models."""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from agentarena.models.base import Base, TimestampMixin


class Task(Base, TimestampMixin):
    """Evaluation task."""

    __tablename__ = "tasks"

    id: Column[str] = Column(String(50), primary_key=True)
    name: Column[str] = Column(String(255), nullable=False)
    dataset_id: Column[str] = Column(String(50), ForeignKey("datasets.id"), nullable=True)
    dataset_version_id: Column[str] = Column(
        String(50), ForeignKey("dataset_versions.id"), nullable=True
    )
    agent_ids: Column[str] = Column(Text, nullable=True)  # JSON array of agent IDs
    compare_model_ids: Column[str] = Column(Text, nullable=True)  # JSON array: ["doubao","qwen","deepseek"]
    status: Column[str] = Column(String(20), default="pending")  # pending, running, completed, failed

    task_runs = relationship("TaskRun", back_populates="task")


class TaskRun(Base, TimestampMixin):
    """Single evaluation run of a task."""

    __tablename__ = "task_runs"

    id: Column[str] = Column(String(50), primary_key=True)
    task_id: Column[str] = Column(String(50), ForeignKey("tasks.id"), nullable=False)
    status: Column[str] = Column(String(20), default="pending")
    total_jobs: Column[int] = Column(Integer, nullable=True)  # 总 job 数，用于进度计算
    started_at: Column[str] = Column(DateTime, nullable=True)
    completed_at: Column[str] = Column(DateTime, nullable=True)

    task = relationship("Task", back_populates="task_runs")
