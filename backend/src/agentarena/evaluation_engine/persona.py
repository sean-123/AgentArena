"""
Persona question generator - convert canonical questions to realistic user questions.
参考 agents.yaml 中的 persona 人设描述，将规范问题改写成该人设下的自然提问。
"""

from typing import Optional

from openai import AsyncOpenAI

from agentarena.core.config import get_settings

SYSTEM_PROMPT = """You are a question rewriter. Convert formal/canonical questions into realistic user questions.
Output ONLY the rewritten question, no explanation. Keep the same meaning."""

PERSONA_PROMPT_TEMPLATE = """The person asking has the following profile and context:
---
{persona}
---

Canonical question: "{question}"

Rewrite this question as this person would naturally ask it in conversation.
Output ONLY the rewritten question, no other text."""


async def generate_persona_question(question: str, persona: str) -> str:
    """
    Use persona to convert canonical question into natural user question.
    If LLM fails, return original question.
    """
    settings = get_settings()
    if not settings.openai_api_key or not persona or not persona.strip():
        return question
    try:
        client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        prompt = PERSONA_PROMPT_TEMPLATE.format(
            persona=persona.strip(),
            question=question,
        )
        resp = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=512,
            temperature=0.3,
        )
        text = (resp.choices[0].message.content or "").strip().strip('"').strip("'")
        return text or question
    except Exception:
        return question
