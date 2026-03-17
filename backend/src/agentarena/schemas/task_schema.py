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
    compare_model_ids: Optional[list[str]] = None  # 对比通用大模型: doubao, qwen, deepseek


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
    compare_model_ids: Optional[str] = None
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


class WorkerProgress(BaseModel):
    """单个执行单元（Worker/批次）的进度。"""

    slot_id: str  # agent_version_id 或 compare_xxx
    label: str  # 显示名称，如「Agent A」「豆包 DouBao」
    total: int
    completed: int
    percent: float


class WorkerLogs(BaseModel):
    """单个执行单元的日志列表。"""

    slot_id: str
    label: str
    logs: list = []  # 与 evaluations 同结构的执行记录


class TaskDetailResponse(BaseModel):
    """Task detail with config, progress, and execution log."""

    task: TaskResponse
    latest_run: Optional[TaskRunResponse] = None
    progress: dict  # { total, completed, percent } 总体进度
    config: dict  # dataset_name, agent_names, etc.
    evaluations: list = []  # 兼容旧版，合并的执行 log
    progress_by_worker: list = []  # 按执行单元的进度条 [{ slot_id, label, total, completed, percent }]
    evaluations_by_worker: list = []  # 按执行单元分组的日志 Tab [{ slot_id, label, logs }]
