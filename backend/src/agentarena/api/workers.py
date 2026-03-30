"""Worker monitor API — reads Redis worker heartbeats and enriches from DB."""

import json
from typing import Any

import redis.asyncio as redis
from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agentarena.core.config import get_settings
from agentarena.core.database import DbSession
from agentarena.core.worker_registry import WORKER_STATE_KEY_PREFIX
from agentarena.models.agent import Agent, AgentVersion
from agentarena.models.comparison import ComparisonEvaluation
from agentarena.models.evaluation import Evaluation
from agentarena.models.task import Task
from agentarena.schemas.worker_schema import (
    WorkerMonitorItem,
    WorkerMonitorJobInfo,
    WorkerMonitorResponse,
)
from agentarena.services.evaluation_service import EVALUATION_QUEUE

router = APIRouter(prefix="/workers", tags=["workers"])

_COMPARE_MODEL_LABELS = {
    "doubao": "豆包（对比）",
    "qwen": "通义千问（对比）",
    "deepseek": "DeepSeek（对比）",
}


async def _redis_client() -> redis.Redis:
    settings = get_settings()
    return redis.from_url(settings.redis_url, decode_responses=True)


async def _scan_worker_state_keys(r: redis.Redis) -> list[str]:
    keys: list[str] = []
    cur: Any = 0
    pattern = f"{WORKER_STATE_KEY_PREFIX}*"
    while True:
        cur, batch = await r.scan(cur, match=pattern, count=64)
        keys.extend(batch)
        if cur == 0:
            break
    return keys


def _job_dict(state: dict[str, Any]) -> dict[str, Any] | None:
    j = state.get("job")
    return j if isinstance(j, dict) else None


async def _completed_for_task_run(session: AsyncSession, task_run_id: str) -> int:
    ev = await session.execute(
        select(func.count()).select_from(Evaluation).where(Evaluation.task_run_id == task_run_id)
    )
    ce = await session.execute(
        select(func.count()).select_from(ComparisonEvaluation).where(
            ComparisonEvaluation.task_run_id == task_run_id
        )
    )
    return int(ev.scalar() or 0) + int(ce.scalar() or 0)


async def _completed_map_for_task_runs(session: AsyncSession, run_ids: set[str]) -> dict[str, int]:
    """每个 task_run 只查一次库，避免多 Worker 同行重复 COUNT。"""
    out: dict[str, int] = {}
    for rid in run_ids:
        out[rid] = await _completed_for_task_run(session, rid)
    return out


@router.get("/monitor", response_model=WorkerMonitorResponse)
async def workers_monitor(
    db: DbSession,
    include_raw: bool = Query(False, description="是否在响应中包含 Redis 原始 JSON"),
):
    """
    列出当前在线 Worker（Redis 心跳未过期）、队列中待处理 batch job 数，
    并补充任务名、Agent/对比模型展示名、当前 task_run 的完成进度。
    """
    r = await _redis_client()
    try:
        queue_len = int(await r.llen(EVALUATION_QUEUE))
        keys = await _scan_worker_state_keys(r)
        raw_list: list[dict[str, Any]] = []
        states: list[dict[str, Any]] = []
        for k in keys:
            try:
                s = await r.get(k)
            except Exception:
                continue
            if not s:
                continue
            try:
                obj = json.loads(s)
            except (json.JSONDecodeError, TypeError):
                continue
            if not isinstance(obj, dict):
                continue
            wid = obj.get("worker_id") or (k[len(WORKER_STATE_KEY_PREFIX) :] if k.startswith(WORKER_STATE_KEY_PREFIX) else k)
            obj = {**obj, "worker_id": wid}
            states.append(obj)
            if include_raw:
                raw_list.append(obj)
    finally:
        await r.close()

    task_ids: set[str] = set()
    av_ids: set[str] = set()
    run_ids: set[str] = set()
    for s in states:
        jd = _job_dict(s)
        if not jd:
            continue
        tid = jd.get("task_id")
        if isinstance(tid, str) and tid:
            task_ids.add(tid)
        aid = jd.get("agent_version_id")
        if isinstance(aid, str) and aid:
            av_ids.add(aid)
        rid = jd.get("task_run_id")
        if isinstance(rid, str) and rid:
            run_ids.add(rid)

    task_names: dict[str, str] = {}
    if task_ids:
        res = await db.execute(select(Task.id, Task.name).where(Task.id.in_(task_ids)))
        for row in res.all():
            task_names[row[0]] = row[1]

    agent_labels: dict[str, str] = {}
    if av_ids:
        res = await db.execute(
            select(AgentVersion.id, Agent.name)
            .join(Agent, AgentVersion.agent_id == Agent.id)
            .where(AgentVersion.id.in_(av_ids))
        )
        for row in res.all():
            agent_labels[row[0]] = row[1]

    completed_by_run = await _completed_map_for_task_runs(db, run_ids) if run_ids else {}

    items: list[WorkerMonitorItem] = []
    for s in states:
        job_raw = _job_dict(s)
        job_info: WorkerMonitorJobInfo | None = None
        task_id = None
        task_run_id = None
        executor_label = None

        if job_raw:
            job_info = WorkerMonitorJobInfo(
                job_id=job_raw.get("id"),
                job_type=job_raw.get("job_type"),
                task_id=job_raw.get("task_id"),
                task_run_id=job_raw.get("task_run_id"),
                total_evaluations=job_raw.get("total_evaluations"),
                agent_version_id=job_raw.get("agent_version_id"),
                compare_model=job_raw.get("compare_model"),
                batch_testcase_count=job_raw.get("batch_testcase_count"),
            )
            task_id = job_info.task_id
            task_run_id = job_info.task_run_id
            if job_info.agent_version_id:
                executor_label = agent_labels.get(job_info.agent_version_id) or job_info.agent_version_id
            elif job_info.compare_model:
                executor_label = _COMPARE_MODEL_LABELS.get(
                    job_info.compare_model, job_info.compare_model
                )

        completed = completed_by_run.get(task_run_id) if task_run_id else None

        task_name = task_names.get(task_id) if task_id else None

        total_eval = job_info.total_evaluations if job_info else None

        items.append(
            WorkerMonitorItem(
                worker_id=str(s.get("worker_id", "")),
                hostname=s.get("hostname"),
                pid=s.get("pid"),
                started_at=s.get("started_at"),
                last_seen=s.get("last_seen"),
                state=s.get("state") or "idle",
                job=job_info,
                batch_index=s.get("batch_index"),
                batch_total=s.get("batch_total"),
                task_name=task_name,
                executor_label=executor_label,
                total_evaluations=total_eval,
                completed_evaluations=completed,
            )
        )

    items.sort(key=lambda x: (0 if x.state == "busy" else 1, x.worker_id or ""))

    return WorkerMonitorResponse(
        queue_pending_jobs=queue_len,
        workers=items,
        raw_states=raw_list if include_raw else None,
    )
