"""External-system adapter boundary for the modular monolith.

Each external capability owns a separate adapter. Until a real adapter is
registered, the capability stays in ``manual_bridge`` mode and reports
``unconfigured`` health; callers must never infer a successful connection.
"""

from .base import IntegrationAdapter, IntegrationHealth, IntegrationMode, IntegrationRuntimeStatus
from .registry import get_adapter, list_capability_definitions, register_adapter

__all__ = [
    "IntegrationAdapter",
    "IntegrationHealth",
    "IntegrationMode",
    "IntegrationRuntimeStatus",
    "get_adapter",
    "list_capability_definitions",
    "register_adapter",
]
