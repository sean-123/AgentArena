"""Evaluation API - run evaluation tasks, dispatch to workers."""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agentarena.core.database import DbSession
from agentarena.core.config import get_settings
from agentarena.models.task import Task, TaskRun
from agentarena.models.dataset import DatasetVersion, Testcase
from agentarena.models.agent import Agent, AgentVersion
from agentarena.services.evaluation_service import EvaluationService

router = APIRouter(prefix="/evaluation", tags=["evaluation"])


@router.post("/tasks/{task_id}/run")
async def run_evaluation(
    task_id: str,
    background_tasks: BackgroundTasks,
    db: DbSession,
):
    """
    Start evaluation for a task.
    Dispatches jobs to Redis queue for distributed workers.
    """
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status == "running":
        raise HTTPException(400, "Task is already running")

    # Get dataset version and agents
    dataset_version_id = task.dataset_version_id or task.dataset_id
    if not dataset_version_id:
        raise HTTPException(400, "Task has no dataset/dataset_version")
    # If dataset_id was used, get first version
    if task.dataset_version_id:
        dv_id = task.dataset_version_id
    else:
        dv_result = await db.execute(
            select(DatasetVersion)
            .where(DatasetVersion.dataset_id == task.dataset_id)
            .order_by(DatasetVersion.created_at.desc())
            .limit(1)
        )
        dv = dv_result.scalar_one_or_none()
        if not dv:
            raise HTTPException(404, "Dataset has no versions")
        dv_id = dv.id

    agent_ids = []
    if task.agent_ids:
        try:
            agent_ids = json.loads(task.agent_ids)
        except json.JSONDecodeError:
            pass
    if not agent_ids:
        # Get all agents
        agents_result = await db.execute(select(Agent.id))
        agent_ids = [r[0] for r in agents_result.all()]

    if not agent_ids:
        raise HTTPException(400, "No agents configured for task")

    # Get latest version of each agent
    agent_version_ids = []
    for agent_id in agent_ids:
        av_result = await db.execute(
            select(AgentVersion.id)
            .where(AgentVersion.agent_id == agent_id)
            .order_by(AgentVersion.created_at.desc())
            .limit(1)
        )
        av_id = av_result.scalar_one_or_none()
        if av_id:
            agent_version_ids.append(av_id)  # scalar_one 返回标量，不要用 av_id[0]

    if not agent_version_ids:
        raise HTTPException(400, "No agent versions found")

    compare_model_ids: list[str] = []
    if task.compare_model_ids:
        try:
            compare_model_ids = json.loads(task.compare_model_ids)
        except json.JSONDecodeError:
            pass

    # Create task run
    task_run = TaskRun(
        id=f"run_{uuid.uuid4().hex[:12]}",
        task_id=task_id,
        status="pending",
    )
    db.add(task_run)
    task.status = "running"
    await db.flush()

    service = EvaluationService()
    try:
        job_count = await service.dispatch_evaluation_jobs(
            task_id=task_id,
            task_run_id=task_run.id,
            dataset_version_id=dv_id,
            agent_version_ids=agent_version_ids,
            compare_model_ids=compare_model_ids or None,
        )
        task_run.total_jobs = job_count
        task_run.status = "running"
        if job_count == 0:
            import sys
            print(f"[Run] WARN: task_id={task_id} 已 dispatch 但 job_count=0，请检查数据集版本 {dv_id} 是否有 testcase", file=sys.stderr)
        await db.flush()
    except Exception as e:
        task.status = "failed"
        task_run.status = "failed"
        raise HTTPException(500, f"Failed to dispatch: {str(e)}")

    return {
        "task_id": task_id,
        "task_run_id": task_run.id,
        "status": "dispatched",
        "dataset_version_id": dv_id,
        "agent_count": len(agent_version_ids),
        "total_jobs": job_count,
    }
