"""Reports and leaderboard API routes."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from agentarena.core.database import DbSession
from agentarena.models.agent import Agent, AgentVersion
from agentarena.models.evaluation import Evaluation, Score
from agentarena.models.leaderboard import Leaderboard
from agentarena.models.task import Task, TaskRun
from agentarena.schemas.report_schema import (
    AgentSummary,
    EvaluationResponse,
    EvaluationWithScoreResponse,
    LeaderboardEntry,
    OptimizationByCategory,
    ScoreResponse,
    TaskSummaryReportResponse,
    TopItem,
)
from agentarena.services.summary_report_service import build_summary

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard(
    db: DbSession,
    task_id: Optional[str] = Query(None),
    task_run_id: Optional[str] = Query(None, description="运行批次 ID，不指定时若选任务则用最新一次"),
    limit: int = Query(50, le=200),
):
    """Get leaderboard, optionally filtered by task and/or run. Each run has separate results."""
    # When task_id given but task_run_id not: use latest run
    effective_run_id = task_run_id
    if task_id and not task_run_id:
        run_result = await db.execute(
            select(TaskRun.id)
            .where(TaskRun.task_id == task_id)
            .order_by(TaskRun.created_at.desc())
            .limit(1)
        )
        effective_run_id = run_result.scalar_one_or_none()

    q = (
        select(Leaderboard)
        .order_by(desc(Leaderboard.elo))
        .limit(limit)
    )
    if task_id:
        q = q.where(Leaderboard.task_id == task_id)
    if effective_run_id is not None:
        q = q.where(Leaderboard.task_run_id == effective_run_id)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/evaluations", response_model=list[EvaluationResponse])
async def list_evaluations(
    db: DbSession,
    task_id: Optional[str] = Query(None),
    agent_version_id: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
):
    """List evaluations with optional filters."""
    q = select(Evaluation).order_by(Evaluation.created_at.desc()).limit(limit).offset(offset)
    if task_id:
        q = q.where(Evaluation.task_id == task_id)
    if agent_version_id:
        q = q.where(Evaluation.agent_version_id == agent_version_id)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/evaluations/{evaluation_id}", response_model=EvaluationResponse)
async def get_evaluation(evaluation_id: str, db: DbSession):
    """Get single evaluation."""
    result = await db.execute(select(Evaluation).where(Evaluation.id == evaluation_id))
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    return ev


@router.get("/evaluations/{evaluation_id}/score", response_model=ScoreResponse)
async def get_evaluation_score(evaluation_id: str, db: DbSession):
    """Get score for an evaluation."""
    result = await db.execute(select(Score).where(Score.evaluation_id == evaluation_id))
    score = result.scalar_one_or_none()
    if not score:
        raise HTTPException(404, "Score not found")
    return score


@router.get("/leaderboard/detail", response_model=list[EvaluationWithScoreResponse])
async def get_leaderboard_detail(
    db: DbSession,
    task_id: str = Query(..., description="任务 ID"),
    agent_version_id: str = Query(..., description="Agent 版本 ID"),
    task_run_id: Optional[str] = Query(None, description="运行批次 ID，不指定则返回该任务+agent的所有记录"),
    limit: int = Query(100, le=500),
):
    """获取排行榜某条目的详细评测记录（含每次对话的 question、answer、pros、cons、optimization）。"""
    q = (
        select(Evaluation)
        .options(joinedload(Evaluation.score))
        .where(Evaluation.task_id == task_id, Evaluation.agent_version_id == agent_version_id)
        .order_by(Evaluation.created_at.desc())
        .limit(limit)
    )
    if task_run_id:
        q = q.where(Evaluation.task_run_id == task_run_id)
    result = await db.execute(q)
    evaluations = result.unique().scalars().all()
    out = []
    for ev in evaluations:
        sc = ev.score
        out.append(
            EvaluationWithScoreResponse(
                id=ev.id,
                task_id=ev.task_id,
                testcase_id=ev.testcase_id,
                agent_version_id=ev.agent_version_id,
                question=ev.question or "",
                answer=ev.answer,
                latency=ev.latency,
                created_at=ev.created_at,
                correctness=sc.correctness if sc else None,
                completeness=sc.completeness if sc else None,
                clarity=sc.clarity if sc else None,
                hallucination=sc.hallucination if sc else None,
                avg_score=sc.avg_score if sc else None,
                pros=sc.pros if sc else None,
                cons=sc.cons if sc else None,
                optimization=sc.optimization if sc else None,
            )
        )
    return out


@router.get("/summary", response_model=TaskSummaryReportResponse)
async def get_task_summary_report(
    db: DbSession,
    task_id: str = Query(..., description="任务 ID"),
    task_run_id: Optional[str] = Query(None, description="运行批次 ID，不指定则用最新一次"),
):
    """
    获取任务总结报告：聚合各评测的优缺点与优化建议，
    突出高频优点、缺点，并将优化建议分类为回答修改、提示词、RAG。
    """
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")

    effective_run_id = task_run_id
    if not effective_run_id:
        run_result = await db.execute(
            select(TaskRun.id)
            .where(TaskRun.task_id == task_id)
            .order_by(TaskRun.created_at.desc())
            .limit(1)
        )
        effective_run_id = run_result.scalar_one_or_none()

    if not effective_run_id:
        return TaskSummaryReportResponse(
            task_id=task_id,
            task_run_id=None,
            task_name=task.name,
            total_evaluations=0,
            by_agent=[],
            overall_top_pros=[],
            overall_top_cons=[],
            overall_optimization=None,
            agent_development_suggestions=[],
        )

    q = (
        select(Evaluation, Score)
        .join(Score, Score.evaluation_id == Evaluation.id)
        .where(
            Evaluation.task_id == task_id,
            Evaluation.task_run_id == effective_run_id,
        )
    )
    ev_result = await db.execute(q)
    rows = ev_result.all()

    ev_list = [
        {
            "agent_version_id": ev.agent_version_id,
            "pros": sc.pros if sc else None,
            "cons": sc.cons if sc else None,
            "optimization": sc.optimization if sc else None,
        }
        for ev, sc in rows
    ]
    summary = build_summary(ev_list, top_n=10)

    av_ids = list(summary["by_agent"].keys())
    agent_names: dict[str, str] = {}
    if av_ids:
        av_query = (
            select(AgentVersion.id, Agent.name)
            .join(Agent, Agent.id == AgentVersion.agent_id)
            .where(AgentVersion.id.in_(av_ids))
        )
        av_rows = (await db.execute(av_query)).all()
        for av_id, name in av_rows:
            agent_names[av_id] = name or av_id

    by_agent_resp: list[AgentSummary] = []
    for av_id, data in summary["by_agent"].items():
        ev_count = sum(1 for e in ev_list if e["agent_version_id"] == av_id)
        opt = data["optimizations"]
        by_agent_resp.append(
            AgentSummary(
                agent_name=agent_names.get(av_id, av_id),
                agent_version_id=av_id,
                evaluation_count=ev_count,
                top_pros=[TopItem(text=t["text"], count=t["count"]) for t in data["top_pros"]],
                top_cons=[TopItem(text=t["text"], count=t["count"]) for t in data["top_cons"]],
                optimization=OptimizationByCategory(
                    answer_modification=opt["answer"],
                    prompt_optimization=opt["prompt"],
                    rag_optimization=opt["rag"],
                    agent_development=opt.get("development", []),
                ),
            )
        )

    overall = summary["overall"]
    return TaskSummaryReportResponse(
        task_id=task_id,
        task_run_id=effective_run_id,
        task_name=task.name,
        total_evaluations=len(ev_list),
        by_agent=by_agent_resp,
        overall_top_pros=[TopItem(text=t["text"], count=t["count"]) for t in overall["top_pros"]],
        overall_top_cons=[TopItem(text=t["text"], count=t["count"]) for t in overall["top_cons"]],
        overall_optimization=OptimizationByCategory(
            answer_modification=overall["optimizations"]["answer"],
            prompt_optimization=overall["optimizations"]["prompt"],
            rag_optimization=overall["optimizations"]["rag"],
            agent_development=overall["optimizations"].get("development", []),
        ),
        agent_development_suggestions=overall.get("agent_development_suggestions", []),
    )
