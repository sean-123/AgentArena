"""
启动阶段对 LLM Judge（OpenAI 兼容接口）做连通性探测。
在 Nacos / .env 已合并进 os.environ 之后调用；使用 get_settings() 读取 AGENTARENA_*。
"""

from __future__ import annotations

from openai import AsyncOpenAI


def mask_api_key(key: str, head: int = 6, tail: int = 4) -> str:
    k = (key or "").strip()
    if not k:
        return "(未配置)"
    if len(k) <= head + tail:
        return "***"
    return f"{k[:head]}...{k[-tail:]}"


async def probe_llm_judge_connectivity(
    api_key: str,
    base_url: str,
    model: str,
    timeout: float = 30.0,
) -> tuple[bool, str]:
    """
    使用最小 chat.completions 请求探测接口可用性（鉴权 + 路由 + 模型）。
    返回 (是否成功, 人类可读说明)。
    """
    api_key = (api_key or "").strip()
    if not api_key:
        return False, "未配置 AGENTARENA_OPENAI_API_KEY"

    base_url = (base_url or "").strip() or "https://api.openai.com/v1"
    model = (model or "").strip() or "gpt-4o-mini"

    try:
        client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=timeout)
        await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
            temperature=0,
        )
        return True, "chat.completions 最小请求成功"
    except Exception as e:
        name = type(e).__name__
        msg = str(e).strip() or name
        # 避免日志过长
        if len(msg) > 400:
            msg = msg[:400] + "..."
        return False, f"{name}: {msg}"


def _config_source_label() -> str:
    from agentarena.core.nacos_loader import is_nacos_configured, was_nacos_config_merged

    if was_nacos_config_merged():
        return "配置来源：Nacos 已成功拉取并合并到本进程环境变量（含 AGENTARENA_OPENAI_API_KEY 等）"
    if is_nacos_configured():
        return "配置来源：已配置 Nacos 地址但本次拉取未成功或未合并，LLM 相关变量来自本地 .env / 容器 environment"
    return "配置来源：本地 .env / 环境变量（未启用 Nacos 地址）"


async def log_llm_judge_startup_probe(service_name: str = "AgentArena") -> None:
    """
    刷新 Settings 缓存后读取 Key，发起一次连通性测试，结果打印到 stdout。
    Worker / API 启动成功并就绪后调用。
    """
    from agentarena.core.config import get_settings

    get_settings.cache_clear()
    settings = get_settings()
    src = _config_source_label()

    key = (settings.openai_api_key or "").strip()
    masked = mask_api_key(key)

    print(f"[{service_name}] LLM Judge 启动检查 — {src}")

    if not key:
        print(
            f"[{service_name}] LLM Judge 连通性测试已跳过：未检测到 AGENTARENA_OPENAI_API_KEY（摘要: {masked}）。"
            " 评测将无 pros/cons/优化建议。"
        )
        return

    print(
        f"[{service_name}] 使用 AGENTARENA_OPENAI_API_KEY 摘要={masked}，"
        f"base_url={settings.openai_base_url}，model={settings.llm_model}，正在请求连通性探测…"
    )

    ok, detail = await probe_llm_judge_connectivity(
        key,
        settings.openai_base_url,
        settings.llm_model,
    )

    if ok:
        print(
            f"[{service_name}] LLM Judge 连通性测试【通过】{detail}。"
            f" base_url={settings.openai_base_url} model={settings.llm_model}"
        )
    else:
        print(
            f"[{service_name}] LLM Judge 连通性测试【未通过】{detail}。"
            " 请检查 Nacos 中的 AGENTARENA_OPENAI_API_KEY / AGENTARENA_OPENAI_BASE_URL / AGENTARENA_LLM_MODEL 是否与网关一致。"
        )
