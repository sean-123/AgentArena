"""Task schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    """Create task request."""

    name: str
    dataset_id: Optional[str] = None
    dataset_version_id: Optional[str] = None
    agent_ids: Optional[list[str]] = None


class TaskUpdate(BaseModel):
    """Update task request."""

    name: Optional[str] = None
    status: Optional[str] = None


class TaskResponse(BaseModel):
    """Task response."""

    id: str
    name: str
    dataset_id: Optional[str] = None
    dataset_version_id: Optional[str] = None
    agent_ids: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TaskRunResponse(BaseModel):
    """Task run response."""

    id: str
    task_id: str
    status: str
    total_jobs: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TaskDetailResponse(BaseModel):
    """Task detail with config, progress, and execution log."""

    task: TaskResponse
    latest_run: Optional[TaskRunResponse] = None
    progress: dict  # { total, completed, percent }
    config: dict  # dataset_name, agent_names, etc.
    evaluations: list = []  # execution log entries
