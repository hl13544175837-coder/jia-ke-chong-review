import logging

from ..integrations import (
    IntegrationHealth,
    IntegrationMode,
    IntegrationRuntimeStatus,
    get_adapter,
    list_capability_definitions,
)


logger = logging.getLogger(__name__)


UNCONFIGURED_STATUS = IntegrationRuntimeStatus(
    mode=IntegrationMode.MANUAL_BRIDGE,
    health=IntegrationHealth.UNCONFIGURED,
)


def list_integration_capabilities() -> list[dict]:
    capabilities = []
    for definition in list_capability_definitions():
        adapter = get_adapter(definition.code)
        try:
            status = adapter.runtime_status() if adapter is not None else UNCONFIGURED_STATUS
            mode = status.mode.value
            health = status.health.value
        except Exception:
            logger.exception("外部接口状态检查失败：%s", definition.code)
            mode = IntegrationMode.MANUAL_BRIDGE.value
            health = IntegrationHealth.UNAVAILABLE.value
        capabilities.append({
            "code": definition.code,
            "name": definition.name,
            "owner": definition.owner,
            "mode": mode,
            "health": health,
            "description": definition.description,
            "required_inputs": list(definition.required_inputs),
        })
    return capabilities
