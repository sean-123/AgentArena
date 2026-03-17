"""
调用 DouBao、Qwen、DeepSeek 等通用大模型（OpenAI SDK 兼容接口）。
用于对比 Agent 与通用大模型的回答质量。
"""

import time
from typing import Literal

from openai import AsyncOpenAI

from agentarena.core.config import get_settings

ModelType = Literal["doubao", "qwen", "deepseek"]


def _get_client_for_model(model_type: ModelType) -> tuple[AsyncOpenAI, str] | None:
    """获取指定模型的 OpenAI 客户端与 model 名。未配置 API key 时返回 None。"""
    settings = get_settings()
    if model_type == "doubao":
        if not (settings.doubao_api_key and settings.doubao_model):
            return None
        return (
            AsyncOpenAI(
                api_key=settings.doubao_api_key,
                base_url=settings.doubao_base_url,
            ),
            settings.doubao_model,
        )
    if model_type == "qwen":
        if not settings.qwen_api_key:
            return None
        return (
            AsyncOpenAI(
                api_key=settings.qwen_api_key,
                base_url=settings.qwen_base_url,
            ),
            settings.qwen_model,
        )
    if model_type == "deepseek":
        if not settings.deepseek_api_key:
            return None
        return (
            AsyncOpenAI(
                api_key=settings.deepseek_api_key,
                base_url=settings.deepseek_base_url,
            ),
            settings.deepseek_model,
        )
    return None


async def call_comparison_model(
    model_type: ModelType,
    question: str,
) -> tuple[str, float]:
    """
    调用对比用的通用大模型，返回 (answer, latency_seconds)。
    若未配置或调用失败，返回 ([ERROR] 错误信息, 0)。
    """
    client_info = _get_client_for_model(model_type)
    if not client_info:
        return f"[ERROR] 未配置 {model_type} 的 API Key 或模型", 0.0

    client, model = client_info
    start = time.perf_counter()
    try:
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": question}],
            temperature=0.7,
        )
        answer = (resp.choices[0].message.content or "").strip()
        latency = time.perf_counter() - start
        return answer, latency
    except Exception as e:
        err = str(e)
        try:
            from httpx import HTTPStatusError
            if isinstance(e, HTTPStatusError) and getattr(e, "response", None) is not None:
                r = e.response
                err = f"HTTP {r.status_code} - {(r.text or '')[:200]}"
        except Exception:
            pass
        latency = time.perf_counter() - start
        return f"[ERROR] {model_type}: {err}", latency
