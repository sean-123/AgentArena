"""Dataset API routes."""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agentarena.core.database import DbSession
from agentarena.models.dataset import Dataset, DatasetVersion, Testcase
from agentarena.schemas.dataset_schema import (
    DatasetCreate,
    DatasetResponse,
    DatasetVersionCreate,
    DatasetVersionResponse,
    TestcaseCreate,
    TestcaseResponse,
    TestcaseUpdate,
)
from agentarena.utils.excel_importer import import_excel_to_testcases
from agentarena.utils.testcase_id import make_testcase_id

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("", response_model=list[DatasetResponse])
async def list_datasets(
    db: DbSession,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """List datasets."""
    result = await db.execute(
        select(Dataset).order_by(Dataset.created_at.desc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all())


@router.post("", response_model=DatasetResponse)
async def create_dataset(body: DatasetCreate, db: DbSession):
    """Create dataset."""
    ds = Dataset(
        id=f"ds_{uuid.uuid4().hex[:12]}",
        name=body.name,
        description=body.description,
    )
    db.add(ds)
    # Create initial version
    dv = DatasetVersion(
        id=f"dv_{uuid.uuid4().hex[:12]}",
        dataset_id=ds.id,
        version="v1",
    )
    db.add(dv)
    await db.flush()
    return ds


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(dataset_id: str, db: DbSession):
    """Get dataset by ID."""
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return ds


@router.post("/{dataset_id}/versions", response_model=DatasetVersionResponse)
async def create_version(dataset_id: str, body: DatasetVersionCreate, db: DbSession):
    """Create dataset version."""
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Dataset not found")
    dv = DatasetVersion(
        id=f"dv_{uuid.uuid4().hex[:12]}",
        dataset_id=dataset_id,
        version=body.version or "v1",
    )
    db.add(dv)
    await db.flush()
    return dv


@router.get("/{dataset_id}/versions", response_model=list[DatasetVersionResponse])
async def list_versions(dataset_id: str, db: DbSession):
    """List dataset versions."""
    result = await db.execute(
        select(DatasetVersion)
        .where(DatasetVersion.dataset_id == dataset_id)
        .order_by(DatasetVersion.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{dataset_id}/versions/{version_id}/testcases", response_model=list[TestcaseResponse])
async def list_testcases(dataset_id: str, version_id: str, db: DbSession):
    """List testcases for a dataset version."""
    result = await db.execute(
        select(Testcase)
        .join(DatasetVersion, Testcase.dataset_version_id == DatasetVersion.id)
        .where(DatasetVersion.id == version_id, DatasetVersion.dataset_id == dataset_id)
        .order_by(Testcase.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/{dataset_id}/versions/{version_id}/testcases", response_model=TestcaseResponse)
async def add_testcase(
    dataset_id: str,
    version_id: str,
    body: TestcaseCreate,
    db: DbSession,
):
    """Add testcase to dataset version."""
    result = await db.execute(
        select(DatasetVersion).where(
            DatasetVersion.id == version_id,
            DatasetVersion.dataset_id == dataset_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Dataset version not found")
    tid = (
        make_testcase_id(dataset_id, version_id, body.id)
        if body.id
        else f"tc_{uuid.uuid4().hex[:12]}"
    )
    dup = await db.execute(
        select(Testcase.id).where(
            Testcase.id == tid,
            Testcase.dataset_version_id == version_id,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(409, "该测试用例 ID 在本数据集中已存在")
    tc = Testcase(
        id=tid,
        dataset_version_id=version_id,
        question=body.question,
        persona_question=body.persona_question,
        key_points=json.dumps(body.key_points) if body.key_points else None,
        domain=body.domain,
        difficulty=body.difficulty,
    )
    db.add(tc)
    await db.flush()
    return tc


@router.patch(
    "/{dataset_id}/versions/{version_id}/testcases/{testcase_id}",
    response_model=TestcaseResponse,
)
async def update_testcase(
    dataset_id: str,
    version_id: str,
    testcase_id: str,
    body: TestcaseUpdate,
    db: DbSession,
):
    """Update testcase."""
    result = await db.execute(
        select(Testcase)
        .join(DatasetVersion, Testcase.dataset_version_id == DatasetVersion.id)
        .where(
            Testcase.id == testcase_id,
            DatasetVersion.id == version_id,
            DatasetVersion.dataset_id == dataset_id,
        )
    )
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "Testcase not found")
    if body.question is not None:
        tc.question = body.question
    if body.persona_question is not None:
        tc.persona_question = body.persona_question
    if body.key_points is not None:
        tc.key_points = json.dumps(body.key_points) if body.key_points else None
    if body.domain is not None:
        tc.domain = body.domain
    if body.difficulty is not None:
        tc.difficulty = body.difficulty
    await db.flush()
    return tc


@router.delete(
    "/{dataset_id}/versions/{version_id}/testcases/{testcase_id}",
)
async def delete_testcase(
    dataset_id: str,
    version_id: str,
    testcase_id: str,
    db: DbSession,
):
    """Delete testcase."""
    result = await db.execute(
        select(Testcase)
        .join(DatasetVersion, Testcase.dataset_version_id == DatasetVersion.id)
        .where(
            Testcase.id == testcase_id,
            DatasetVersion.id == version_id,
            DatasetVersion.dataset_id == dataset_id,
        )
    )
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(404, "Testcase not found")
    await db.delete(tc)
    return {"status": "ok"}


@router.delete("/{dataset_id}")
async def delete_dataset(dataset_id: str, db: DbSession):
    """Delete dataset and all its versions and testcases."""
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    # Delete testcases -> versions -> dataset (order matters for FK)
    versions_result = await db.execute(
        select(DatasetVersion).where(DatasetVersion.dataset_id == dataset_id)
    )
    for dv in versions_result.scalars().all():
        testcases_result = await db.execute(
            select(Testcase).where(Testcase.dataset_version_id == dv.id)
        )
        for tc in testcases_result.scalars().all():
            await db.delete(tc)
        await db.delete(dv)
    await db.delete(ds)
    return {"status": "ok"}


@router.post("/{dataset_id}/versions/{version_id}/import-excel")
async def import_excel(
    dataset_id: str,
    version_id: str,
    file: UploadFile,
    db: DbSession,
):
    """Import testcases from Excel file."""
    result = await db.execute(
        select(DatasetVersion).where(
            DatasetVersion.id == version_id,
            DatasetVersion.dataset_id == dataset_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Dataset version not found")
    content = await file.read()
    testcases = import_excel_to_testcases(content)
    created_ids: list[str] = []
    updated_ids: list[str] = []
    for tc_data in testcases:
        tid = make_testcase_id(dataset_id, version_id, tc_data.get("id"))
        res = await db.execute(
            select(Testcase).where(
                Testcase.id == tid,
                Testcase.dataset_version_id == version_id,
            )
        )
        existing = res.scalar_one_or_none()
        if existing:
            existing.question = tc_data.get("question", "")
            existing.persona_question = tc_data.get("persona_question")
            existing.key_points = (
                json.dumps(tc_data.get("key_points", [])) if tc_data.get("key_points") else None
            )
            existing.domain = tc_data.get("domain")
            existing.difficulty = tc_data.get("difficulty")
            updated_ids.append(tid)
        else:
            tc = Testcase(
                id=tid,
                dataset_version_id=version_id,
                question=tc_data.get("question", ""),
                persona_question=tc_data.get("persona_question"),
                key_points=json.dumps(tc_data.get("key_points", [])) if tc_data.get("key_points") else None,
                domain=tc_data.get("domain"),
                difficulty=tc_data.get("difficulty"),
            )
            db.add(tc)
            created_ids.append(tid)
    await db.flush()
    return {
        "imported": len(created_ids),
        "updated": len(updated_ids),
        "testcases": [{"id": x} for x in (*created_ids, *updated_ids)],
    }


@router.post("/import-json")
async def import_json(file: UploadFile, db: DbSession):
    """Import dataset from JSON file. Creates dataset + version + testcases."""
    content = await file.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Invalid JSON: {e}")
    items = data if isinstance(data, list) else data.get("testcases", data.get("items", []))
    if not items:
        raise HTTPException(400, "No testcases in file")
    ds = Dataset(
        id=f"ds_{uuid.uuid4().hex[:12]}",
        name=data.get("name", "Imported Dataset") if isinstance(data, dict) else "Imported Dataset",
        description=data.get("description") if isinstance(data, dict) else None,
    )
    db.add(ds)
    await db.flush()
    dv = DatasetVersion(
        id=f"dv_{uuid.uuid4().hex[:12]}",
        dataset_id=ds.id,
        version="v1",
    )
    db.add(dv)
    await db.flush()
    # 同一 JSON 内相同外部 id 只保留最后一条；主键为 数据集+版本+外部 id 组合
    deduped: dict[str, dict] = {}
    for item in items:
        q = item.get("question", item.get("q", ""))
        if not q:
            continue
        tid = make_testcase_id(ds.id, dv.id, item.get("id"))
        deduped[tid] = item
    for tid, item in deduped.items():
        q = item.get("question", item.get("q", ""))
        tc = Testcase(
            id=tid,
            dataset_version_id=dv.id,
            question=q,
            persona_question=item.get("persona_question", item.get("persona")),
            key_points=json.dumps(item.get("key_points", [])) if item.get("key_points") else None,
            domain=item.get("domain"),
            difficulty=item.get("difficulty"),
        )
        db.add(tc)
    await db.flush()
    return {
        "dataset_id": ds.id,
        "version_id": dv.id,
        "imported": len(deduped),
    }
