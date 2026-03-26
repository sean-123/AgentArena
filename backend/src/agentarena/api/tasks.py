"""Task API routes."""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from agentarena.core.database import DbSession
from agentarena.models.task import Task, TaskRun
from agentarena.models.dataset import Dataset, DatasetVersion, Testcase
from agentarena.models.evaluation import Evaluation, Score
from agentarena.models.comparison import ComparisonEvaluation, ComparisonScore
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
        compare_model_ids=json.dumps(body.compare_model_ids) if body.compare_model_ids else None,
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
    """Delete task and all related data (TaskRun, Evaluation, Score, Leaderboard, Redis 队列中对应 job)."""
    exists = await db.execute(select(Task.id).where(Task.id == task_id))
    if not exists.scalar_one_or_none():
        raise HTTPException(404, "Task not found")

    # 先从 Redis 队列中移除该任务的所有待执行 job
    try:
        from agentarena.services.evaluation_service import EvaluationService
        svc = EvaluationService()
        removed = await svc.remove_jobs_for_task(task_id)
        if removed > 0:
            import logging
            logging.getLogger("agentarena").info(f"[Delete] task_id={task_id} 已从 Redis 队列移除 {removed} 个 job")
    except Exception as e:
        import logging
        logging.getLogger("agentarena").warning(f"[Delete] 移除 Redis 队列 job 失败: {e}")

    # 按依赖顺序删除，避免外键约束错误。仅用 bulk delete，不加载 task 对象，防止 ORM 将 task_runs.task_id 置为 NULL
    ev_ids_result = await db.execute(
        select(Evaluation.id).where(Evaluation.task_id == task_id)
    )
    ev_ids = [r[0] for r in ev_ids_result.all()]
    if ev_ids:
        await db.execute(delete(Score).where(Score.evaluation_id.in_(ev_ids)))
    await db.execute(delete(Evaluation).where(Evaluation.task_id == task_id))
    # 删除对比评测
    ce_ids_result = await db.execute(select(ComparisonEvaluation.id).where(ComparisonEvaluation.task_id == task_id))
    ce_ids = [r[0] for r in ce_ids_result.all()]
    if ce_ids:
        await db.execute(delete(ComparisonScore).where(ComparisonScore.comparison_evaluation_id.in_(ce_ids)))
    await db.execute(delete(ComparisonEvaluation).where(ComparisonEvaluation.task_id == task_id))
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


@router.post("/{task_id}/force-complete", response_model=TaskResponse)
async def force_complete_task(task_id: str, db: DbSession):
    """
    强制将任务标记为已完成。用于 Worker 未正确更新状态或任务卡住时的恢复。
    """
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    run_result = await db.execute(
        select(TaskRun)
        .where(TaskRun.task_id == task_id)
        .order_by(TaskRun.created_at.desc())
        .limit(1)
    )
    latest_run = run_result.scalar_one_or_none()
    if latest_run and latest_run.status in ("pending", "running"):
        from datetime import datetime, timezone
        latest_run.status = "completed"
        if not latest_run.completed_at:
            latest_run.completed_at = datetime.now(timezone.utc)
    task.status = "completed"
    await db.flush()
    if latest_run and latest_run.status == "completed":
        from agentarena.services.task_run_elo_service import recompute_task_run_elo

        await recompute_task_run_elo(db, task_id, latest_run.id)
    return task


# 对比模型显示名
COMPARE_MODEL_LABELS = {"doubao": "豆包 DouBao", "qwen": "通义千问 Qwen", "deepseek": "DeepSeek"}


@router.get("/{task_id}/progress-debug")
async def get_task_progress_debug(task_id: str, db: DbSession):
    """诊断接口：返回原始进度数据，用于排查 API 与 Worker 是否看到同一 DB。"""
    from sqlalchemy import func

    run_result = await db.execute(
        select(TaskRun).where(TaskRun.task_id == task_id).order_by(TaskRun.created_at.desc()).limit(1)
    )
    latest_run = run_result.scalar_one_or_none()
    if not latest_run:
        return {"task_id": task_id, "latest_run_id": None, "ev_count": 0, "ce_count": 0, "total_jobs": None}

    ev_res = await db.execute(
        select(func.count()).select_from(Evaluation).where(Evaluation.task_run_id == latest_run.id)
    )
    ce_res = await db.execute(
        select(func.count()).select_from(ComparisonEvaluation).where(
            ComparisonEvaluation.task_run_id == latest_run.id
        )
    )
    return {
        "task_id": task_id,
        "latest_run_id": latest_run.id,
        "ev_count": int(ev_res.scalar() or 0),
        "ce_count": int(ce_res.scalar() or 0),
        "total_jobs": latest_run.total_jobs,
        "completed": int(ev_res.scalar() or 0) + int(ce_res.scalar() or 0),
    }


@router.get("/{task_id}/detail", response_model=TaskDetailResponse)
async def get_task_detail(task_id: str, db: DbSession):
    """Get task detail: config, latest run progress, execution log (per worker slot)."""
    from sqlalchemy import func

    from agentarena.models.dataset import Testcase

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
        ev_cnt = await db.execute(
            select(func.count()).select_from(Evaluation).where(
                Evaluation.task_run_id == latest_run.id
            )
        )
        ce_cnt = await db.execute(
            select(func.count()).select_from(ComparisonEvaluation).where(
                ComparisonEvaluation.task_run_id == latest_run.id
            )
        )
        completed = int(ev_cnt.scalar() or 0) + int(ce_cnt.scalar() or 0)
    percent = round(100 * completed / total, 1) if total else 0

    # 自愈：若实际已完成数 >= 总数，但状态仍是 running，则修正为 completed（修复 Worker 未正确更新的情况）
    if (
        latest_run
        and latest_run.status in ("pending", "running")
        and total > 0
        and completed >= total
    ):
        latest_run.status = "completed"
        if not latest_run.completed_at:
            from datetime import datetime, timezone
            latest_run.completed_at = datetime.now(timezone.utc)
        task.status = "completed"
        await db.flush()

    # Config: dataset name, agent names
    config: dict = {"dataset_name": None, "agent_names": []}
    dv_id = task.dataset_version_id or task.dataset_id
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

    # 解析对比模型
    compare_models: list[str] = []
    if task.compare_model_ids:
        try:
            compare_models = [m for m in json.loads(task.compare_model_ids) if m in ("doubao", "qwen", "deepseek")]
        except json.JSONDecodeError:
            pass

    # 获取各 Agent 的 latest version 及名称 -> slot 列表
    slots: list[tuple[str, str]] = []  # (slot_id, label)
    if not agent_ids:
        agent_ids = [r[0] for r in (await db.execute(select(Agent.id))).all()]
    agent_rows = (await db.execute(select(Agent.id, Agent.name))).all()
    agent_id_to_name = {r[0]: r[1] for r in agent_rows}
    for agent_id in agent_ids or []:
        av_result = await db.execute(
            select(AgentVersion.id)
            .where(AgentVersion.agent_id == agent_id)
            .order_by(AgentVersion.created_at.desc())
            .limit(1)
        )
        av_id = av_result.scalar_one_or_none()
        if av_id:
            label = agent_id_to_name.get(agent_id, av_id) or av_id
            slots.append((av_id, label))  # slot_id = agent_version_id
    for m in compare_models:
        slots.append((f"compare_{m}", COMPARE_MODEL_LABELS.get(m, m)))

    # 每个 slot 的 total = 数据集 testcase 数量（需用 dataset_version_id，与 run 时一致）
    testcase_total = 0
    dv_id_for_tc = None
    if task.dataset_version_id:
        dv_id_for_tc = task.dataset_version_id
    elif task.dataset_id:
        dv_row = await db.execute(
            select(DatasetVersion.id)
            .where(DatasetVersion.dataset_id == task.dataset_id)
            .order_by(DatasetVersion.created_at.desc())
            .limit(1)
        )
        dv_id_for_tc = dv_row.scalar_one_or_none()
    if dv_id_for_tc:
        tc_result = await db.execute(
            select(func.count()).select_from(Testcase).where(Testcase.dataset_version_id == dv_id_for_tc)
        )
        testcase_total = tc_result.scalar() or 0

    progress_by_worker: list[dict] = []
    evaluations_by_worker: list[dict] = []

    for slot_id, label in slots:
        slot_total = testcase_total
        slot_completed = 0
        if latest_run:
            if slot_id.startswith("compare_"):
                model_type = slot_id.replace("compare_", "")
                cnt = await db.execute(
                    select(func.count()).select_from(ComparisonEvaluation).where(
                        ComparisonEvaluation.task_run_id == latest_run.id,
                        ComparisonEvaluation.model_type == model_type,
                    )
                )
                slot_completed = cnt.scalar() or 0
            else:
                cnt = await db.execute(
                    select(func.count()).select_from(Evaluation).where(
                        Evaluation.task_run_id == latest_run.id,
                        Evaluation.agent_version_id == slot_id,
                    )
                )
                slot_completed = cnt.scalar() or 0
        slot_percent = round(100 * slot_completed / slot_total, 1) if slot_total else 0
        progress_by_worker.append({
            "slot_id": slot_id,
            "label": label,
            "total": slot_total,
            "completed": slot_completed,
            "percent": slot_percent,
        })

        # 按 slot 拉取执行日志
        slot_logs: list[dict] = []
        if latest_run:
            if slot_id.startswith("compare_"):
                model_type = slot_id.replace("compare_", "")
                ce_query = (
                    select(ComparisonEvaluation)
                    .where(
                        ComparisonEvaluation.task_run_id == latest_run.id,
                        ComparisonEvaluation.model_type == model_type,
                    )
                    .order_by(ComparisonEvaluation.created_at.desc())
                    .limit(100)
                )
                ce_result = await db.execute(ce_query)
                for e in ce_result.scalars().all():
                    slot_logs.append({
                        "id": e.id,
                        "agent_version_id": None,
                        "model_type": e.model_type,
                        "question": e.question or "",
                        "answer": e.answer or "",
                        "latency": e.latency,
                        "created_at": e.created_at.isoformat() if e.created_at else None,
                    })
            else:
                ev_query = (
                    select(Evaluation)
                    .where(
                        Evaluation.task_run_id == latest_run.id,
                        Evaluation.agent_version_id == slot_id,
                    )
                    .order_by(Evaluation.created_at.desc())
                    .limit(100)
                )
                ev_result = await db.execute(ev_query)
                for e in ev_result.scalars().all():
                    slot_logs.append({
                        "id": e.id,
                        "agent_version_id": e.agent_version_id,
                        "question": e.question or "",
                        "answer": e.answer or "",
                        "latency": e.latency,
                        "created_at": e.created_at.isoformat() if e.created_at else None,
                    })
        evaluations_by_worker.append({"slot_id": slot_id, "label": label, "logs": slot_logs})

    # 兼容旧版 evaluations：合并所有 slot 的 logs
    all_logs: list[dict] = []
    for item in evaluations_by_worker:
        all_logs.extend(item["logs"])
    all_logs.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    ev_logs = all_logs[:100]

    # 自愈：total_jobs 未正确设置时，用 testcase_total * slot 数作为 fallback
    if total == 0 and testcase_total > 0 and progress_by_worker:
        total = testcase_total * len(progress_by_worker)
        percent = round(100 * completed / total, 1) if total else 0

    return TaskDetailResponse(
        task=task,
        latest_run=latest_run,
        progress={"total": total, "completed": completed, "percent": percent},
        config=config,
        evaluations=ev_logs,
        progress_by_worker=progress_by_worker,
        evaluations_by_worker=evaluations_by_worker,
    )
