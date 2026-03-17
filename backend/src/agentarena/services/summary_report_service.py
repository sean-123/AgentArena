"""
任务总结报告服务。

聚合任务中各条评测的 pros、cons、optimization，提取高频优缺点，
并将优化建议分类为：回答修改、提示词优化、RAG 优化、Agent 开发优化。
同时生成整批次汇总与 Agent 开发建议。
"""

import re
from collections import Counter
from typing import Any

PROMPT_KEYWORDS = ("提示词", "prompt", "系统提示", "system prompt", "指令", "指令词", "角色设定", "人设", "system message")
RAG_KEYWORDS = ("rag", "检索", "知识库", "上下文", "文档", "knowledge", "向量", "embedding", "索引")
# Agent 开发相关：模型、推理、工具、架构等
DEVELOPMENT_KEYWORDS = (
    "model", "模型", "temperature", "温度", "推理", "reasoning", "chain", "链路",
    "tool", "工具", "function", "agent", "架构", "design", "设计", "开发", "优化",
    "思维链", "cot", "few-shot", "few shot", "示例", "system", "超参",
)


def _split_bullet_items(text: str | None) -> list[str]:
    """将 pros/cons/optimization 文本拆分为独立条目（支持换行、•、-、数字编号）。"""
    if not text or not str(text).strip():
        return []
    raw = str(text).strip()
    # 按换行拆分
    lines = re.split(r"[\r\n]+", raw)
    items: list[str] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # 去除常见前缀：• - * · 1. 2. 等
        line = re.sub(r"^[\s\-\*·•\d]+[.、.)\]]*\s*", "", line)
        line = line.strip()
        if line and len(line) >= 2:
            items.append(line)
    return items


def _categorize_optimization(item: str) -> str:
    """将优化建议分类：answer（回答修改）、prompt（提示词）、rag（RAG）、development（Agent 开发）。"""
    lower = item.lower()
    # 先匹配更具体的类型：prompt、rag 优先于 development
    for kw in PROMPT_KEYWORDS:
        if kw.lower() in lower or kw in item:
            return "prompt"
    for kw in RAG_KEYWORDS:
        if kw.lower() in lower or kw in item:
            return "rag"
    for kw in DEVELOPMENT_KEYWORDS:
        if kw.lower() in lower or (kw in item and len(kw) >= 2):
            return "development"
    return "answer"


def _build_agent_development_suggestions(
    opt_development: list[str],
    opt_prompt: list[str],
    opt_rag: list[str],
    opt_answer: list[str],
) -> list[str]:
    """
    从各类优化建议中提炼 Agent 开发优化建议，形成可执行的开发指导。
    按优先级：架构/模型 > 提示词 > RAG > 回答质量。
    """
    suggestions: list[str] = []
    seen: set[str] = set()

    def add(s: str) -> None:
        s = s.strip()
        if s and s not in seen:
            seen.add(s)
            suggestions.append(s)

    for item in opt_development:
        add(f"【架构/模型】{item}")
    for item in opt_prompt:
        add(f"【提示词】{item}")
    for item in opt_rag:
        add(f"【RAG/知识库】{item}")
    # 回答修改中与开发相关的归纳为回答质量优化
    for item in opt_answer:
        add(f"【回答质量】{item}")

    return suggestions


def build_summary(
    evaluations: list[dict[str, Any]],
    top_n: int = 10,
) -> dict[str, Any]:
    """
    根据评测列表构建总结报告。

    Args:
        evaluations: 每条含 agent_version_id, pros, cons, optimization
        top_n: 各类别取前 N 个高频项

    Returns:
        {
            by_agent: { agent_version_id: { pros, cons, optimization } },
            overall: { top_pros, top_cons, optimizations: { answer, prompt, rag } }
        }
    """
    by_agent: dict[str, dict[str, Any]] = {}
    all_pros: list[str] = []
    all_cons: list[str] = []
    all_opt_items: list[tuple[str, str]] = []  # (item, category)

    for ev in evaluations:
        av_id = ev.get("agent_version_id", "")
        if av_id not in by_agent:
            by_agent[av_id] = {"pros_counter": Counter(), "cons_counter": Counter(), "opt_items": []}

        pros_items = _split_bullet_items(ev.get("pros"))
        cons_items = _split_bullet_items(ev.get("cons"))
        opt_items = _split_bullet_items(ev.get("optimization"))

        for p in pros_items:
            by_agent[av_id]["pros_counter"][p] += 1
            all_pros.append(p)
        for c in cons_items:
            by_agent[av_id]["cons_counter"][c] += 1
            all_cons.append(c)
        for o in opt_items:
            cat = _categorize_optimization(o)
            by_agent[av_id]["opt_items"].append({"text": o, "category": cat})
            all_opt_items.append((o, cat))

    # 按 Agent 汇总
    agent_summaries: dict[str, dict[str, Any]] = {}
    for av_id, data in by_agent.items():
        top_p = data["pros_counter"].most_common(top_n)
        top_c = data["cons_counter"].most_common(top_n)
        opt_by_cat: dict[str, list[str]] = {"answer": [], "prompt": [], "rag": [], "development": []}
        seen_opt: set[str] = set()
        for x in data["opt_items"]:
            t, cat = x["text"], x["category"]
            if t not in seen_opt:
                seen_opt.add(t)
                if cat not in opt_by_cat:
                    opt_by_cat[cat] = []
                opt_by_cat[cat].append(t)
        agent_summaries[av_id] = {
            "top_pros": [{"text": t, "count": c} for t, c in top_p],
            "top_cons": [{"text": t, "count": c} for t, c in top_c],
            "optimizations": {
                "answer": opt_by_cat.get("answer", []),
                "prompt": opt_by_cat.get("prompt", []),
                "rag": opt_by_cat.get("rag", []),
                "development": opt_by_cat.get("development", []),
            },
        }

    # 全局汇总
    pros_counter = Counter(all_pros)
    cons_counter = Counter(all_cons)
    opt_answer: list[str] = []
    opt_prompt: list[str] = []
    opt_rag: list[str] = []
    opt_development: list[str] = []
    seen_opt_global: set[str] = set()
    for item, cat in all_opt_items:
        if item not in seen_opt_global:
            seen_opt_global.add(item)
            if cat == "answer":
                opt_answer.append(item)
            elif cat == "prompt":
                opt_prompt.append(item)
            elif cat == "rag":
                opt_rag.append(item)
            elif cat == "development":
                opt_development.append(item)

    # 生成 Agent 开发优化建议：合并 development、prompt、rag 中与 Agent 架构/设计相关的内容
    agent_development_suggestions = _build_agent_development_suggestions(
        opt_development, opt_prompt, opt_rag, opt_answer
    )

    overall = {
        "top_pros": [{"text": t, "count": c} for t, c in pros_counter.most_common(top_n)],
        "top_cons": [{"text": t, "count": c} for t, c in cons_counter.most_common(top_n)],
        "optimizations": {
            "answer": opt_answer,
            "prompt": opt_prompt,
            "rag": opt_rag,
            "development": opt_development,
        },
        "agent_development_suggestions": agent_development_suggestions,
    }

    return {
        "by_agent": agent_summaries,
        "overall": overall,
    }
