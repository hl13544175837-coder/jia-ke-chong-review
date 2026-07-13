"""注册中心配置解析：环境变量 + 可选的 Spring 属性文件，动态决定注册后端。

配置来源优先级（高 → 低）：
  1. 环境变量（Python 惯例名，如 CONSUL_HOST）
  2. Spring 属性文件（点号键，如 spring.cloud.consul.host）——
     通过 REGISTRY_PROPERTIES_FILE 指定路径，便于和 Spring 服务复用同一份配置
  3. 代码内默认值

后端选择（registry_type）：
  - REGISTRY_TYPE 显式指定 consul/eureka/none 时以其为准；
  - 否则按 Spring 语义从 spring.cloud.consul.enabled / eureka.client.enabled 推导；
  - 两者都关 → none（走 K8S 原生服务发现，应用侧不注册）。
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger("app.registry")


def _load_properties_file() -> dict[str, str]:
    """读取 Spring 风格 `key = value` 属性文件（# / ! 为注释）。"""
    path = os.environ.get("REGISTRY_PROPERTIES_FILE", "").strip()
    if not path:
        return {}
    p = Path(path)
    if not p.is_file():
        log.warning("REGISTRY_PROPERTIES_FILE 指向的文件不存在：%s", path)
        return {}
    props: dict[str, str] = {}
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line[0] in "#!":
            continue
        sep = min((i for i in (line.find("="), line.find(":")) if i != -1), default=-1)
        if sep == -1:
            continue
        key = line[:sep].strip()
        value = line[sep + 1:].strip()
        if key:
            props[key] = value
    return props


class _Source:
    """按优先级读取：环境变量 > 属性文件 > 默认。"""

    def __init__(self, props: dict[str, str]):
        self._props = props

    def get(self, env_key: str, spring_key: str = "", default: str = "") -> str:
        env_val = os.environ.get(env_key)
        if env_val is not None and env_val != "":
            return env_val
        if spring_key and spring_key in self._props:
            return self._props[spring_key]
        return default

    def get_bool(self, env_key: str, spring_key: str = "", default: bool = False) -> bool:
        raw = self.get(env_key, spring_key, "true" if default else "false")
        return str(raw).strip().lower() in ("1", "true", "yes", "on")

    def get_int(self, env_key: str, spring_key: str = "", default: int = 0) -> int:
        raw = self.get(env_key, spring_key, str(default))
        try:
            return int(str(raw).strip())
        except (TypeError, ValueError):
            return default


@dataclass
class RegistryConfig:
    registry_type: str = "none"          # consul | eureka | none
    service_name: str = "zhipin-server"
    service_ip: str = ""                 # 空表示自动探测
    service_port: int = 5000
    prefer_ip_address: bool = True
    secure: bool = False
    health_check_path: str = "/actuator/health"
    status_page_path: str = "/actuator/info"
    tags: list[str] = field(default_factory=list)
    metadata: dict[str, str] = field(default_factory=dict)

    # Consul
    consul_host: str = "127.0.0.1"
    consul_port: int = 8500
    consul_scheme: str = "http"
    consul_token: str = ""
    consul_register: bool = True
    consul_check_mode: str = "http"      # http（consul 主动拉取）| ttl（应用推心跳）
    consul_health_interval: str = "10s"
    consul_health_timeout: str = "5s"
    consul_deregister_after: str = "1m"
    consul_ttl: str = "30s"

    # Eureka
    eureka_server_urls: list[str] = field(default_factory=list)
    eureka_register: bool = True
    eureka_heartbeat_interval: int = 30  # 秒
    eureka_lease_duration: int = 90      # 秒

    @property
    def enabled(self) -> bool:
        return self.registry_type in ("consul", "eureka")


def load_config() -> RegistryConfig:
    props = _load_properties_file()
    src = _Source(props)

    consul_enabled = src.get_bool("CONSUL_ENABLED", "spring.cloud.consul.enabled", False)
    eureka_enabled = src.get_bool("EUREKA_ENABLED", "eureka.client.enabled", False)

    explicit = src.get("REGISTRY_TYPE", "", "").strip().lower()
    if explicit in ("consul", "eureka", "none"):
        registry_type = explicit
    elif consul_enabled and not eureka_enabled:
        registry_type = "consul"
    elif eureka_enabled and not consul_enabled:
        registry_type = "eureka"
    elif consul_enabled and eureka_enabled:
        # 两者同开且未显式指定：拒绝猜测，退回 consul 并告警（与 Spring 一致，consul 优先）
        log.warning("consul 与 eureka 同时启用但未设置 REGISTRY_TYPE，默认使用 consul")
        registry_type = "consul"
    else:
        registry_type = "none"

    tags_raw = src.get("SERVICE_TAGS", "spring.cloud.consul.discovery.tags", "")
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()]

    eureka_urls_raw = src.get(
        "EUREKA_SERVER_URLS",
        "eureka.client.service-url.defaultZone",
        "",
    )
    eureka_urls = [u.strip() for u in eureka_urls_raw.split(",") if u.strip()]

    return RegistryConfig(
        registry_type=registry_type,
        service_name=src.get("SERVICE_NAME", "spring.application.name", "zhipin-server"),
        service_ip=src.get("SERVICE_IP", "", ""),
        service_port=src.get_int("SERVICE_PORT", "server.port", src.get_int("PORT", "", 5000)),
        prefer_ip_address=src.get_bool(
            "SERVICE_PREFER_IP_ADDRESS",
            "spring.cloud.consul.discovery.prefer-ip-address",
            True,
        ),
        secure=src.get_bool("SERVICE_SECURE", "", False),
        health_check_path=src.get(
            "HEALTH_CHECK_PATH",
            "spring.cloud.consul.discovery.health-check-path",
            "/actuator/health",
        ),
        status_page_path=src.get("STATUS_PAGE_PATH", "", "/actuator/info"),
        tags=tags,
        # Consul
        consul_host=src.get("CONSUL_HOST", "spring.cloud.consul.host", "127.0.0.1"),
        consul_port=src.get_int("CONSUL_PORT", "spring.cloud.consul.port", 8500),
        consul_scheme=src.get("CONSUL_SCHEME", "spring.cloud.consul.scheme", "http"),
        consul_token=src.get("CONSUL_TOKEN", "spring.cloud.consul.token", ""),
        consul_register=src.get_bool(
            "CONSUL_REGISTER", "spring.cloud.consul.discovery.register", True
        ),
        consul_check_mode=src.get("CONSUL_CHECK_MODE", "", "http").strip().lower(),
        consul_health_interval=src.get(
            "CONSUL_HEALTH_INTERVAL",
            "spring.cloud.consul.discovery.health-check-interval",
            "10s",
        ),
        consul_health_timeout=src.get(
            "CONSUL_HEALTH_TIMEOUT",
            "spring.cloud.consul.discovery.health-check-timeout",
            "5s",
        ),
        consul_deregister_after=src.get("CONSUL_DEREGISTER_AFTER", "", "1m"),
        consul_ttl=src.get("CONSUL_TTL", "", "30s"),
        # Eureka
        eureka_server_urls=eureka_urls or ["http://127.0.0.1:8761/eureka"],
        eureka_register=src.get_bool("EUREKA_REGISTER", "eureka.client.register-with-eureka", True),
        eureka_heartbeat_interval=src.get_int(
            "EUREKA_HEARTBEAT_INTERVAL", "eureka.instance.lease-renewal-interval-in-seconds", 30
        ),
        eureka_lease_duration=src.get_int(
            "EUREKA_LEASE_DURATION", "eureka.instance.lease-expiration-duration-in-seconds", 90
        ),
    )
