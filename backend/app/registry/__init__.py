"""服务注册对外入口。

用法（幂等，可安全重复调用）：
    from app.registry import start_registration, stop_registration
    start_registration()   # 注册 + 按需拉起心跳
    stop_registration()    # 停心跳 + 注销

后端由配置动态决定（见 config.load_config）：
    CONSUL_ENABLED=true / EUREKA_ENABLED=false  →  注册到 Consul
    两者都关                                     →  NoopRegistry（不注册）

关键：生产用 gunicorn 多 worker 时，必须只在 master 进程调用一次
（见 backend/gunicorn.conf.py 的 when_ready/on_exit 钩子），
否则每个 worker 都会重复注册同一个 ip:port。
"""
from __future__ import annotations

import atexit
import logging
import os
import threading

from dataclasses import dataclass

from .base import NoopRegistry, ServiceInstance, ServiceRegistry
from .config import RegistryConfig, load_config
from .consul_registry import ConsulRegistry
from .eureka_registry import EurekaRegistry

log = logging.getLogger("app.registry")

_lock = threading.Lock()
_registry: ServiceRegistry | None = None
_instance: ServiceInstance | None = None
_result: "RegistrationResult | None" = None
_started = False


@dataclass
class RegistrationResult:
    """一次注册的可读结果，供调用方（gunicorn 钩子 / run.py）打日志。"""

    enabled: bool
    registry_type: str
    ok: bool = False
    target: str = ""
    instance_id: str = ""
    health_check_url: str = ""

    def summary(self) -> str:
        if not self.enabled:
            return "服务注册未启用（registry_type=none），跳过（走 K8S 原生服务发现）"
        status = "成功 ✓" if self.ok else "失败 ✗（应用继续运行，但未注册到注册中心）"
        return (
            f"服务注册{status}：type={self.registry_type} target={self.target} "
            f"instance={self.instance_id} health={self.health_check_url}"
        )


def _target_of(config: RegistryConfig) -> str:
    if config.registry_type == "consul":
        return f"{config.consul_scheme}://{config.consul_host}:{config.consul_port}"
    if config.registry_type == "eureka":
        return ",".join(config.eureka_server_urls)
    return ""


def build_registry(config: RegistryConfig) -> ServiceRegistry:
    if config.registry_type == "consul":
        return ConsulRegistry(config)
    if config.registry_type == "eureka":
        return EurekaRegistry(config)
    return NoopRegistry()


def _default_instance_id(config: RegistryConfig, ip: str) -> str:
    override = os.environ.get("INSTANCE_ID", "").strip()
    if override:
        return override
    if config.registry_type == "eureka":
        # 对齐 Spring Cloud Eureka 默认 instanceId：hostname:appname:port
        return f"{ip}:{config.service_name}:{config.service_port}"
    # Consul：稳定且可读，便于同一节点重启后覆盖注册 / 精确注销
    return f"{config.service_name}-{ip}-{config.service_port}"


def build_instance(config: RegistryConfig) -> ServiceInstance:
    from .netutil import detect_ip

    ip = config.service_ip or detect_ip(config.consul_host, config.consul_port)
    if not config.prefer_ip_address and not config.service_ip:
        # prefer-ip-address=false 时 Spring 用 hostname，这里仍探测 IP 兜底可达性
        ip = ip
    scheme = "https" if config.secure else "http"
    base = f"{scheme}://{ip}:{config.service_port}"
    return ServiceInstance(
        service_name=config.service_name,
        instance_id=_default_instance_id(config, ip),
        ip=ip,
        port=config.service_port,
        secure=config.secure,
        health_check_url=f"{base}{config.health_check_path}",
        status_page_url=f"{base}{config.status_page_path}",
        home_page_url=f"{base}/",
        tags=config.tags,
        metadata=config.metadata,
    )


def start_registration(config: RegistryConfig | None = None) -> RegistrationResult:
    """注册当前服务实例并返回结果。幂等：重复调用只生效一次。"""
    global _registry, _instance, _started, _result
    with _lock:
        if _started:
            return _result  # type: ignore[return-value]
        config = config or load_config()
        _registry = build_registry(config)
        if not config.enabled:
            _result = RegistrationResult(enabled=False, registry_type="none", ok=True)
            log.info(_result.summary())
            _started = True
            return _result
        _instance = build_instance(config)
        target = _target_of(config)
        log.info(
            "开始注册服务：type=%s target=%s instance=%s health=%s check=%s",
            config.registry_type, target, _instance.instance_id,
            _instance.health_check_url,
            config.consul_check_mode if config.registry_type == "consul" else "eureka-heartbeat",
        )
        ok = bool(_registry.start(_instance))
        _result = RegistrationResult(
            enabled=True,
            registry_type=config.registry_type,
            ok=ok,
            target=target,
            instance_id=_instance.instance_id,
            health_check_url=_instance.health_check_url,
        )
        (log.info if ok else log.error)(_result.summary())
        _started = True
        atexit.register(stop_registration)
        return _result


def stop_registration() -> None:
    """注销并停止心跳。幂等。"""
    global _registry, _instance, _started, _result
    with _lock:
        if not _started or _registry is None or _instance is None:
            _started = False
            return
        try:
            _registry.stop(_instance)
            log.info("已注销服务实例：%s", _instance.instance_id)
        except Exception as exc:  # noqa: BLE001 - 关停不应抛出
            log.error("注销服务实例异常：%s", exc)
        finally:
            _registry = None
            _instance = None
            _result = None
            _started = False


__all__ = [
    "start_registration",
    "stop_registration",
    "build_registry",
    "build_instance",
    "load_config",
    "RegistrationResult",
    "RegistryConfig",
    "ServiceInstance",
    "ServiceRegistry",
]
