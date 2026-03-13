"""Run agent queries via HTTP."""

import json
import os
import time
from pathlib import Path
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

# 模块加载时即加载 .env，确保 AGENT_TW_SERVICE_TOKEN 等对 os.environ 可用
def _load_dotenv_now() -> None:
    for base in (Path(__file__).resolve().parent.parent.parent.parent, Path.cwd()):
        env_path = base / ".env"
        if env_path.exists():
            from dotenv import load_dotenv
            load_dotenv(env_path)
            return


_load_dotenv_now()


def _ensure_env_loaded() -> None:
    if os.environ.get("AGENT_TW_SERVICE_TOKEN"):
        return
    for base in (Path(__file__).resolve().parent.parent.parent.parent, Path.cwd()):
        env_path = base / ".env"
        if env_path.exists():
            from dotenv import load_dotenv
            load_dotenv(env_path)
            break


def _is_jwt_like(s: str | None) -> bool:
    """
    识别被误填到 auth_token_env 的 token 值：env 名如 AGENT_TW_SERVICE_TOKEN 仅 22 字符，
    JWT 通常 >100 字符且含两段点。满足任一条件即视为 token。
    """
    if not isinstance(s, str):
        return False
    v = s.strip()
    # 长度>50 且含至少两段点 → 视为 JWT（env 名无此特征）
    return len(v) > 50 and v.count(".") >= 2


def _resolve_auth_token(
    auth_token: str | None = None,
    auth_token_env: str | None = None,
) -> str | None:
    """
    解析 Bearer token（均来自任务所属 Agent 的 config_json）：
    - auth_token：Agent 中直接配置的 token 值，直接使用
    - auth_token_env：Agent 中配置的环境变量名，从 os.environ 读取实际 token
      若 auth_token_env 被误填为 JWT 值（eyJ 开头），则直接使用该值作为 token（兼容错误配置）
    """
    _ensure_env_loaded()
    if auth_token and (t := auth_token.strip()):
        return t
    if auth_token_env:
        v = auth_token_env.strip()
        # 兼容：auth_token_env 被误填为 JWT/token 值时，直接使用（env 名如 AGENT_TW_SERVICE_TOKEN 仅 22 字符）
        if _is_jwt_like(v):
            return v
        # 视为环境变量名，从 os.environ 读取
        token = (os.environ.get(v) or "").strip() or None
        # 兜底：env 查找失败且值很长（>50 字符）时，视为误填的 token 值，直接使用
        # （env 名如 AGENT_TW_SERVICE_TOKEN 仅 22 字符，JWT 通常 200+ 字符）
        if not token and len(v) > 50:
            return v
        if not token:
            import sys
            print(
                f"[WARN] auth_token_env={v[:30]!r}... 未在 os.environ 中找到，请确保 backend/.env 含该变量",
                file=sys.stderr,
            )
        return token
    return None


def _get_stream_text(obj: Any) -> str:
    """从 SSE chunk 提取文本，支持 type=text 且 content.text 等格式。"""
    if not isinstance(obj, dict):
        return ""
    if obj.get("type") == "text" and "content" in obj:
        cnt = obj["content"]
        if isinstance(cnt, dict) and "text" in cnt:
            return str(cnt["text"] or "")
    for key in ("content", "text", "data"):
        if key in obj and obj[key]:
            val = obj[key]
            if isinstance(val, str):
                return val
            if isinstance(val, dict) and "text" in val:
                return str(val.get("text", ""))
    return ""


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
async def call_agent(
    base_url: str,
    endpoint: str = "/chat",
    question: str = "",
    question_key: str = "question",
    extra_payload: dict[str, Any] | None = None,
    timeout: float = 60.0,
    auth_token: str | None = None,
    auth_token_env: str | None = None,
    stream: bool = False,
) -> tuple[str, float]:
    """
    Call agent HTTP API, return (answer, latency_seconds).
    Uses Authorization: Bearer when auth_token or auth_token_env is configured.
    When stream=True, parses SSE/stream response (data: {...}) and concatenates text.
    """
    url = f"{base_url.rstrip('/')}{endpoint}"
    payload = {question_key: question}
    if extra_payload:
        payload.update(extra_payload)

    headers: dict[str, str] = {}
    token = _resolve_auth_token(auth_token=auth_token, auth_token_env=auth_token_env)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    start = time.perf_counter()
    async with httpx.AsyncClient(timeout=timeout, headers=headers or None) as client:
        if stream:
            parts: list[str] = []
            async with client.stream("POST", url, json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line or line == "data: [DONE]":
                        continue
                    if line.startswith("data: "):
                        line = line[6:]
                    try:
                        obj = json.loads(line)
                        text = _get_stream_text(obj)
                        if text:
                            parts.append(text)
                    except json.JSONDecodeError:
                        continue
            answer = "".join(parts)
        else:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            answer = _extract_answer(data)
    latency = time.perf_counter() - start
    return answer, latency


def _extract_answer(data: dict | list) -> str:
    """Extract answer text from response."""
    if isinstance(data, list):
        return " ".join(str(x) for x in data)
    for key in ("answer", "response", "text", "content", "output"):
        if key in data and data[key]:
            val = data[key]
            if isinstance(val, str):
                return val
            if isinstance(val, dict) and "text" in val:
                return val["text"]
            return str(val)
    return str(data)
