"""Evaluation service - dispatches jobs to Redis queue."""

import base64
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as redis

from agentarena.core.config import get_settings

EVALUATION_QUEUE = "agentarena:evaluation_queue"
# 主队列 JSON 无法解析或结构非法时写入，便于人工修复后重新 RPUSH 到 EVALUATION_QUEUE
EVALUATION_QUEUE_DLQ = "agentarena:evaluation_queue_dlq"
_MAX_DLQ_RAW_BYTES = 256 * 1024


async def push_evaluation_job_dlq(
    r: redis.Redis,
    *,
    reason: str,
    message: str,
    raw_body: str,
    worker_id: str | None = None,
) -> None:
    """将无法处理的主队列条目写入 DLQ（payload base64，超长截断）。"""
    raw_bytes = raw_body.encode("utf-8", errors="replace")
    truncated = len(raw_bytes) > _MAX_DLQ_RAW_BYTES
    if truncated:
        raw_bytes = raw_bytes[:_MAX_DLQ_RAW_BYTES]
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "message": message,
        "payload_b64": base64.b64encode(raw_bytes).decode("ascii"),
        "payload_truncated": truncated,
    }
    if worker_id:
        entry["worker_id"] = worker_id
    await r.rpush(EVALUATION_QUEUE_DLQ, json.dumps(entry, ensure_ascii=False))


class EvaluationService:
    """Dispatch and manage evaluation jobs."""

    def __init__(self):
        self._redis: Optional[redis.Redis] = None

    async def _get_redis(self) -> redis.Redis:
        if self._redis is None:
            settings = get_settings()
            self._redis = redis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    async def dispatch_evaluation_jobs(
        self,
        task_id: str,
        task_run_id: str,
        dataset_version_id: str,
        agent_version_ids: list[str],
        compare_model_ids: list[str] | None = None,
    ) -> int:
        """
        按批次分发任务：每个 Agent 一个 batch job，每个对比模型一个 batch job。
        - 单个 Agent 无对比：1 个 job，由单个 Worker 顺序执行所有 testcase
        - 多 Agent 或多对比模型：多个 job，由不同 Worker 并行执行
        total_evaluations: 总评测条数（用于进度与完成判断）
        Returns: total_evaluations（用于 task_run.total_jobs 进度显示）
        """
        from sqlalchemy import select
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker
        from agentarena.core.config import get_settings
        from agentarena.models.dataset import Testcase
        from agentarena.models.agent import AgentVersion

        settings = get_settings()
        engine = create_async_engine(settings.database_url)
        async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        count = 0
        compare_models = [m for m in (compare_model_ids or []) if m in ("doubao", "qwen", "deepseek")]
        async with async_session() as session:
            result = await session.execute(
                select(Testcase).where(Testcase.dataset_version_id == dataset_version_id)
            )
            testcases = result.scalars().all()

            # 预加载各 agent_version 的 config（含 persona）
            av_configs: dict[str, dict] = {}
            av_result = await session.execute(
                select(AgentVersion).where(AgentVersion.id.in_(agent_version_ids))
            )
            for av in av_result.scalars().all():
                cfg = {}
                if av.config_json:
                    try:
                        cfg = json.loads(av.config_json)
                    except json.JSONDecodeError:
                        pass
                av_configs[av.id] = cfg

            # 总评测条数（用于 task_run 完成判断）
            total_evaluations = len(testcases) * len(agent_version_ids) + len(testcases) * len(compare_models)
            default_persona = av_configs.get(agent_version_ids[0], {}) if agent_version_ids else {}

            r = await self._get_redis()

            # 每个 Agent 一个 batch job，该 Worker 顺序执行该 Agent 的全部 testcase
            for av_id in agent_version_ids:
                cfg = av_configs.get(av_id, {})
                testcase_items = [
                    {
                        "testcase_id": tc.id,
                        "question": tc.question or "",
                        "persona_question": tc.persona_question or None,
                        "persona": cfg.get("persona"),
                        "key_points": tc.key_points,
                    }
                    for tc in testcases
                ]
                job = {
                    "id": f"job_{uuid.uuid4().hex[:12]}",
                    "job_type": "agent_batch",
                    "task_id": task_id,
                    "task_run_id": task_run_id,
                    "total_evaluations": total_evaluations,
                    "agent_version_id": av_id,
                    "testcases": testcase_items,
                }
                await r.rpush(EVALUATION_QUEUE, json.dumps(job, ensure_ascii=False))
                count += 1

            # 每个对比模型一个 batch job，由不同 Worker 并行执行
            for model_type in compare_models:
                testcase_items = [
                    {
                        "testcase_id": tc.id,
                        "question": tc.question or "",
                        "persona_question": tc.persona_question or None,
                        "persona": default_persona.get("persona"),
                        "key_points": tc.key_points,
                    }
                    for tc in testcases
                ]
                job = {
                    "id": f"job_{uuid.uuid4().hex[:12]}",
                    "job_type": "comparison_batch",
                    "task_id": task_id,
                    "task_run_id": task_run_id,
                    "total_evaluations": total_evaluations,
                    "compare_model": model_type,
                    "testcases": testcase_items,
                }
                await r.rpush(EVALUATION_QUEUE, json.dumps(job, ensure_ascii=False))
                count += 1

            if count > 0:
                import logging
                logging.getLogger("agentarena").info(
                    f"[Dispatch] task_id={task_id} 分发 {count} 个 batch job（每个 Agent/模型独立批次）"
                )
        return total_evaluations

    async def remove_jobs_for_task(self, task_id: str) -> int:
        """
        从 Redis 队列中移除该任务对应的所有 job。
        删除任务时调用，避免 Worker 继续处理已删除任务的 job。
        Returns: 移除的 job 数量。
        """
        r = await self._get_redis()
        try:
            all_jobs = await r.lrange(EVALUATION_QUEUE, 0, -1)
        except Exception:
            return 0
        remaining: list[str] = []
        removed = 0
        for job_str in all_jobs or []:
            try:
                job = json.loads(job_str)
                if job.get("task_id") == task_id:
                    removed += 1
                else:
                    remaining.append(job_str)
            except (json.JSONDecodeError, TypeError):
                remaining.append(job_str)  # 无法解析的保留
        if removed > 0:
            pipe = r.pipeline()
            pipe.delete(EVALUATION_QUEUE)
            if remaining:
                pipe.rpush(EVALUATION_QUEUE, *remaining)
            await pipe.execute()
            import logging
            logging.getLogger("agentarena").info(
                f"[Queue] task_id={task_id} removed {removed} jobs from {EVALUATION_QUEUE}"
            )
        return removed
