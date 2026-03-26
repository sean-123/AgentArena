"""Testcase 主键：与数据集、版本组合，避免跨数据集/导入时 ID 冲突。"""

import hashlib
import re
import uuid


def make_testcase_id(
    dataset_id: str,
    version_id: str,
    external_id: str | None,
) -> str:
    """
    生成测试用例主键（全局唯一、长度不超过 50）。

    - 未提供外部 id：生成 tc_<uuid12>
    - 已提供：dataset_id + version_id + 清洗后的外部 id；超长时用哈希缩短
    """
    if not external_id or not str(external_id).strip():
        return f"tc_{uuid.uuid4().hex[:12]}"
    ext = str(external_id).strip()
    ext = re.sub(r"[^a-zA-Z0-9_.-]", "_", ext)
    if not ext:
        return f"tc_{uuid.uuid4().hex[:12]}"
    parts = f"{dataset_id}_{version_id}_{ext}"
    if len(parts) <= 50:
        return parts
    digest = hashlib.sha256(parts.encode("utf-8")).hexdigest()[:20]
    return f"tc_{digest}"[:50]
