"""Worker monitor API schemas."""

from typing import Any

from pydantic import BaseModel, Field


class WorkerMonitorJobInfo(BaseModel):
    """Subset of job fields exposed to the monitor UI."""

    job_id: str | None = None
    job_type: str | None = None
    task_id: str | None = None
    task_run_id: str | None = None
    total_evaluations: int | None = None
    agent_version_id: str | None = None
    compare_model: str | None = None
    batch_testcase_count: int | None = None


class WorkerMonitorItem(BaseModel):
    """One worker row after DB enrichment."""

    worker_id: str
    hostname: str | None = None
    pid: int | None = None
    started_at: str | None = None
    last_seen: str | None = None
    state: str = Field(description="idle | busy")
    job: WorkerMonitorJobInfo | None = None
    batch_index: int | None = None
    batch_total: int | None = None
    task_name: str | None = None
    executor_label: str | None = Field(
        default=None,
        description="Agent 名称或对比模型展示名",
    )
    total_evaluations: int | None = Field(
        default=None,
        description="当前任务 run 的总评测条数（来自 job / DB）",
    )
    completed_evaluations: int | None = Field(
        default=None,
        description="当前 task_run 在 DB 中已完成的评测条数",
    )


class WorkerMonitorResponse(BaseModel):
    """Monitor dashboard payload."""

    queue_pending_jobs: int = Field(description="Redis 队列中待处理的 batch job 数（LPUSH 粒度）")
    workers: list[WorkerMonitorItem]
    raw_states: list[dict[str, Any]] | None = Field(
        default=None,
        description="可选调试字段，默认不返回",
    )
