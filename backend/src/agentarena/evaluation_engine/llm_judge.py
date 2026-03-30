"""LLM Judge - score answers by correctness, completeness, clarity, hallucination."""

import json
import logging
from typing import Any

from openai import APIStatusError, AsyncOpenAI, AuthenticationError

from agentarena.core.config import get_settings

logger = logging.getLogger(__name__)

JUDGE_SYSTEM = (
    "你只输出一个 JSON 对象，不要使用 markdown 代码块，不要添加任何解释性文字。"
)

JUDGE_PROMPT = """Evaluate the following answer based on the criteria. Return JSON only.

Question: {question}

Key points (expected in answer): {key_points}

Answer: {answer}

Criteria (score 1-5 each):
1. correctness: factual accuracy, match with key points
2. completeness: covers expected points
3. clarity: clear, well-structured
4. hallucination: no fabricated content (5 = no hallucination)

Return JSON with exactly these keys (all string values for pros/cons/optimization must be in 中文):
{{"correctness": <number>, "completeness": <number>, "clarity": <number>, "hallucination": <number>, "pros": "<string>", "cons": "<string>", "optimization": "<string>"}}

pros、cons、optimization 也可用字符串数组形式给出多条要点；若为数组，将自动合并为多行文本。

重要：pros、cons、optimization 必须填写实质性中文内容（各至少 2 条要点或一句完整评价），禁止留空字符串。
optimization 可包含：1) 回答应如何修改；2) 与提示词相关则注明「提示词」；3) 与 RAG/检索相关则注明「RAG」；4) 与模型/工具/Agent 架构相关则注明「架构」「模型」等。
"""


def _extract_json_object(s: str) -> str | None:
    """从模型输出中提取最外层 JSON 对象（忽略前后说明文字、markdown）。"""
    s = s.strip()
    if not s:
        return None
    start = s.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(s)):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return s[start : i + 1]
    return None


def _strip_code_fence(text: str) -> str:
    t = text.strip()
    if not t.startswith("```"):
        return t
    lines = t.split("\n")
    out: list[str] = []
    for line in lines:
        if line.strip().startswith("```"):
            continue
        out.append(line)
    return "\n".join(out).strip()


def _normalize_feedback_field(val: Any) -> str:
    """统一 pros/cons/optimization 为存库用的多行文本。"""
    if val is None:
        return ""
    if isinstance(val, list):
        parts = [str(x).strip() for x in val if x is not None and str(x).strip()]
        return "\n".join(parts)
    if isinstance(val, dict):
        # 少数模型会嵌套对象
        try:
            return json.dumps(val, ensure_ascii=False)
        except Exception:
            return str(val)
    return str(val).strip()


def _coalesce_feedback_keys(data: dict[str, Any]) -> None:
    """合并常见别名到 pros / cons / optimization。"""
    aliases_pros = (
        "优点",
        "strengths",
        "advantages",
        "highlights",
        "正面",
    )
    aliases_cons = (
        "缺点",
        "weaknesses",
        "disadvantages",
        "issues",
        "负面",
        "不足",
    )
    aliases_opt = (
        "优化建议",
        "改进建议",
        "suggestions",
        "improvements",
        "recommendations",
    )
    for k in aliases_pros:
        if k in data and not _normalize_feedback_field(data.get("pros")):
            data["pros"] = data[k]
    for k in aliases_cons:
        if k in data and not _normalize_feedback_field(data.get("cons")):
            data["cons"] = data[k]
    for k in aliases_opt:
        if k in data and not _normalize_feedback_field(data.get("optimization")):
            data["optimization"] = data[k]


def _parse_judge_response(raw: str) -> dict[str, Any]:
    """解析评判 JSON，填充数值与文本字段。"""
    text = _strip_code_fence(raw)
    blob = text
    try:
        data = json.loads(blob)
    except json.JSONDecodeError:
        extracted = _extract_json_object(text)
        if not extracted:
            raise
        data = json.loads(extracted)

    if not isinstance(data, dict):
        raise ValueError("judge response is not a JSON object")

    _coalesce_feedback_keys(data)

    out: dict[str, Any] = {}
    for key in ("correctness", "completeness", "clarity", "hallucination"):
        v = data.get(key)
        if v is None:
            out[key] = 3.0
        else:
            try:
                out[key] = float(v)
            except (TypeError, ValueError):
                out[key] = 3.0

    out["pros"] = _normalize_feedback_field(data.get("pros"))
    out["cons"] = _normalize_feedback_field(data.get("cons"))
    out["optimization"] = _normalize_feedback_field(data.get("optimization"))

    avg = (
        float(out["correctness"])
        + float(out["completeness"])
        + float(out["clarity"])
        + float(out["hallucination"])
    ) / 4.0
    out["avg_score"] = round(avg, 2)
    return out


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
    api_key = (settings.openai_api_key or "").strip()
    if not api_key:
        logger.warning("LLM Judge 跳过：未配置或仅为空白的 AGENTARENA_OPENAI_API_KEY，pros/cons/optimization 将为空")
        return _default_scores()
    client = AsyncOpenAI(
        api_key=api_key,
        base_url=settings.openai_base_url,
    )
    kp = key_points or "N/A"
    if isinstance(kp, str) and kp.startswith("["):
        try:
            arr = json.loads(kp)
            kp = ", ".join(str(x) for x in arr) if isinstance(arr, list) else kp
        except json.JSONDecodeError:
            pass
    user_content = JUDGE_PROMPT.format(
        question=question,
        key_points=kp,
        answer=answer or "(no answer)",
    )
    messages = [
        {"role": "system", "content": JUDGE_SYSTEM},
        {"role": "user", "content": user_content},
    ]
    try:
        try:
            resp = await client.chat.completions.create(
                model=settings.llm_model,
                messages=messages,
                temperature=0,
                response_format={"type": "json_object"},
            )
        except AuthenticationError:
            raise
        except APIStatusError as e:
            # 401/403 等鉴权问题不重试 json 降级
            if getattr(e, "status_code", None) in (401, 403):
                raise
            logger.debug("json_object 响应格式不可用，改用普通输出: %s", e)
            resp = await client.chat.completions.create(
                model=settings.llm_model,
                messages=messages,
                temperature=0,
            )
        except Exception as e:
            logger.debug("json_object 响应格式不可用，改用普通输出: %s", e)
            resp = await client.chat.completions.create(
                model=settings.llm_model,
                messages=messages,
                temperature=0,
            )
        text = (resp.choices[0].message.content or "").strip()
        if not text:
            raise ValueError("empty judge response")
        data = _parse_judge_response(text)
        # 若模型仍返回空文本，打日志便于排查
        if not (data.get("pros") or data.get("cons") or data.get("optimization")):
            logger.warning(
                "LLM Judge 返回的 pros/cons/optimization 均为空，原始回复前 500 字: %s",
                text[:500],
            )
        return data
    except AuthenticationError:
        logger.error(
            "LLM Judge 鉴权失败(401)：Worker 进程未带上有效 API Key。"
            " 请在运行 Worker 的环境中设置 AGENTARENA_OPENAI_API_KEY（与 AGENTARENA_OPENAI_BASE_URL 匹配）。"
            " Docker Compose 请确认 worker 服务使用 env_file: ../backend/.env 且该文件含真实密钥，"
            " 或单独用 environment 注入；勿仅依赖镜像内复制的 .env.example。"
        )
        return _default_scores()
    except Exception:
        logger.exception("LLM Judge 调用或解析失败，已使用默认分数与空评语")
        return _default_scores()


def _default_scores() -> dict[str, Any]:
    """Default when LLM unavailable or parse failed."""
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
