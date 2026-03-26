"""
从 Langfuse 读取 Agent 关联的 Prompt 文件。

host、public_key、secret_key 来自全局配置（.env / Nacos）：
  AGENTARENA_LANGFUSE_HOST
  AGENTARENA_LANGFUSE_PUBLIC_KEY
  AGENTARENA_LANGFUSE_SECRET_KEY

Agent 的 config_json.langfuse 仅保留可选覆盖：
{
  "langfuse": {
    "environment": "production",  // 可选
    "prompt_ids": ["prompt-a", "prompt-b"]  // 可选，不指定则列出全部
  }
}
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

try:
    from langfuse import Langfuse
except ImportError:
    Langfuse = None  # type: ignore[misc, assignment]


def _extract_prompt_content(prompt_obj: Any) -> str:
    """从 Langfuse prompt 对象提取可读文本内容。"""
    if prompt_obj is None:
        return ""
    raw = getattr(prompt_obj, "__dict__", None) or {}
    if hasattr(prompt_obj, "model_dump"):
        raw = prompt_obj.model_dump()
    elif hasattr(prompt_obj, "dict"):
        raw = prompt_obj.dict()
    if isinstance(prompt_obj, dict):
        raw = prompt_obj

    # prompt 字段可能是 string 或 messages 数组
    prompt_field = raw.get("prompt") or raw.get("content")
    if isinstance(prompt_field, str):
        return prompt_field.strip()

    if isinstance(prompt_field, list):
        parts: list[str] = []
        for msg in prompt_field:
            if isinstance(msg, dict):
                content = msg.get("content") or msg.get("text") or str(msg)
            elif hasattr(msg, "content"):
                content = getattr(msg, "content", "")
            else:
                content = str(msg)
            if content:
                parts.append(str(content).strip())
        return "\n---\n".join(parts) if parts else ""

    return str(prompt_field) if prompt_field else ""


def create_langfuse_client(
    host: str,
    public_key: str,
    secret_key: str,
    environment: Optional[str] = None,
) -> Optional["Langfuse"]:
    """根据配置创建 Langfuse 客户端。"""
    if Langfuse is None:
        logger.warning("langfuse 未安装，跳过 Langfuse 集成")
        return None
    if not (host and public_key and secret_key):
        return None
    host = str(host).strip()
    if not host.startswith(("http://", "https://")):
        host = f"https://{host}"
    try:
        kwargs: dict[str, Any] = {
            "public_key": public_key.strip(),
            "secret_key": secret_key.strip(),
            "host": host,
        }
        if environment:
            kwargs["environment"] = str(environment).strip()
        return Langfuse(**kwargs)
    except Exception as e:
        logger.warning("创建 Langfuse 客户端失败: %s", e)
        return None


def get_langfuse_config_from_agent(config_json: Optional[str] | dict) -> Optional[dict[str, Any]]:
    """
    解析 Agent 的 Langfuse 配置。host/public_key/secret_key 来自全局配置，
    Agent 仅提供 environment 与 prompt_ids。返回 None 表示全局未配置或 Agent 未启用。
    """
    from agentarena.core.config import get_settings

    settings = get_settings()
    host = (settings.langfuse_host or "").strip()
    pk = (settings.langfuse_public_key or "").strip()
    sk = (settings.langfuse_secret_key or "").strip()
    if not (host and pk and sk):
        return None

    # Agent 未配置 langfuse 区块则不启用
    if config_json is None:
        return None
    if isinstance(config_json, str):
        import json
        try:
            config_json = json.loads(config_json)
        except Exception:
            return None
    if not isinstance(config_json, dict):
        return None
    lf = config_json.get("langfuse")
    if not lf or not isinstance(lf, dict):
        return None

    env_val = (lf.get("environment") or "").strip() or None
    prompt_ids = lf.get("prompt_ids") or lf.get("promptIds") or []

    return {
        "host": host,
        "public_key": pk,
        "secret_key": sk,
        "environment": env_val,
        "prompt_ids": prompt_ids,
    }


def fetch_prompts_for_agent(config_json: Optional[str] | dict) -> list[dict[str, Any]]:
    """
    根据 Agent 的 Langfuse 配置，拉取关联的 Prompt 列表。

    Returns:
        list of {prompt_id, content, version, content_preview}
        content_preview 为前 500 字摘要，用于报告展示
    """
    cfg = get_langfuse_config_from_agent(config_json)
    if not cfg:
        return []

    client = create_langfuse_client(
        host=cfg["host"],
        public_key=cfg["public_key"],
        secret_key=cfg["secret_key"],
        environment=cfg.get("environment"),
    )
    if not client:
        return []

    prompt_ids = cfg.get("prompt_ids") or []
    if isinstance(prompt_ids, str):
        prompt_ids = [p.strip() for p in prompt_ids.split(",") if p.strip()]

    results: list[dict[str, Any]] = []

    try:
        if prompt_ids:
            for pid in prompt_ids:
                if not pid:
                    continue
                try:
                    obj = client.get_prompt(pid)
                    content = _extract_prompt_content(obj)
                    version = getattr(obj, "version", None) or getattr(obj, "label", "default")
                    if isinstance(version, (int, float)):
                        version = str(int(version))
                    version = str(version) if version else "default"
                    preview = content[:500] + ("…" if len(content) > 500 else "")
                    results.append({
                        "prompt_id": pid,
                        "content": content,
                        "version": version,
                        "content_preview": preview,
                    })
                except Exception as e:
                    logger.warning("拉取 Langfuse prompt %s 失败: %s", pid, e)
        else:
            # 未指定 prompt_ids 时，列出全部（参考 credify LangfusePromptSource.list_prompts）
            response = client.api.prompts.list(limit=50)
            items = getattr(response, "data", None)
            if items is None:
                payload = getattr(response, "__dict__", {}) or {}
                if hasattr(response, "model_dump"):
                    payload = response.model_dump()
                items = payload.get("data") or payload.get("results")
            if not items:
                return results
            for meta in items:
                meta_dict = meta if isinstance(meta, dict) else getattr(meta, "__dict__", {}) or {}
                if hasattr(meta, "model_dump"):
                    meta_dict = meta.model_dump()
                pid = meta_dict.get("name")
                if not pid:
                    continue
                try:
                    obj = client.get_prompt(pid, version=meta_dict.get("version"))
                    content = _extract_prompt_content(obj)
                    version = getattr(obj, "version", None) or meta_dict.get("version", "default")
                    preview = content[:500] + ("…" if len(content) > 500 else "")
                    results.append({
                        "prompt_id": pid,
                        "content": content,
                        "version": str(version) if version else "default",
                        "content_preview": preview,
                    })
                except Exception as e:
                    logger.warning("拉取 Langfuse prompt %s 失败: %s", pid, e)
    except Exception as e:
        logger.warning("Langfuse list/fetch 失败: %s", e)

    return results


__all__ = [
    "create_langfuse_client",
    "get_langfuse_config_from_agent",
    "fetch_prompts_for_agent",
]
