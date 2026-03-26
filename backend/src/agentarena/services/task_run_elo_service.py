"""单次 task_run 内根据各 testcase 分数对 Agent 与对比模型做两两 ELO 更新。"""

from __future__ import annotations

import uuid
from itertools import combinations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agentarena.evaluation_engine.arena_ranking import INITIAL_ELO, update_elo_by_scores
from agentarena.models.agent import Agent, AgentVersion
from agentarena.models.comparison import ComparisonEvaluation, ComparisonScore
from agentarena.models.evaluation import Evaluation, Score
from agentarena.models.leaderboard import Leaderboard
from agentarena.services.summary_report_service import MODEL_DISPLAY_NAMES


async def recompute_task_run_elo(
    session: AsyncSession,
    task_id: str,
    task_run_id: str,
) -> None:
    """
    汇总本批次内每条 testcase 上各参与者（Agent 版本 + 对比模型）的 avg_score，
    按 testcase 顺序做两两 update_elo_by_scores，最后写回 leaderboard（含对比模型行）。
    """
    ev_stmt = (
        select(
            Evaluation.testcase_id,
            Evaluation.agent_version_id,
            func.avg(Score.avg_score),
        )
        .join(Score, Score.evaluation_id == Evaluation.id)
        .where(Evaluation.task_run_id == task_run_id)
        .group_by(Evaluation.testcase_id, Evaluation.agent_version_id)
    )
    ce_stmt = (
        select(
            ComparisonEvaluation.testcase_id,
            ComparisonEvaluation.model_type,
            func.avg(ComparisonScore.avg_score),
        )
        .join(
            ComparisonScore,
            ComparisonScore.comparison_evaluation_id == ComparisonEvaluation.id,
        )
        .where(ComparisonEvaluation.task_run_id == task_run_id)
        .group_by(ComparisonEvaluation.testcase_id, ComparisonEvaluation.model_type)
    )

    ev_rows = (await session.execute(ev_stmt)).all()
    ce_rows = (await session.execute(ce_stmt)).all()

    by_tc: dict[str, dict[str, float]] = {}
    for tc_id, av_id, sc in ev_rows:
        if not tc_id or not av_id or sc is None:
            continue
        by_tc.setdefault(tc_id, {})[f"a:{av_id}"] = float(sc)
    for tc_id, mt, sc in ce_rows:
        if not tc_id or not mt or sc is None:
            continue
        by_tc.setdefault(tc_id, {})[f"c:{mt}"] = float(sc)

    participants: set[str] = set()
    for scores in by_tc.values():
        participants.update(scores.keys())

    if not participants:
        return

    elo: dict[str, float] = {p: float(INITIAL_ELO) for p in participants}

    for tc_id in sorted(by_tc.keys()):
        scores_map = by_tc[tc_id]
        keys = sorted(scores_map.keys())
        for ka, kb in combinations(keys, 2):
            sa, sb = scores_map[ka], scores_map[kb]
            new_a, new_b = update_elo_by_scores(elo[ka], elo[kb], sa, sb)
            elo[ka], elo[kb] = new_a, new_b

    av_ids = [p[2:] for p in participants if p.startswith("a:")]
    name_by_av: dict[str, str] = {}
    if av_ids:
        res = await session.execute(
            select(AgentVersion.id, Agent.name)
            .join(Agent, Agent.id == AgentVersion.agent_id)
            .where(AgentVersion.id.in_(av_ids))
        )
        name_by_av = {row[0]: row[1] for row in res.all()}

    for p in sorted(participants):
        score_list = [by_tc[tc][p] for tc in sorted(by_tc.keys()) if p in by_tc[tc]]
        if not score_list:
            continue
        mean_sc = sum(score_list) / len(score_list)
        cnt = len(score_list)
        elo_val = elo[p]

        if p.startswith("a:"):
            av_id = p[2:]
            lb_result = await session.execute(
                select(Leaderboard)
                .where(
                    Leaderboard.task_run_id == task_run_id,
                    Leaderboard.agent_version_id == av_id,
                    Leaderboard.comparison_model_type.is_(None),
                )
                .limit(1)
            )
            lb = lb_result.scalar_one_or_none()
            if not lb:
                lb = Leaderboard(
                    id=f"lb_{uuid.uuid4().hex[:12]}",
                    task_id=task_id,
                    task_run_id=task_run_id,
                    agent_name=name_by_av.get(av_id, av_id),
                    agent_version_id=av_id,
                    comparison_model_type=None,
                )
                session.add(lb)
            lb.agent_name = name_by_av.get(av_id, lb.agent_name or av_id)
            lb.elo = elo_val
            lb.avg_score = mean_sc
            lb.evaluation_count = cnt
        else:
            mt = p[2:]
            lb_result = await session.execute(
                select(Leaderboard)
                .where(
                    Leaderboard.task_run_id == task_run_id,
                    Leaderboard.comparison_model_type == mt,
                )
                .limit(1)
            )
            lb = lb_result.scalar_one_or_none()
            display = MODEL_DISPLAY_NAMES.get(mt, mt)
            label = f"{display}（对比）"
            if not lb:
                lb = Leaderboard(
                    id=f"lb_{uuid.uuid4().hex[:12]}",
                    task_id=task_id,
                    task_run_id=task_run_id,
                    agent_name=label,
                    agent_version_id=None,
                    comparison_model_type=mt,
                )
                session.add(lb)
            lb.agent_name = label
            lb.elo = elo_val
            lb.avg_score = mean_sc
            lb.evaluation_count = cnt

    await session.flush()
