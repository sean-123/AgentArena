"""Redis keys and helpers for distributed worker presence / monitoring."""

WORKER_STATE_KEY_PREFIX = "agentarena:worker:state:"
# 心跳间隔约 15s，TTL 需大于间隔以便短暂阻塞时不被误判离线
WORKER_STATE_TTL_SEC = 60


def worker_state_redis_key(worker_id: str) -> str:
    return f"{WORKER_STATE_KEY_PREFIX}{worker_id}"
