"""LLM Judge - score answers by correctness, completeness, clarity, hallucination."""

import json
from typing import Any

from openai import AsyncOpenAI

from agentarena.core.config import get_settings

JUDGE_PROMPT = """Evaluate the following answer based on the criteria. Return JSON only.

Question: {question}

Key points (expected in answer): {key_points}

Answer: {answer}

Criteria (score 1-5 each):
1. correctness: factual accuracy, match with key points
2. completeness: covers expected points
3. clarity: clear, well-structured
4. hallucination: no fabricated content (5 = no hallucination)

Return JSON:
{{"correctness": 1-5, "completeness": 1-5, "clarity": 1-5, "hallucination": 1-5, "pros": "2-3 bullet points", "cons": "2-3 bullet points", "optimization": "2-3 suggestions"}}

重要：pros、cons、optimization 必须全部使用中文回答。
"""


async def judge_answer(
    question: str,
    answer: str,
    key_points: str | None = None,
) -> dict[str, Any]:
    """
    Use LLM to score an answer.
    Returns dict with correctness, completeness, clarity, hallucination, pros, cons, optimization.
    """
    settings = get_settings()
    if not settings.openai_api_key:
        return _default_scores()
    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
    )
    kp = key_points or "N/A"
    if isinstance(kp, str) and kp.startswith("["):
        try:
            arr = json.loads(kp)
            kp = ", ".join(str(x) for x in arr) if isinstance(arr, list) else kp
        except json.JSONDecodeError:
            pass
    prompt = JUDGE_PROMPT.format(
        question=question,
        key_points=kp,
        answer=answer or "(no answer)",
    )
    try:
        resp = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        text = resp.choices[0].message.content
        # Extract JSON from response
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(
                l for l in lines if not l.startswith("```") and not l.endswith("```")
            )
        data = json.loads(text)
        avg = (
            float(data.get("correctness", 3))
            + float(data.get("completeness", 3))
            + float(data.get("clarity", 3))
            + float(data.get("hallucination", 3))
        ) / 4.0
        data["avg_score"] = round(avg, 2)
        return data
    except Exception:
        return _default_scores()


def _default_scores() -> dict[str, Any]:
    """Default when LLM unavailable."""
    return {
        "correctness": 3.0,
        "completeness": 3.0,
        "clarity": 3.0,
        "hallucination": 3.0,
        "avg_score": 3.0,
        "pros": "",
        "cons": "",
        "optimization": "",
    }
