"""Dataset, DatasetVersion, and Testcase models."""

from sqlalchemy import Column, String, Text, ForeignKey
from sqlalchemy.orm import relationship

from agentarena.models.base import Base, TimestampMixin


class Dataset(Base, TimestampMixin):
    """Dataset (collection of testcases)."""

    __tablename__ = "datasets"

    id: Column[str] = Column(String(50), primary_key=True)
    name: Column[str] = Column(String(255), nullable=False)
    description: Column[str] = Column(Text, nullable=True)

    versions = relationship("DatasetVersion", back_populates="dataset")


class DatasetVersion(Base, TimestampMixin):
    """Version of a dataset."""

    __tablename__ = "dataset_versions"

    id: Column[str] = Column(String(50), primary_key=True)
    dataset_id: Column[str] = Column(String(50), ForeignKey("datasets.id"), nullable=False)
    version: Column[str] = Column(String(20), nullable=False, default="v1")

    dataset = relationship("Dataset", back_populates="versions")
    testcases = relationship("Testcase", back_populates="dataset_version")


class Testcase(Base, TimestampMixin):
    """Single test case (question + expected key points)."""

    __tablename__ = "testcases"

    id: Column[str] = Column(String(50), primary_key=True)
    dataset_version_id: Column[str] = Column(
        String(50), ForeignKey("dataset_versions.id"), nullable=False
    )
    question: Column[str] = Column(Text, nullable=False)
    persona_question: Column[str] = Column(Text, nullable=True)
    key_points: Column[str] = Column(Text, nullable=True)  # JSON array
    domain: Column[str] = Column(String(50), nullable=True)
    difficulty: Column[str] = Column(String(20), nullable=True)

    dataset_version = relationship("DatasetVersion", back_populates="testcases")
