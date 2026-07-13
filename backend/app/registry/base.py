"""服务注册抽象层。

ServiceInstance 描述一个待注册实例；ServiceRegistry 是 Consul / Eureka 两种
后端的统一契约。所有实现都必须做到：
- register() / deregister() 幂等，可安全重复调用；
- 网络异常不抛到调用方（注册失败不应拖垮应用启动），只记日志并返回 False；
- start() 负责注册并按需拉起心跳线程，stop() 负责停心跳并注销。
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

log = logging.getLogger("app.registry")


@dataclass
class ServiceInstance:
    """一次注册所需的全部实例信息（与具体注册中心无关）。"""

    service_name: str
    instance_id: str
    ip: str
    port: int
    secure: bool = False
    health_check_url: str = ""
    status_page_url: str = ""
    home_page_url: str = ""
    tags: list[str] = field(default_factory=list)
    metadata: dict[str, str] = field(default_factory=dict)

    @property
    def scheme(self) -> str:
        return "https" if self.secure else "http"

    @property
    def base_url(self) -> str:
        return f"{self.scheme}://{self.ip}:{self.port}"


class ServiceRegistry(ABC):
    """注册后端契约。"""

    #: 展示名，用于日志与烟测输出
    name: str = "registry"

    @abstractmethod
    def register(self, instance: ServiceInstance) -> bool:
        """把实例注册进注册中心。返回是否成功。"""

    @abstractmethod
    def deregister(self, instance: ServiceInstance) -> bool:
        """注销实例。返回是否成功。"""

    def start(self, instance: ServiceInstance) -> bool:
        """默认生命周期：仅注册。需要心跳的后端覆写本方法。"""
        return self.register(instance)

    def stop(self, instance: ServiceInstance) -> bool:
        """默认生命周期：仅注销。"""
        return self.deregister(instance)

    @abstractmethod
    def discover(self, service_name: str) -> list[dict]:
        """按服务名查询健康实例，主要用于烟测/自检。返回实例字典列表。"""


class NoopRegistry(ServiceRegistry):
    """未启用任何注册中心时的空实现（K8S 原生服务发现场景）。"""

    name = "noop"

    def register(self, instance: ServiceInstance) -> bool:
        log.info("服务注册未启用（noop），跳过注册 %s", instance.instance_id)
        return True

    def deregister(self, instance: ServiceInstance) -> bool:
        return True

    def discover(self, service_name: str) -> list[dict]:
        return []
