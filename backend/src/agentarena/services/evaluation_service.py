"""Evaluation service - dispatches jobs to Redis queue."""

import json
import uuid
from typing import Optional

import redis.asyncio as redis

from agentarena.core.config import get_settings

EVALUATION_QUEUE = "agentarena:evaluation_queue"


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
    ) -> int:
        """
        Create one job per (testcase, agent_version) and push to Redis queue.
        Returns count of jobs dispatched.
        每个 job 包含：question（规范问题）、persona_question（数据集预填）、persona（Agent 人设，用于 worker 动态生成）。
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

            r = await self._get_redis()
            total_jobs = len(testcases) * len(agent_version_ids)
            for tc in testcases:
                for av_id in agent_version_ids:
                    cfg = av_configs.get(av_id, {})
                    job = {
                        "id": f"job_{uuid.uuid4().hex[:12]}",
                        "task_id": task_id,
                        "task_run_id": task_run_id,
                        "total_jobs": total_jobs,
                        "testcase_id": tc.id,
                        "agent_version_id": av_id,
                        "question": tc.question or "",
                        "persona_question": tc.persona_question or None,
                        "persona": cfg.get("persona"),
                        "key_points": tc.key_points,
                    }
                    await r.rpush(EVALUATION_QUEUE, json.dumps(job, ensure_ascii=False))
                    count += 1
            if count > 0:
                import logging
                logging.getLogger("agentarena").info(
                    f"[Dispatch] task_id={task_id} pushed {count} jobs to {EVALUATION_QUEUE}"
                )
        return count
