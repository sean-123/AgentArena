"""Base model and mixins."""

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


def _utc_now() -> datetime:
    """Python-side default for timestamps, 避免 async session 下 func.now() 触发 lazy load 报错."""
    return datetime.now(timezone.utc)


class TimestampMixin:
    """Mixin for created_at and updated_at."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=_utc_now,
        onupdate=_utc_now,
        nullable=False,
    )
