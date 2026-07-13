"""Eureka 注册后端（Netflix Eureka REST + 心跳续约，仅依赖 requests）。

对齐 spring-cloud-starter-netflix-eureka-client 的实例信息与续约语义：
- 注册体使用 Eureka JSON 契约（port/securePort 的 {"$":..,"@enabled":..} 结构）；
- 按 lease-renewal-interval-in-seconds 定时 PUT 续约，续约 404 时自动重注册；
- 支持多 defaultZone（EUREKA_SERVER_URLS 逗号分隔），逐个尝试直到成功。
"""
from __future__ import annotations

import logging
import threading

import requests

from .base import ServiceInstance, ServiceRegistry
from .config import RegistryConfig

log = logging.getLogger("app.registry")

_HTTP_TIMEOUT = 5


class EurekaRegistry(ServiceRegistry):
    name = "eureka"

    def __init__(self, config: RegistryConfig):
        self.cfg = config
        # 归一化 zone：确保以 /eureka 结尾，末尾去掉多余斜杠
        self._zones = [u.rstrip("/") for u in config.eureka_server_urls]
        self._app = config.service_name.upper()
        self._instance: ServiceInstance | None = None
        self._hb_thread: threading.Thread | None = None
        self._hb_stop = threading.Event()

    def _instance_payload(self, instance: ServiceInstance) -> dict:
        return {
            "instance": {
                "instanceId": instance.instance_id,
                "hostName": instance.ip,
                "app": self._app,
                "ipAddr": instance.ip,
                "status": "UP",
                "overriddenStatus": "UNKNOWN",
                "port": {"$": instance.port, "@enabled": str(not instance.secure).lower()},
                "securePort": {"$": 443, "@enabled": str(instance.secure).lower()},
                "countryId": 1,
                "dataCenterInfo": {
                    "@class": "com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo",
                    "name": "MyOwn",
                },
                "leaseInfo": {
                    "renewalIntervalInSecs": self.cfg.eureka_heartbeat_interval,
                    "durationInSecs": self.cfg.eureka_lease_duration,
                },
                "metadata": {k: str(v) for k, v in instance.metadata.items()},
                "homePageUrl": instance.home_page_url or f"{instance.base_url}/",
                "statusPageUrl": instance.status_page_url or f"{instance.base_url}/actuator/info",
                "healthCheckUrl": instance.health_check_url,
                "vipAddress": instance.service_name,
                "secureVipAddress": instance.service_name,
                "isCoordinatingDiscoveryServer": "false",
            }
        }

    # ── ServiceRegistry ─────────────────────────────────────────────
    def register(self, instance: ServiceInstance) -> bool:
        if not self.cfg.eureka_register:
            log.info("eureka register-with-eureka=false，跳过注册")
            return True
        self._instance = instance
        payload = self._instance_payload(instance)
        for zone in self._zones:
            try:
                resp = requests.post(
                    f"{zone}/apps/{self._app}",
                    json=payload,
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                    timeout=_HTTP_TIMEOUT,
                )
                if resp.status_code in (200, 204):
                    log.info("已注册到 Eureka(%s)：%s", zone, instance.instance_id)
                    return True
                log.error("注册 Eureka(%s) 失败 HTTP %s：%s", zone, resp.status_code, resp.text[:300])
            except requests.RequestException as exc:
                log.error("注册 Eureka(%s) 网络异常：%s", zone, exc)
        return False

    def deregister(self, instance: ServiceInstance) -> bool:
        ok = False
        for zone in self._zones:
            try:
                resp = requests.delete(
                    f"{zone}/apps/{self._app}/{instance.instance_id}",
                    timeout=_HTTP_TIMEOUT,
                )
                ok = ok or resp.status_code in (200, 204)
            except requests.RequestException as exc:
                log.error("注销 Eureka(%s) 网络异常：%s", zone, exc)
        log.info("注销 Eureka %s：%s", instance.instance_id, "成功" if ok else "失败")
        return ok

    def discover(self, service_name: str) -> list[dict]:
        app = service_name.upper()
        for zone in self._zones:
            try:
                resp = requests.get(
                    f"{zone}/apps/{app}",
                    headers={"Accept": "application/json"},
                    timeout=_HTTP_TIMEOUT,
                )
                if resp.status_code == 404:
                    return []
                resp.raise_for_status()
                application = resp.json().get("application", {})
                instances = application.get("instance", [])
                if isinstance(instances, dict):
                    instances = [instances]
                return [
                    {
                        "id": i.get("instanceId"),
                        "address": i.get("ipAddr"),
                        "port": (i.get("port") or {}).get("$"),
                        "status": i.get("status"),
                    }
                    for i in instances
                ]
            except requests.RequestException as exc:
                log.error("查询 Eureka(%s) 服务异常：%s", zone, exc)
        return []

    # ── 心跳续约 ────────────────────────────────────────────────────
    def start(self, instance: ServiceInstance) -> bool:
        ok = self.register(instance)
        if ok:
            self._start_heartbeat()
        return ok

    def stop(self, instance: ServiceInstance) -> bool:
        self._hb_stop.set()
        if self._hb_thread:
            self._hb_thread.join(timeout=2)
        return self.deregister(instance)

    def _renew(self) -> None:
        if not self._instance:
            return
        for zone in self._zones:
            try:
                resp = requests.put(
                    f"{zone}/apps/{self._app}/{self._instance.instance_id}",
                    params={"status": "UP"},
                    timeout=_HTTP_TIMEOUT,
                )
                if resp.status_code == 404:
                    # 实例已被 Eureka 剔除（如网络分区后），重新注册
                    log.warning("Eureka 续约 404，重新注册 %s", self._instance.instance_id)
                    self.register(self._instance)
                return
            except requests.RequestException as exc:
                log.warning("Eureka(%s) 续约异常：%s", zone, exc)

    def _start_heartbeat(self) -> None:
        interval = max(5, self.cfg.eureka_heartbeat_interval)

        def loop():
            while not self._hb_stop.wait(interval):
                self._renew()

        self._hb_thread = threading.Thread(target=loop, name="eureka-heartbeat", daemon=True)
        self._hb_thread.start()
