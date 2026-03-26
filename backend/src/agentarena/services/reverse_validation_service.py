"""
通用大模型反向验证服务。

使用通用大模型的返回结果反向验证 Agent 的回复，识别要点缺失并给出优化建议。
"""

import json
from typing import Any

from openai import AsyncOpenAI

from agentarena.core.config import get_settings

REVERSE_VALIDATION_PROMPT = """你是一个专业的评测专家。请对比 Agent 的回答与通用大模型（{model_display_name}）的回答，针对同一问题的回答进行反向验证分析。

问题：{question}

Agent 的回答：
{agent_answer}

通用大模型（{model_display_name}）的回答：
{comparison_answer}

请分析并输出 JSON 格式，包含两个字段：
1. missing_points: Agent 回答中缺失或弱于通用大模型的要点（列表，每项一条，最多 5 条）
2. optimization_suggestions: 基于通用大模型回答，对 Agent 的优化建议（列表，每项一条，最多 5 条）

要求：全部使用中文，每条表述简洁明确。
输出格式示例：
{{"missing_points": ["要点1", "要点2"], "optimization_suggestions": ["建议1", "建议2"]}}
"""


async def build_reverse_validation(
    pairs: list[dict[str, Any]],
    max_pairs: int = 5,
) -> list[str]:
    """
    对 Agent 与通用大模型回答进行反向验证，生成要点缺失与优化建议。

    Args:
        pairs: 每项含 question, agent_answer, comparison_answer, model_display_name
        max_pairs: 最多分析的问答对数量，避免 LLM 调用过多

    Returns:
        汇总的要点缺失与优化建议列表
    """
    settings = get_settings()
    if not settings.openai_api_key or not pairs:
        return []

    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
    )

    missing_points: list[str] = []
    optimization_suggestions: list[str] = []
    seen_missing: set[str] = set()
    seen_opt: set[str] = set()

    def _truncate(s: str, max_len: int = 2000) -> str:
        if not s:
            return ""
        s = str(s).strip()
        return s if len(s) <= max_len else s[:max_len] + "…"

    for pair in pairs[:max_pairs]:
        question = _truncate(pair.get("question", ""), 500)
        agent_answer = _truncate(pair.get("agent_answer", ""), 1500)
        comparison_answer = _truncate(pair.get("comparison_answer", ""), 1500)
        model_display_name = pair.get("model_display_name", "通用大模型")

        if not agent_answer or not comparison_answer:
            continue

        prompt = REVERSE_VALIDATION_PROMPT.format(
            question=question,
            agent_answer=agent_answer,
            comparison_answer=comparison_answer,
            model_display_name=model_display_name,
        )
        try:
            resp = await client.chat.completions.create(
                model=settings.llm_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
            )
            text = (resp.choices[0].message.content or "").strip()
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(
                    l for l in lines if not l.startswith("```") and not l.endswith("```")
                )
            data = json.loads(text)
            for p in data.get("missing_points", []):
                p = str(p).strip()
                if p and p not in seen_missing:
                    seen_missing.add(p)
                    missing_points.append(p)
            for o in data.get("optimization_suggestions", []):
                o = str(o).strip()
                if o and o not in seen_opt:
                    seen_opt.add(o)
                    optimization_suggestions.append(o)
        except Exception:
            continue

    result: list[str] = []
    if missing_points:
        result.append("【Agent 回复要点缺失】")
        result.extend(missing_points[:8])
    if optimization_suggestions:
        result.append("【基于通用大模型的优化建议】")
        result.extend(optimization_suggestions[:8])
    return result
