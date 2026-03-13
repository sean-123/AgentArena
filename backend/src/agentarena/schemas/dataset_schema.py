"""Dataset schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TestcaseCreate(BaseModel):
    """Create testcase request."""

    id: Optional[str] = None
    question: str
    persona_question: Optional[str] = None
    key_points: Optional[list[str]] = None
    domain: Optional[str] = None
    difficulty: Optional[str] = None


class TestcaseUpdate(BaseModel):
    """Update testcase request."""

    question: Optional[str] = None
    persona_question: Optional[str] = None
    key_points: Optional[list[str]] = None
    domain: Optional[str] = None
    difficulty: Optional[str] = None


class TestcaseResponse(BaseModel):
    """Testcase response."""

    id: str
    dataset_version_id: str
    question: str
    persona_question: Optional[str] = None
    key_points: Optional[str] = None
    domain: Optional[str] = None
    difficulty: Optional[str] = None

    model_config = {"from_attributes": True}


class DatasetCreate(BaseModel):
    """Create dataset request."""

    name: str
    description: Optional[str] = None


class DatasetVersionCreate(BaseModel):
    """Create dataset version request."""

    version: Optional[str] = "v1"


class DatasetResponse(BaseModel):
    """Dataset response."""

    id: str
    name: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DatasetVersionResponse(BaseModel):
    """Dataset version response."""

    id: str
    dataset_id: str
    version: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
