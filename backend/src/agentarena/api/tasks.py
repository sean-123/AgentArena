"""Task API routes."""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from agentarena.core.database import DbSession
from agentarena.models.task import Task, TaskRun
from agentarena.models.dataset import Dataset, DatasetVersion
from agentarena.models.evaluation import Evaluation, Score
from agentarena.models.agent import Agent, AgentVersion
from agentarena.models.leaderboard import Leaderboard, ArenaMatch
from agentarena.schemas.task_schema import (
    TaskCreate,
    TaskDetailResponse,
    TaskResponse,
    TaskRunResponse,
    TaskUpdate,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _serialize_agent_ids(agent_ids: list[str] | None) -> str | None:
    return json.dumps(agent_ids) if agent_ids else None


def _parse_agent_ids(s: str | None) -> list[str] | None:
    if not s:
        return None
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return None


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    db: DbSession,
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """List evaluation tasks."""
    q = select(Task).order_by(Task.created_at.desc()).limit(limit).offset(offset)
    if status:
        q = q.where(Task.status == status)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("", response_model=TaskResponse)
async def create_task(body: TaskCreate, db: DbSession):
    """Create a new evaluation task."""
    task = Task(
        id=f"task_{uuid.uuid4().hex[:12]}",
        name=body.name,
        dataset_id=body.dataset_id,
        dataset_version_id=body.dataset_version_id,
        agent_ids=_serialize_agent_ids(body.agent_ids),
        status="pending",
    )
    db.add(task)
    await db.flush()
    return task


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, db: DbSession):
    """Get task by ID."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, body: TaskUpdate, db: DbSession):
    """Update task."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    if body.name is not None:
        task.name = body.name
    if body.status is not None:
        task.status = body.status
    await db.flush()
    return task


@router.delete("/{task_id}")
async def delete_task(task_id: str, db: DbSession):
    """Delete task and all related data (TaskRun, Evaluation, Score, Leaderboard)."""
    exists = await db.execute(select(Task.id).where(Task.id == task_id))
    if not exists.scalar_one_or_none():
        raise HTTPException(404, "Task not found")

    # 按依赖顺序删除，避免外键约束错误。仅用 bulk delete，不加载 task 对象，防止 ORM 将 task_runs.task_id 置为 NULL
    ev_ids_result = await db.execute(
        select(Evaluation.id).where(Evaluation.task_id == task_id)
    )
    ev_ids = [r[0] for r in ev_ids_result.all()]
    if ev_ids:
        await db.execute(delete(Score).where(Score.evaluation_id.in_(ev_ids)))
    await db.execute(delete(Evaluation).where(Evaluation.task_id == task_id))
    await db.execute(delete(Leaderboard).where(Leaderboard.task_id == task_id))
    await db.execute(delete(ArenaMatch).where(ArenaMatch.task_id == task_id))
    await db.execute(delete(TaskRun).where(TaskRun.task_id == task_id))
    await db.execute(delete(Task).where(Task.id == task_id))
    return {"status": "ok"}


@router.get("/{task_id}/runs", response_model=list[TaskRunResponse])
async def list_task_runs(task_id: str, db: DbSession):
    """List runs for a task."""
    result = await db.execute(
        select(TaskRun).where(TaskRun.task_id == task_id).order_by(TaskRun.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{task_id}/detail", response_model=TaskDetailResponse)
async def get_task_detail(task_id: str, db: DbSession):
    """Get task detail: config, latest run progress, execution log."""
    from sqlalchemy import func

    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")

    # Latest run
    run_result = await db.execute(
        select(TaskRun)
        .where(TaskRun.task_id == task_id)
        .order_by(TaskRun.created_at.desc())
        .limit(1)
    )
    latest_run = run_result.scalar_one_or_none()

    total = latest_run.total_jobs if latest_run and latest_run.total_jobs else 0
    completed = 0
    if latest_run:
        cnt_result = await db.execute(
            select(func.count()).select_from(Evaluation).where(
                Evaluation.task_run_id == latest_run.id
            )
        )
        completed = cnt_result.scalar() or 0
    percent = round(100 * completed / total, 1) if total else 0

    # Config: dataset name, agent names
    config: dict = {"dataset_name": None, "agent_names": []}
    if task.dataset_version_id:
        ds_result = await db.execute(
            select(Dataset.name)
            .join(DatasetVersion, DatasetVersion.dataset_id == Dataset.id)
            .where(DatasetVersion.id == task.dataset_version_id)
        )
        row = ds_result.one_or_none()
        if row:
            config["dataset_name"] = row[0]
    elif task.dataset_id:
        ds_result = await db.execute(
            select(Dataset.name).where(Dataset.id == task.dataset_id)
        )
        row = ds_result.one_or_none()
        if row:
            config["dataset_name"] = row[0]
    agent_ids = _parse_agent_ids(task.agent_ids)
    if agent_ids:
        agents_result = await db.execute(
            select(Agent.name).where(Agent.id.in_(agent_ids))
        )
        config["agent_names"] = [r[0] for r in agents_result.all()]
    else:
        agents_result = await db.execute(select(Agent.name))
        config["agent_names"] = [r[0] for r in agents_result.all()]

    # Evaluations as execution log (by latest run or task)
    ev_query = select(Evaluation).where(Evaluation.task_id == task_id)
    if latest_run:
        ev_query = ev_query.where(Evaluation.task_run_id == latest_run.id)
    ev_query = ev_query.order_by(Evaluation.created_at.desc()).limit(100)
    ev_result = await db.execute(ev_query)
    evs = ev_result.scalars().all()
    ev_logs = [
        {
            "id": e.id,
            "agent_version_id": e.agent_version_id,
            "question": (e.question or "")[:200],
            "answer": (e.answer or "")[:200] if e.answer else "",
            "latency": e.latency,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in evs
    ]

    return TaskDetailResponse(
        task=task,
        latest_run=latest_run,
        progress={"total": total, "completed": completed, "percent": percent},
        config=config,
        evaluations=ev_logs,
    )
