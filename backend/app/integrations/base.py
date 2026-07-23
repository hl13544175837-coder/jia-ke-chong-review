from dataclasses import dataclass
from enum import Enum
from typing import Protocol, runtime_checkable


class IntegrationMode(str, Enum):
    MANUAL_BRIDGE = "manual_bridge"
    SHADOW = "shadow"
    DUAL_RUN = "dual_run"
    AUTHORITATIVE = "authoritative"
    LEGACY_RETIRED = "legacy_retired"


class IntegrationHealth(str, Enum):
    UNCONFIGURED = "unconfigured"
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class IntegrationRuntimeStatus:
    mode: IntegrationMode
    health: IntegrationHealth


@runtime_checkable
class IntegrationAdapter(Protocol):
    """Minimal slot implemented by a real external-system adapter later."""

    capability_code: str

    def runtime_status(self) -> IntegrationRuntimeStatus:
        """Return observed runtime status without fabricating connectivity."""

