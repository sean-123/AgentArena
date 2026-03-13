"""Common schemas."""

from datetime import datetime
from typing import Any


def to_camel(string: str) -> str:
    """Convert snake_case to camelCase."""
    components = string.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


class BaseSchema:
    """Base with common config."""

    model_config = {"from_attributes": True, "populate_by_name": True}


def format_datetime(dt: datetime | None) -> str | None:
    """Format datetime for API."""
    return dt.isoformat() if dt else None
