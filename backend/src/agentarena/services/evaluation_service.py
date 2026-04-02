"""Evaluation service - dispatches jobs to Redis queue."""

import base64
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import redis.asyncio as redis

from agentarena.core.config import get_settings

EVALUATION_QUEUE = "agentarena:evaluation_queue"
EVALUATION_QUEUE_DLQ = "agentarena:evaluation_queue_dlq"
_MAX_DLQ_RAW_BYTES = 256 * 1024


def _chunked(items: list[Any], chunk_size: int) -> list[list[Any]]:
    """Split items into stable, non-empty chunks."""
    size = max(int(chunk_size or 1), 1)
    return [items[i : i + size] for i in range(0, len(items), size)]


async def push_evaluation_job_dlq(
    r: redis.Redis,
    *,
    reason: str,
    message: str,
    raw_body: str,
    worker_id: str | None = None,
) -> None:
    """Persist malformed queue payloads to a DLQ for later inspection."""
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
    ) -> dict[str, int]:
        """
        Dispatch evaluation work in small batches so a single agent can be
        consumed by multiple workers instead of one long-running worker.

        Returns both:
        - total_evaluations: total testcase * executor combinations
        - dispatched_jobs: actual Redis job count after chunking
        """
        from sqlalchemy import select
        from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
        from sqlalchemy.orm import sessionmaker

        from agentarena.models.agent import AgentVersion
        from agentarena.models.dataset import Testcase

        settings = get_settings()
        engine = create_async_engine(settings.database_url)
        async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        compare_models = [
            model for model in (compare_model_ids or []) if model in ("doubao", "qwen", "deepseek")
        ]
        batch_size = max(int(settings.evaluation_batch_size or 1), 1)
        dispatched_jobs = 0

        async with async_session() as session:
            result = await session.execute(
                select(Testcase).where(Testcase.dataset_version_id == dataset_version_id)
            )
            testcases = list(result.scalars().all())

            av_configs: dict[str, dict[str, Any]] = {}
            av_result = await session.execute(
                select(AgentVersion).where(AgentVersion.id.in_(agent_version_ids))
            )
            for av in av_result.scalars().all():
                cfg: dict[str, Any] = {}
                if av.config_json:
                    try:
                        cfg = json.loads(av.config_json)
                    except json.JSONDecodeError:
                        cfg = {}
                av_configs[av.id] = cfg

            total_evaluations = len(testcases) * (len(agent_version_ids) + len(compare_models))
            default_persona_cfg = av_configs.get(agent_version_ids[0], {}) if agent_version_ids else {}
            testcase_chunks = _chunked(testcases, batch_size)
            r = await self._get_redis()

            for av_id in agent_version_ids:
                cfg = av_configs.get(av_id, {})
                for chunk_index, testcase_chunk in enumerate(testcase_chunks, start=1):
                    job = {
                        "id": f"job_{uuid.uuid4().hex[:12]}",
                        "job_type": "agent_batch",
                        "task_id": task_id,
                        "task_run_id": task_run_id,
                        "total_evaluations": total_evaluations,
                        "agent_version_id": av_id,
                        "batch_index": chunk_index,
                        "batch_count": len(testcase_chunks),
                        "testcases": [
                            {
                                "testcase_id": tc.id,
                                "question": tc.question or "",
                                "persona_question": tc.persona_question or None,
                                "persona": cfg.get("persona"),
                                "key_points": tc.key_points,
                            }
                            for tc in testcase_chunk
                        ],
                    }
                    await r.rpush(EVALUATION_QUEUE, json.dumps(job, ensure_ascii=False))
                    dispatched_jobs += 1

            for model_type in compare_models:
                for chunk_index, testcase_chunk in enumerate(testcase_chunks, start=1):
                    job = {
                        "id": f"job_{uuid.uuid4().hex[:12]}",
                        "job_type": "comparison_batch",
                        "task_id": task_id,
                        "task_run_id": task_run_id,
                        "total_evaluations": total_evaluations,
                        "compare_model": model_type,
                        "batch_index": chunk_index,
                        "batch_count": len(testcase_chunks),
                        "testcases": [
                            {
                                "testcase_id": tc.id,
                                "question": tc.question or "",
                                "persona_question": tc.persona_question or None,
                                "persona": default_persona_cfg.get("persona"),
                                "key_points": tc.key_points,
                            }
                            for tc in testcase_chunk
                        ],
                    }
                    await r.rpush(EVALUATION_QUEUE, json.dumps(job, ensure_ascii=False))
                    dispatched_jobs += 1

        if dispatched_jobs > 0:
            import logging

            logging.getLogger("agentarena").info(
                "[Dispatch] task_id=%s batch_size=%s dispatched_jobs=%s total_evaluations=%s",
                task_id,
                batch_size,
                dispatched_jobs,
                total_evaluations,
            )

        await engine.dispose()
        return {
            "total_evaluations": total_evaluations,
            "dispatched_jobs": dispatched_jobs,
        }

    async def remove_jobs_for_task(self, task_id: str) -> int:
        """
        Remove all queued jobs for a given task from Redis.

        Returns the number of removed jobs.
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
                remaining.append(job_str)
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
