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


def _truncate_answer(answer: str | None, max_len: int = 150) -> str:
    """回答截断，用于示例展示。"""
    if not answer:
        return ""
    s = str(answer).strip()
    return s if len(s) <= max_len else s[:max_len] + "…"


def _attach_examples(
    items_with_sources: dict[str, list[tuple[str, str]]],  # text -> [(question, answer), ...]
    top_items: list[tuple[str, int]],
    max_examples: int = 2,
) -> list[dict[str, Any]]:
    """为每个 top 项附加关联的问题与回答示例。"""
    out: list[dict[str, Any]] = []
    for text, count in top_items:
        examples: list[dict[str, str]] = []
        seen_qa: set[tuple[str, str]] = set()
        for q, a in items_with_sources.get(text, [])[:10]:
            qn = (q or "")[:200]
            an = _truncate_answer(a)
            key = (qn, an)
            if key not in seen_qa and qn and an:
                seen_qa.add(key)
                examples.append({"question": qn, "answer_snippet": an})
                if len(examples) >= max_examples:
                    break
        out.append({"text": text, "count": count, "examples": examples})
    return out


def build_summary(
    evaluations: list[dict[str, Any]],
    top_n: int = 10,
) -> dict[str, Any]:
    """
    根据评测列表构建总结报告。
    每条 evaluation 可含 question、answer 用于优缺点举例。

    Args:
        evaluations: 每条含 agent_version_id, pros, cons, optimization[, question, answer]
        top_n: 各类别取前 N 个高频项

    Returns:
        {
            by_agent: { agent_version_id: { top_pros, top_cons, optimizations } }，含 examples
            overall: { top_pros, top_cons, optimizations, quality_summaries }
        }
    """
    by_agent: dict[str, dict[str, Any]] = {}
    all_pros: list[str] = []
    all_cons: list[str] = []
    all_opt_items: list[tuple[str, str]] = []  # (item, category)
    # 全局 pros/cons -> [(question, answer)] 用于举例
    pros_examples: dict[str, list[tuple[str, str]]] = {}
    cons_examples: dict[str, list[tuple[str, str]]] = {}

    for ev in evaluations:
        av_id = ev.get("agent_version_id", "")
        question = ev.get("question") or ""
        answer = ev.get("answer")
        if av_id not in by_agent:
            by_agent[av_id] = {
                "pros_counter": Counter(),
                "cons_counter": Counter(),
                "opt_items": [],
                "pros_examples": {},
                "cons_examples": {},
            }

        pros_items = _split_bullet_items(ev.get("pros"))
        cons_items = _split_bullet_items(ev.get("cons"))
        opt_items = _split_bullet_items(ev.get("optimization"))

        for p in pros_items:
            by_agent[av_id]["pros_counter"][p] += 1
            all_pros.append(p)
            # 记录举例来源
            if question or answer:
                if p not in by_agent[av_id]["pros_examples"]:
                    by_agent[av_id]["pros_examples"][p] = []
                by_agent[av_id]["pros_examples"][p].append((question, answer))
                if p not in pros_examples:
                    pros_examples[p] = []
                pros_examples[p].append((question, answer))
        for c in cons_items:
            by_agent[av_id]["cons_counter"][c] += 1
            all_cons.append(c)
            if question or answer:
                if c not in by_agent[av_id]["cons_examples"]:
                    by_agent[av_id]["cons_examples"][c] = []
                by_agent[av_id]["cons_examples"][c].append((question, answer))
                if c not in cons_examples:
                    cons_examples[c] = []
                cons_examples[c].append((question, answer))
        for o in opt_items:
            cat = _categorize_optimization(o)
            by_agent[av_id]["opt_items"].append({"text": o, "category": cat})
            all_opt_items.append((o, cat))

    # 按 Agent 汇总，附带 examples
    agent_summaries: dict[str, dict[str, Any]] = {}
    for av_id, data in by_agent.items():
        top_p = data["pros_counter"].most_common(top_n)
        top_c = data["cons_counter"].most_common(top_n)
        agent_summaries[av_id] = {
            "top_pros": _attach_examples(data.get("pros_examples", {}), top_p),
            "top_cons": _attach_examples(data.get("cons_examples", {}), top_c),
        }
        opt_by_cat: dict[str, list[str]] = {"answer": [], "prompt": [], "rag": [], "development": []}
        seen_opt: set[str] = set()
        for x in data["opt_items"]:
            t, cat = x["text"], x["category"]
            if t not in seen_opt:
                seen_opt.add(t)
                if cat not in opt_by_cat:
                    opt_by_cat[cat] = []
                opt_by_cat[cat].append(t)
        agent_summaries[av_id]["optimizations"] = {
            "answer": opt_by_cat.get("answer", []),
            "prompt": opt_by_cat.get("prompt", []),
            "rag": opt_by_cat.get("rag", []),
            "development": opt_by_cat.get("development", []),
        }

    # 全局汇总，附带 examples
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

    top_pros_with_ex = _attach_examples(pros_examples, pros_counter.most_common(top_n))
    top_cons_with_ex = _attach_examples(cons_examples, cons_counter.most_common(top_n))
    q_qual, q_acc, q_exp = _build_quality_summaries(
        evaluations, top_pros_with_ex, top_cons_with_ex, {
            "answer": opt_answer,
            "prompt": opt_prompt,
            "rag": opt_rag,
            "development": opt_development,
        }
    )
    overall = {
        "top_pros": top_pros_with_ex,
        "top_cons": top_cons_with_ex,
        "optimizations": {
            "answer": opt_answer,
            "prompt": opt_prompt,
            "rag": opt_rag,
            "development": opt_development,
        },
        "agent_development_suggestions": agent_development_suggestions,
        "reply_quality_summary": q_qual,
        "info_accuracy_summary": q_acc,
        "reply_experience_suggestions": q_exp,
    }

    return {
        "by_agent": agent_summaries,
        "overall": overall,
    }


def _build_quality_summaries(
    evaluations: list[dict[str, Any]],
    top_pros: list[dict[str, Any]],
    top_cons: list[dict[str, Any]],
    optimizations: dict[str, list[str]],
) -> tuple[str, str, list[str]]:
    """
    根据评测数据综合生成：回复质量、信息准确度、回复体验改进建议。
    Returns: (reply_quality_summary, info_accuracy_summary, reply_experience_suggestions)
    """
    scores_correctness: list[float] = []
    scores_clarity: list[float] = []
    scores_hallucination: list[float] = []
    for ev in evaluations:
        c = ev.get("correctness")
        cl = ev.get("clarity")
        h = ev.get("hallucination")
        if c is not None:
            try:
                scores_correctness.append(float(c))
            except (TypeError, ValueError):
                pass
        if cl is not None:
            try:
                scores_clarity.append(float(cl))
            except (TypeError, ValueError):
                pass
        if h is not None:
            try:
                scores_hallucination.append(float(h))
            except (TypeError, ValueError):
                pass

    avg_correctness = sum(scores_correctness) / len(scores_correctness) if scores_correctness else None
    avg_clarity = sum(scores_clarity) / len(scores_clarity) if scores_clarity else None
    avg_hallucination = sum(scores_hallucination) / len(scores_hallucination) if scores_hallucination else None

    # 回复质量：基于清晰度与优点
    quality_parts: list[str] = []
    if avg_clarity is not None:
        quality_parts.append(f"平均清晰度 {avg_clarity:.1f}/5")
    if top_pros:
        pros_related = [p.get("text", "") for p in top_pros[:3] if "清晰" in str(p.get("text", "")) or "结构" in str(p.get("text", ""))]
        if pros_related:
            quality_parts.append(f"高频优点如「{pros_related[0][:30]}…」体现了回复的结构与可读性")
    reply_quality = "；".join(quality_parts) if quality_parts else "综合评测中的 pros 与 clarity 评分可反映回复质量"

    # 信息准确度：基于正确性与幻觉
    accuracy_parts: list[str] = []
    if avg_correctness is not None:
        accuracy_parts.append(f"平均正确性 {avg_correctness:.1f}/5")
    if avg_hallucination is not None:
        accuracy_parts.append(f"幻觉控制 {avg_hallucination:.1f}/5（5 分为无幻觉）")
    if top_cons:
        cons_related = [c.get("text", "") for c in top_cons[:3] if any(k in str(c.get("text", "")) for k in ("不准确", "错误", "幻觉", "虚构"))]
        if cons_related:
            accuracy_parts.append(f"需注意的缺点如「{cons_related[0][:40]}…」")
    info_accuracy = "；".join(accuracy_parts) if accuracy_parts else "综合 correctness 与 hallucination 评分可反映信息准确度"

    # 回复体验改进建议：从优化建议中提炼
    experience_suggestions: list[str] = []
    for cat_items in [optimizations.get("answer", []), optimizations.get("prompt", []), optimizations.get("rag", [])]:
        for item in cat_items[:2]:  # 每类取前 2
            if item and item.strip():
                experience_suggestions.append(item.strip())
    if not experience_suggestions:
        experience_suggestions = ["根据 pros/cons 中的反馈，优化回答的完整性与亲和力，使回复更易理解、更贴合用户预期"]

    return reply_quality, info_accuracy, experience_suggestions


MODEL_DISPLAY_NAMES = {"doubao": "豆包", "qwen": "通义千问", "deepseek": "DeepSeek"}


def build_comparison_summary(
    comparison_ev_list: list[dict[str, Any]],
    top_n: int = 5,
) -> dict[str, Any]:
    """
    根据对比评测列表构建总结。
    comparison_ev_list: 每条含 model_type, pros, cons, avg_score
    """
    from collections import Counter

    by_model: dict[str, dict[str, Any]] = {}
    all_comp_pros: list[str] = []
    for ev in comparison_ev_list:
        mt = ev.get("model_type", "")
        if mt not in by_model:
            by_model[mt] = {"pros_counter": Counter(), "cons_counter": Counter(), "scores": []}
        pros_items = _split_bullet_items(ev.get("pros"))
        cons_items = _split_bullet_items(ev.get("cons"))
        for p in pros_items:
            by_model[mt]["pros_counter"][p] += 1
            all_comp_pros.append(p)
        for c in cons_items:
            by_model[mt]["cons_counter"][c] += 1
        avg = ev.get("avg_score")
        if avg is not None:
            by_model[mt]["scores"].append(float(avg))

    model_summaries: list[dict[str, Any]] = []
    for mt, data in by_model.items():
        scores = data.get("scores", [])
        avg_score = sum(scores) / len(scores) if scores else None
        top_p = data["pros_counter"].most_common(top_n)
        top_c = data["cons_counter"].most_common(top_n)
        model_summaries.append({
            "model_type": mt,
            "model_display_name": MODEL_DISPLAY_NAMES.get(mt, mt),
            "evaluation_count": len(pros_items) if (pros_items := list(data["pros_counter"].elements())) else sum(data["pros_counter"].values()),
        })
        # Fix: evaluation_count should be number of evaluations, not pros count
        ev_count = sum(1 for e in comparison_ev_list if e.get("model_type") == mt)
        model_summaries[-1]["evaluation_count"] = ev_count
        model_summaries[-1]["avg_score"] = avg_score
        model_summaries[-1]["top_pros"] = [{"text": t, "count": c} for t, c in top_p]
        model_summaries[-1]["top_cons"] = [{"text": t, "count": c} for t, c in top_c]

    # 借鉴通用大模型的可取之处：取各模型高频优点，去重
    pros_counter = Counter(all_comp_pros)
    takeaways = [t for t, _ in pros_counter.most_common(10)]
    return {"by_model": model_summaries, "takeaways": takeaways}
