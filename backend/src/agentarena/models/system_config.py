"""System configuration model."""

from sqlalchemy import Column, String, Text

from agentarena.models.base import Base, TimestampMixin


class SystemConfig(Base, TimestampMixin):
    """Key-value system config (e.g. database connection)."""

    __tablename__ = "system_config"

    id: Column[str] = Column(String(50), primary_key=True)
    key: Column[str] = Column(String(100), unique=True, nullable=False)
    value: Column[str] = Column(Text, nullable=True)
