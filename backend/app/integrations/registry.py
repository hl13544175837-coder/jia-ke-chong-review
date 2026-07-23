from .base import IntegrationAdapter
from .capabilities import CAPABILITY_DEFINITIONS, IntegrationCapabilityDefinition


_DEFINITIONS_BY_CODE = {item.code: item for item in CAPABILITY_DEFINITIONS}
_ADAPTERS_BY_CODE: dict[str, IntegrationAdapter] = {}


def list_capability_definitions() -> tuple[IntegrationCapabilityDefinition, ...]:
    return CAPABILITY_DEFINITIONS


def register_adapter(adapter: IntegrationAdapter) -> None:
    """Attach one real adapter without changing consumers of the registry."""
    if adapter.capability_code not in _DEFINITIONS_BY_CODE:
        raise ValueError(f"Unknown integration capability: {adapter.capability_code}")
    _ADAPTERS_BY_CODE[adapter.capability_code] = adapter


def get_adapter(capability_code: str) -> IntegrationAdapter | None:
    return _ADAPTERS_BY_CODE.get(capability_code)
