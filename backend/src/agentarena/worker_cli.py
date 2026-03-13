"""
Distributed evaluation worker.
Pulls jobs from Redis, runs agent + LLM judge, stores results.
Run with: uv run agentarena-worker
"""

import asyncio
import json
import os
import uuid

from pathlib import Path

from dotenv import load_dotenv

import redis.asyncio as redis

# 加载 .env（AGENT_TW_SERVICE_TOKEN 等），使 Authorization: Bearer 认证可用
# 优先从 cwd 加载（在 AgentArena/backend 下执行时），备选显式路径
load_dotenv()  # cwd 下的 .env
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
# 启动时确认 AGENT_TW_SERVICE_TOKEN 是否已加载（调试用）
_has_tw = bool(os.environ.get("AGENT_TW_SERVICE_TOKEN"))
print(f"[Worker] .env 加载后 AGENT_TW_SERVICE_TOKEN={'已存在' if _has_tw else '未找到'}")
from tenacity import RetryError
from httpx import HTTPStatusError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from agentarena.core.config import get_settings
from agentarena.evaluation_engine.agent_runner import call_agent
from agentarena.evaluation_engine.arena_ranking import INITIAL_ELO
from agentarena.evaluation_engine.llm_judge import judge_answer
from agentarena.evaluation_engine.persona import generate_persona_question
from agentarena.models.agent import Agent, AgentVersion
from agentarena.models.evaluation import Evaluation, Score
from agentarena.models.leaderboard import Leaderboard
from agentarena.models.task import Task, TaskRun

EVALUATION_QUEUE = "agentarena:evaluation_queue"


def _truncate(s: str | None, max_len: int = 500) -> str:
    """日志截断，超出部分用 ... 表示。"""
    if s is None:
        return ""
    t = str(s).strip()
    return t if len(t) <= max_len else f"{t[:max_len]}..."

def _to_score_text(val) -> str | None:
    """将 pros/cons/optimization 转为 Text 列可存格式：list 用换行拼接，否则 str。"""
    if val is None:
        return None
    if isinstance(val, list):
        return "\n".join(str(x).strip() for x in val if x) if val else None
    s = str(val).strip()
    return s if s else None


async def get_agent_config(session: AsyncSession, agent_version_id: str) -> dict | None:
    """
    从任务对应的 Agent 配置中读取 HTTP 接口与认证信息。
    所有字段均来自 AgentVersion.config_json，不做硬编码覆盖。
    """
    result = await session.execute(
        select(AgentVersion, Agent)
        .join(Agent, AgentVersion.agent_id == Agent.id)
        .where(AgentVersion.id == agent_version_id)
    )
    row = result.one_or_none()
    if not row:
        return None
    av, agent = row
    config = {}
    if av.config_json:
        try:
            config = json.loads(av.config_json)
        except json.JSONDecodeError:
            pass
    # HTTP 接口：支持 snake_case 与 camelCase
    base_url = config.get("base_url") or config.get("baseUrl") or ""
    endpoint = config.get("endpoint") or "/chat"
    question_key = config.get("question_key") or config.get("questionKey") or "question"
    extra_payload = config.get("extra_payload") or config.get("extraPayload") or {}
    # stream：根据 agent_versions.config_json 判定，true 时启用 SSE 流式接收
    _s = config.get("stream")
    stream = _s is True or (isinstance(_s, str) and str(_s).lower() in ("true", "1", "yes")) or _s == 1
    # Token：优先 auth_token，否则 auth_token_env（从 .env 读取）
    auth_token = config.get("auth_token") or config.get("authToken") or None
    auth_token_env = config.get("auth_token_env") or config.get("authTokenEnv") or None
    # 空字符串视为未配置
    if isinstance(auth_token, str) and not auth_token.strip():
        auth_token = None
    if isinstance(auth_token_env, str) and not auth_token_env.strip():
        auth_token_env = None
    # 若 auth_token_env 被误填为 token 值：env 名通常 <30 字符，JWT 通常 >100 字符
    if not auth_token and isinstance(auth_token_env, str):
        v = auth_token_env.strip()
        if len(v) > 50:  # 环境变量名如 AGENT_TW_SERVICE_TOKEN 仅 22 字符
            auth_token = v
            auth_token_env = None
    return {
        "agent_name": agent.name,
        "base_url": base_url,
        "endpoint": endpoint,
        "question_key": question_key,
        "extra_payload": extra_payload,
        "auth_token": auth_token,
        "auth_token_env": auth_token_env,
        "persona": config.get("persona"),
        "stream": stream,
    }


async def process_job(session: AsyncSession, job: dict) -> bool:
    """Process single evaluation job."""
    task_id = job.get("task_id")
    task_run_id = job.get("task_run_id")
    testcase_id = job.get("testcase_id")
    agent_version_id = job.get("agent_version_id")
    canonical_question = job.get("question", "")
    persona_question = job.get("persona_question")
    persona = job.get("persona")
    key_points = job.get("key_points")

    # 确定实际发送给 Agent 的问题：优先 persona_question，否则用人设生成，否则用规范问题
    question = persona_question
    if not question and persona and canonical_question:
        question = await generate_persona_question(canonical_question, persona=persona)
    if not question:
        question = canonical_question

    print(f"[Worker] 提问: {_truncate(question, 500)}")
    if key_points:
        print(f"[Worker] 关键点: {_truncate(str(key_points), 300)}")

    # 从任务对应的 Agent 配置读取 HTTP 接口与 token（见 get_agent_config）
    config = await get_agent_config(session, agent_version_id)
    if not config or not config.get("base_url"):
        print(f"[WARN] No agent config for {agent_version_id}, skipping")
        return False

    extra = config.get("extra_payload")
    if extra is not None and not isinstance(extra, dict):
        extra = {}

    # 使用 Agent 配置发起 HTTP 请求（base_url、endpoint、question_key、extra_payload、auth_token/auth_token_env 均来自 Agent）
    # 调试：确认 Agent 配置中的 token 信息
    _at = config.get("auth_token")
    _ate = config.get("auth_token_env")
    if _at:
        print(f"[Worker] Agent 有 auth_token（长度 {len(_at)}）")
    elif _ate:
        print(f"[Worker] Agent 有 auth_token_env={_ate!r}，将从 os.environ 解析")
    else:
        print(f"[Worker] Agent 无 auth_token/auth_token_env，请求将不带 Authorization")
    try:
        answer, latency = await call_agent(
            base_url=config["base_url"],
            endpoint=config["endpoint"],
            question=question,
            question_key=config.get("question_key", "question"),
            extra_payload=extra,
            auth_token=config.get("auth_token"),
            auth_token_env=config.get("auth_token_env"),
            stream=config.get("stream", False),
        )
    except Exception as e:
        err_detail = str(e)
        try:
            orig = None
            # tenacity 使用 raise retry_exc from fut.exception()，原始异常在 __cause__
            if isinstance(e, HTTPStatusError) and getattr(e, "response", None) is not None:
                orig = e
            elif isinstance(e.__cause__, HTTPStatusError):
                orig = e.__cause__
            elif isinstance(e, RetryError) and getattr(e, "last_attempt", None) is not None:
                out = e.last_attempt
                orig = getattr(out, "exception", lambda: None)()
                if orig is None and hasattr(out, "result"):
                    try:
                        out.result()
                    except Exception as ex:
                        orig = ex
            if isinstance(orig, HTTPStatusError) and getattr(orig, "response", None) is not None:
                r = orig.response
                err_detail = f"HTTP {r.status_code} {r.url} - {(r.text or '')[:300]}"
        except Exception:
            pass
        base = config.get("base_url", "")
        print(f"[ERROR] Agent call failed (base_url={base}): {err_detail}")
        answer = f"[ERROR] {err_detail}"
        latency = 0.0

    print(f"[Worker] 回答: {_truncate(answer, 800)}")
    print(f"[Worker] 耗时: {latency:.2f}s")

    # LLM Judge
    scores_data = await judge_answer(question=question, answer=answer, key_points=key_points)
    print(f"[Worker] 评分: correctness={scores_data.get('correctness')} completeness={scores_data.get('completeness')} "
          f"clarity={scores_data.get('clarity')} hallucination={scores_data.get('hallucination')} avg={scores_data.get('avg_score')}")

    # Store evaluation
    ev_id = f"ev_{uuid.uuid4().hex[:12]}"
    evaluation = Evaluation(
        id=ev_id,
        task_id=task_id,
        task_run_id=task_run_id,
        testcase_id=testcase_id,
        agent_version_id=agent_version_id,
        question=question,
        answer=answer,
        latency=latency,
    )
    session.add(evaluation)
    await session.flush()

    score_id = f"sc_{uuid.uuid4().hex[:12]}"
    score = Score(
        id=score_id,
        evaluation_id=ev_id,
        correctness=scores_data.get("correctness"),
        completeness=scores_data.get("completeness"),
        clarity=scores_data.get("clarity"),
        hallucination=scores_data.get("hallucination"),
        avg_score=scores_data.get("avg_score"),
        pros=_to_score_text(scores_data.get("pros")),
        cons=_to_score_text(scores_data.get("cons")),
        optimization=_to_score_text(scores_data.get("optimization")),
    )
    session.add(score)

    # Update leaderboard ELO (per task_run + agent: each run has its own leaderboard)
    agent_name = config.get("agent_name", agent_version_id)
    if not task_run_id:
        task_run_id = None  # legacy: no run id
    lb_result = await session.execute(
        select(Leaderboard).where(
            Leaderboard.task_id == task_id,
            Leaderboard.task_run_id == task_run_id,
            Leaderboard.agent_version_id == agent_version_id,
        )
    )
    lb = lb_result.scalar_one_or_none()
    if not lb:
        lb = Leaderboard(
            id=f"lb_{uuid.uuid4().hex[:12]}",
            task_id=task_id,
            task_run_id=task_run_id,
            agent_name=agent_name,
            agent_version_id=agent_version_id,
            avg_score=0.0,
            elo=INITIAL_ELO,
            evaluation_count=0,
        )
        session.add(lb)
        await session.flush()

    count = lb.evaluation_count or 0
    prev_avg = lb.avg_score or 0.0
    new_avg = (prev_avg * count + scores_data.get("avg_score", 3.0)) / (count + 1)
    lb.avg_score = new_avg
    lb.evaluation_count = count + 1
    if lb.elo is None:
        lb.elo = INITIAL_ELO

    # 检查是否所有 job 已完成，若是则更新 task_run 和 task 状态
    total_jobs = job.get("total_jobs")
    if total_jobs is not None and task_run_id:
        from sqlalchemy import func
        cnt_result = await session.execute(
            select(func.count()).select_from(Evaluation).where(
                Evaluation.task_run_id == task_run_id
            )
        )
        completed = cnt_result.scalar() or 0
        if completed >= total_jobs:
            tr_result = await session.execute(select(TaskRun).where(TaskRun.id == task_run_id))
            tr = tr_result.scalar_one_or_none()
            if tr and tr.status in ("pending", "running"):
                from datetime import datetime, timezone
                tr.status = "completed"
                tr.completed_at = datetime.now(timezone.utc)
                t_result = await session.execute(select(Task).where(Task.id == task_id))
                t = t_result.scalar_one_or_none()
                if t:
                    t.status = "completed"

    return True


async def run_worker():
    """Main worker loop."""
    settings = get_settings()
    r = redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.ping()
        print(f"[Worker] Redis OK, polling {EVALUATION_QUEUE} @ {settings.redis_host}:{settings.redis_port}/{settings.redis_db}")
    except Exception as e:
        print(f"[Worker] Redis ping FAILED: {e}")
        print(f"[Worker] 检查 Redis 配置（密码含 @ 等特殊字符需正确编码）、网络连通性")
        import sys
        sys.exit(1)
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    while True:
        try:
            result = await r.blpop(EVALUATION_QUEUE, timeout=5)
            if result is None:
                continue
            _, job_str = result
            job = json.loads(job_str)
            print("[Worker] Processing job", job.get("id", job))
            async with async_session() as session:
                try:
                    await process_job(session, job)
                    await session.commit()
                except Exception as e:
                    await session.rollback()
                    print(f"[ERROR] Job failed: {e}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[ERROR] Worker error: {e}")
            await asyncio.sleep(5)


def main():
    asyncio.run(run_worker())
