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

from .base import NoopRegistry, ServiceInstance, ServiceRegistry
from .config import RegistryConfig, load_config
from .consul_registry import ConsulRegistry
from .eureka_registry import EurekaRegistry

log = logging.getLogger("app.registry")

_lock = threading.Lock()
_registry: ServiceRegistry | None = None
_instance: ServiceInstance | None = None
_started = False


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


def start_registration(config: RegistryConfig | None = None) -> ServiceRegistry:
    """注册当前服务实例。幂等：重复调用只生效一次。"""
    global _registry, _instance, _started
    with _lock:
        if _started:
            return _registry  # type: ignore[return-value]
        config = config or load_config()
        _registry = build_registry(config)
        if not config.enabled:
            log.info("未启用服务注册（registry_type=none），跳过")
            _started = True
            return _registry
        _instance = build_instance(config)
        log.info(
            "启动服务注册：type=%s name=%s instance=%s",
            config.registry_type, config.service_name, _instance.instance_id,
        )
        _registry.start(_instance)
        _started = True
        atexit.register(stop_registration)
        return _registry


def stop_registration() -> None:
    """注销并停止心跳。幂等。"""
    global _registry, _instance, _started
    with _lock:
        if not _started or _registry is None or _instance is None:
            _started = False
            return
        try:
            _registry.stop(_instance)
        except Exception as exc:  # noqa: BLE001 - 关停不应抛出
            log.error("注销服务实例异常：%s", exc)
        finally:
            _registry = None
            _instance = None
            _started = False


__all__ = [
    "start_registration",
    "stop_registration",
    "build_registry",
    "build_instance",
    "load_config",
    "RegistryConfig",
    "ServiceInstance",
    "ServiceRegistry",
]
