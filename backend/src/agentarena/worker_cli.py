"""
Distributed evaluation worker.
Pulls jobs from Redis, runs agent + LLM judge, stores results.
Run with: uv run agentarena-worker
"""

import asyncio
import json
import logging
import os
import socket
import uuid
from datetime import datetime, timezone

from pathlib import Path

from dotenv import load_dotenv

import redis.asyncio as redis

# 加载 .env（AGENT_TW_SERVICE_TOKEN、NACOS_SERVER_ADDR 等）
# 优先从 cwd 加载（在 AgentArena/backend 下执行时），备选显式路径
load_dotenv()  # cwd 下的 .env
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
# 若配置了 Nacos，从 Nacos 拉取配置并覆盖 env
from agentarena.core.nacos_loader import load_nacos_config_if_configured

load_nacos_config_if_configured()
# 启动时确认 AGENT_TW_SERVICE_TOKEN 是否已加载（调试用）
_has_tw = bool(os.environ.get("AGENT_TW_SERVICE_TOKEN"))
print(f"[Worker] .env 加载后 AGENT_TW_SERVICE_TOKEN={'已存在' if _has_tw else '未找到'}")
from tenacity import RetryError
from httpx import HTTPStatusError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from agentarena.core.config import get_settings
from agentarena.core.worker_registry import WORKER_STATE_TTL_SEC, worker_state_redis_key
from agentarena.evaluation_engine.agent_runner import call_agent
from agentarena.evaluation_engine.arena_ranking import INITIAL_ELO
from agentarena.evaluation_engine.llm_judge import judge_answer
from agentarena.evaluation_engine.llm_comparison import call_comparison_model
from agentarena.evaluation_engine.persona import generate_persona_question
from agentarena.models.agent import Agent, AgentVersion
from agentarena.models.comparison import ComparisonEvaluation, ComparisonScore
from agentarena.models.evaluation import Evaluation, Score
from agentarena.models.leaderboard import Leaderboard
from agentarena.models.task import Task, TaskRun
from agentarena.services.evaluation_service import (
    EVALUATION_QUEUE,
    EVALUATION_QUEUE_DLQ,
    push_evaluation_job_dlq,
)


class WorkerRuntimeState:
    """Async-safe snapshot of worker presence / current job for Redis monitor."""

    def __init__(self, worker_id: str, hostname: str, pid: int):
        self.worker_id = worker_id
        self.hostname = hostname
        self.pid = pid
        self.started_at = datetime.now(timezone.utc).isoformat()
        self._lock = asyncio.Lock()
        self._busy = False
        self._job: dict | None = None
        self._batch_index: int | None = None
        self._batch_total: int | None = None

    async def mark_idle(self) -> None:
        async with self._lock:
            self._busy = False
            self._job = None
            self._batch_index = None
            self._batch_total = None

    async def mark_busy_job(self, job: dict) -> None:
        async with self._lock:
            self._busy = True
            tcs = job.get("testcases") or []
            self._job = {
                "id": job.get("id"),
                "job_type": job.get("job_type"),
                "task_id": job.get("task_id"),
                "task_run_id": job.get("task_run_id"),
                "total_evaluations": job.get("total_evaluations"),
                "agent_version_id": job.get("agent_version_id"),
                "compare_model": job.get("compare_model"),
                "batch_testcase_count": len(tcs) if tcs else None,
            }
            jt = job.get("job_type", "agent")
            if jt in ("agent_batch", "comparison_batch") and tcs:
                self._batch_total = len(tcs)
                self._batch_index = 0
            else:
                self._batch_total = 1
                self._batch_index = 0

    async def set_batch_progress(self, one_based_index: int, total: int | None = None) -> None:
        async with self._lock:
            self._batch_index = one_based_index
            if total is not None:
                self._batch_total = total

    async def to_public_dict(self) -> dict:
        async with self._lock:
            return {
                "worker_id": self.worker_id,
                "hostname": self.hostname,
                "pid": self.pid,
                "started_at": self.started_at,
                "state": "busy" if self._busy else "idle",
                "job": self._job,
                "batch_index": self._batch_index,
                "batch_total": self._batch_total,
            }


async def _heartbeat_loop(r: redis.Redis, runtime: WorkerRuntimeState, stop: asyncio.Event) -> None:
    key = worker_state_redis_key(runtime.worker_id)
    while not stop.is_set():
        try:
            payload = await runtime.to_public_dict()
            payload["last_seen"] = datetime.now(timezone.utc).isoformat()
            await r.set(key, json.dumps(payload, ensure_ascii=False), ex=WORKER_STATE_TTL_SEC)
        except Exception as e:
            print(f"[Worker] heartbeat Redis 写入失败: {e}")
        try:
            await asyncio.wait_for(stop.wait(), timeout=15)
            break
        except asyncio.TimeoutError:
            pass
    try:
        await r.delete(key)
    except Exception:
        pass


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


async def process_job(
    session: AsyncSession,
    job: dict,
    runtime: WorkerRuntimeState | None = None,
) -> bool:
    """Process evaluation job (single or batch).单 Agent 为批次顺序执行；多 Agent/对比模型时不同 Worker 并行。"""
    task_id = job.get("task_id")
    if task_id:
        t_result = await session.execute(select(Task.id).where(Task.id == task_id))
        if not t_result.scalar_one_or_none():
            print(f"[Worker] Task {task_id} 已删除，跳过 job {job.get('id', '')}")
            return True

    job_type = job.get("job_type", "agent")
    # 批次 job：一个 Worker 顺序处理该 Agent/模型的所有 testcase
    if job_type == "agent_batch":
        return await _process_agent_batch(session, job, runtime)
    if job_type == "comparison_batch":
        return await _process_comparison_batch(session, job, runtime)
    # 兼容旧版单条 job
    if job_type == "comparison":
        if runtime:
            await runtime.set_batch_progress(1, 1)
        return await _process_comparison_job(session, job)
    if runtime:
        await runtime.set_batch_progress(1, 1)
    return await _process_agent_job(session, job)


async def _process_comparison_job(session: AsyncSession, job: dict) -> bool:
    """处理对比通用大模型任务（DouBao/Qwen/DeepSeek）。"""
    task_id = job.get("task_id")
    task_run_id = job.get("task_run_id")
    testcase_id = job.get("testcase_id")
    model_type = job.get("compare_model")
    question = job.get("question", "")
    key_points = job.get("key_points")

    if not model_type or model_type not in ("doubao", "qwen", "deepseek"):
        print(f"[WARN] Invalid compare_model={model_type}, skipping")
        return False

    # Persona 改写：如有 persona_question 或 persona 则使用
    persona_question = job.get("persona_question")
    persona = job.get("persona")
    canonical_question = question
    if persona_question:
        question = persona_question
    elif persona and canonical_question:
        question = await generate_persona_question(canonical_question, persona=persona)

    print(f"[Worker] [对比-{model_type}] 提问: {_truncate(question, 500)}")

    answer, latency = await call_comparison_model(model_type, question)
    print(f"[Worker] [对比-{model_type}] 回答: {_truncate(answer, 800)} 耗时: {latency:.2f}s")

    scores_data = await judge_answer(question=question, answer=answer, key_points=key_points)

    ce_id = f"ce_{uuid.uuid4().hex[:12]}"
    comp_ev = ComparisonEvaluation(
        id=ce_id,
        task_id=task_id,
        task_run_id=task_run_id,
        testcase_id=testcase_id,
        model_type=model_type,
        question=question,
        answer=answer,
        latency=latency,
    )
    session.add(comp_ev)
    await session.flush()

    cs_id = f"cs_{uuid.uuid4().hex[:12]}"
    comp_score = ComparisonScore(
        id=cs_id,
        comparison_evaluation_id=ce_id,
        correctness=scores_data.get("correctness"),
        completeness=scores_data.get("completeness"),
        clarity=scores_data.get("clarity"),
        hallucination=scores_data.get("hallucination"),
        avg_score=scores_data.get("avg_score"),
        pros=_to_score_text(scores_data.get("pros")),
        cons=_to_score_text(scores_data.get("cons")),
        optimization=_to_score_text(scores_data.get("optimization")),
    )
    session.add(comp_score)

    await _check_task_run_completion(session, job)
    return True


async def _process_agent_batch(
    session: AsyncSession,
    job: dict,
    runtime: WorkerRuntimeState | None = None,
) -> bool:
    """处理 Agent 批次：顺序执行该 Agent 的全部 testcase，由单个 Worker 完成。"""
    task_id = job.get("task_id")
    task_run_id = job.get("task_run_id")
    agent_version_id = job.get("agent_version_id")
    testcases = job.get("testcases") or []
    total_evaluations = job.get("total_evaluations")
    if not agent_version_id or not testcases:
        return False
    print(f"[Worker] [批次-Agent] 开始处理 {len(testcases)} 条 testcase")
    for i, tc in enumerate(testcases):
        if runtime:
            await runtime.set_batch_progress(i + 1, len(testcases))
        mini_job = {
            "task_id": task_id,
            "task_run_id": task_run_id,
            "total_evaluations": total_evaluations,
            "testcase_id": tc.get("testcase_id"),
            "agent_version_id": agent_version_id,
            "question": tc.get("question", ""),
            "persona_question": tc.get("persona_question"),
            "persona": tc.get("persona"),
            "key_points": tc.get("key_points"),
        }
        ok = await _process_agent_job(session, mini_job)
        if not ok:
            print(f"[Worker] [批次-Agent] testcase {i+1}/{len(testcases)} 失败，继续")
        else:
            await session.commit()
    # 批次结束时再次检查完成状态（若最后一条失败/skip 可能未触发）
    await _check_task_run_completion(session, job)
    return True


async def _process_comparison_batch(
    session: AsyncSession,
    job: dict,
    runtime: WorkerRuntimeState | None = None,
) -> bool:
    """处理对比模型批次：顺序执行该模型的全部 testcase，由单个 Worker 完成。"""
    task_id = job.get("task_id")
    task_run_id = job.get("task_run_id")
    model_type = job.get("compare_model")
    testcases = job.get("testcases") or []
    total_evaluations = job.get("total_evaluations")
    if not model_type or not testcases:
        return False
    print(f"[Worker] [批次-{model_type}] 开始处理 {len(testcases)} 条 testcase")
    for i, tc in enumerate(testcases):
        if runtime:
            await runtime.set_batch_progress(i + 1, len(testcases))
        mini_job = {
            "task_id": task_id,
            "task_run_id": task_run_id,
            "total_evaluations": total_evaluations,
            "testcase_id": tc.get("testcase_id"),
            "compare_model": model_type,
            "question": tc.get("question", ""),
            "persona_question": tc.get("persona_question"),
            "persona": tc.get("persona"),
            "key_points": tc.get("key_points"),
        }
        ok = await _process_comparison_job(session, mini_job)
        if not ok:
            print(f"[Worker] [批次-{model_type}] testcase {i+1}/{len(testcases)} 失败，继续")
        else:
            await session.commit()
    await _check_task_run_completion(session, job)
    return True


async def _check_task_run_completion(session: AsyncSession, job: dict) -> None:
    """检查该 task_run 是否所有评测已完成，完成则更新状态。"""
    task_id = job.get("task_id")
    task_run_id = job.get("task_run_id")
    # 批次 job 用 total_evaluations，旧版单条 job 用 total_jobs；若无则从 task_run 读取
    total_jobs = job.get("total_evaluations") or job.get("total_jobs")
    if not task_run_id:
        return
    if total_jobs is None:
        tr_res = await session.execute(select(TaskRun).where(TaskRun.id == task_run_id))
        tr = tr_res.scalar_one_or_none()
        total_jobs = tr.total_jobs if tr and tr.total_jobs is not None else None
    if total_jobs is None:
        return
    from sqlalchemy import func

    ev_cnt_result = await session.execute(
        select(func.count()).select_from(Evaluation).where(
            Evaluation.task_run_id == task_run_id
        )
    )
    ce_cnt_result = await session.execute(
        select(func.count()).select_from(ComparisonEvaluation).where(
            ComparisonEvaluation.task_run_id == task_run_id
        )
    )
    ev_cnt = ev_cnt_result.scalar()
    ce_cnt = ce_cnt_result.scalar()
    completed = int(ev_cnt or 0) + int(ce_cnt or 0)
    total_jobs = int(total_jobs)
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
            print(f"[Worker] 任务 {task_id} 已完成 ({completed}/{total_jobs})，已更新为 completed")
            from agentarena.services.task_run_elo_service import recompute_task_run_elo

            await recompute_task_run_elo(session, task_id, task_run_id)
    elif completed > 0 or total_jobs > 0:
        print(f"[Worker] [完成检查] task_run={task_run_id} 进度 {completed}/{total_jobs}，等待更多评测")


async def _process_agent_job(session: AsyncSession, job: dict) -> bool:
    """Process single agent evaluation job."""
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
            # 递归查找 HTTPStatusError：支持 __cause__/__context__、tenacity RetryError
            def find_http_err(ex: BaseException | None) -> HTTPStatusError | None:
                if ex is None:
                    return None
                if isinstance(ex, HTTPStatusError) and getattr(ex, "response", None) is not None:
                    return ex
                for attr in ("__cause__", "__context__"):
                    child = getattr(ex, attr, None)
                    if child and child is not ex:
                        found = find_http_err(child)
                        if found:
                            return found
                if isinstance(ex, RetryError) and getattr(ex, "last_attempt", None) is not None:
                    la = ex.last_attempt
                    # tenacity Attempt 或 asyncio.Future：exception() 返回原始异常
                    if hasattr(la, "exception") and callable(getattr(la, "exception")):
                        try:
                            inner = la.exception()
                            return find_http_err(inner) if inner else None
                        except Exception:
                            pass
                    if hasattr(la, "result") and callable(getattr(la, "result")):
                        try:
                            la.result()
                        except Exception as inner:
                            return find_http_err(inner)
                return None

            orig = find_http_err(e)
            if orig is not None and getattr(orig, "response", None) is not None:
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
    # 使用 limit(1) 避免多 Worker 并发时重复行导致 scalar_one_or_none 报错
    lb_result = await session.execute(
        select(Leaderboard)
        .where(
            Leaderboard.task_id == task_id,
            Leaderboard.task_run_id == task_run_id,
            Leaderboard.agent_version_id == agent_version_id,
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
            agent_name=agent_name,
            agent_version_id=agent_version_id,
            comparison_model_type=None,
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

    await _check_task_run_completion(session, job)
    return True


async def run_worker():
    """Main worker loop."""
    logging.basicConfig(
        level=logging.WARNING,
        format="[%(levelname)s] %(name)s: %(message)s",
    )
    settings = get_settings()
    r = redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.ping()
        print(
            f"[Worker] Redis OK, polling {EVALUATION_QUEUE} @ {settings.redis_host}:{settings.redis_port}/{settings.redis_db}; "
            f"DLQ={EVALUATION_QUEUE_DLQ}"
        )
    except Exception as e:
        print(f"[Worker] Redis ping FAILED: {e}")
        print(f"[Worker] 检查 Redis 配置（密码含 @ 等特殊字符需正确编码）、网络连通性")
        import sys
        sys.exit(1)

    from agentarena.core.llm_probe import log_llm_judge_startup_probe

    await log_llm_judge_startup_probe(service_name="Worker")

    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    host = socket.gethostname() or "unknown-host"
    worker_id = f"w_{uuid.uuid4().hex[:12]}"
    runtime = WorkerRuntimeState(worker_id=worker_id, hostname=host, pid=os.getpid())
    print(f"[Worker] worker_id={worker_id}（监控页 /api/workers/monitor 按此 ID 展示）")
    stop_hb = asyncio.Event()
    hb_task = asyncio.create_task(_heartbeat_loop(r, runtime, stop_hb))

    try:
        while True:
            try:
                await runtime.mark_idle()
                result = await r.blpop(EVALUATION_QUEUE, timeout=5)
                if result is None:
                    continue
                _, job_str = result
                try:
                    job = json.loads(job_str)
                except json.JSONDecodeError as je:
                    print(f"[ERROR] 主队列任务 JSON 无效，已写入 DLQ: {je}")
                    try:
                        await push_evaluation_job_dlq(
                            r,
                            reason="json_decode_error",
                            message=str(je),
                            raw_body=job_str,
                            worker_id=worker_id,
                        )
                    except Exception as dlq_e:
                        print(f"[ERROR] 写入 DLQ 失败，该条已从主队列移除且未备份: {dlq_e}")
                    continue
                if not isinstance(job, dict):
                    print(f"[ERROR] 主队列任务 JSON 非对象 (type={type(job).__name__})，已写入 DLQ")
                    try:
                        await push_evaluation_job_dlq(
                            r,
                            reason="job_not_object",
                            message=type(job).__name__,
                            raw_body=job_str,
                            worker_id=worker_id,
                        )
                    except Exception as dlq_e:
                        print(f"[ERROR] 写入 DLQ 失败: {dlq_e}")
                    continue
                print("[Worker] Processing job", job.get("id", job))
                await runtime.mark_busy_job(job)
                async with async_session() as session:
                    try:
                        await process_job(session, job, runtime)
                        await session.commit()
                    except Exception as e:
                        await session.rollback()
                        print(f"[ERROR] Job failed: {e}")
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[ERROR] Worker error: {e}")
                await asyncio.sleep(5)
    finally:
        stop_hb.set()
        await hb_task


def main():
    asyncio.run(run_worker())
