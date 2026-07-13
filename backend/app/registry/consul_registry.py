"""Consul 注册后端（基于 HTTP Agent API，仅依赖 requests）。

对齐 spring-cloud-starter-consul-discovery 的注册语义：
- prefer-ip-address → 用本机 IP 作为注册地址；
- 默认 HTTP 健康检查（Consul agent 主动拉取 health-check-path），
  与 Spring Cloud Consul 默认行为一致；网络回拉不通的环境可切 TTL 心跳模式。

注意：HTTP 检查要求 Consul agent 能反向访问到本服务 ip:port。若在 SIT 里
Consul 与本服务不在同一网段，应把 CONSUL_CHECK_MODE 设为 ttl，由应用主动上报。
"""
from __future__ import annotations

import logging
import threading

import requests

from .base import ServiceInstance, ServiceRegistry
from .config import RegistryConfig

log = logging.getLogger("app.registry")

_HTTP_TIMEOUT = 5


class ConsulRegistry(ServiceRegistry):
    name = "consul"

    def __init__(self, config: RegistryConfig):
        self.cfg = config
        self._base = f"{config.consul_scheme}://{config.consul_host}:{config.consul_port}"
        self._check_id = ""
        self._hb_thread: threading.Thread | None = None
        self._hb_stop = threading.Event()

    # ── HTTP helpers ────────────────────────────────────────────────
    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.cfg.consul_token:
            h["X-Consul-Token"] = self.cfg.consul_token
        return h

    def _service_payload(self, instance: ServiceInstance) -> dict:
        self._check_id = f"service:{instance.instance_id}"
        payload: dict = {
            "ID": instance.instance_id,
            "Name": instance.service_name,
            "Address": instance.ip,
            "Port": instance.port,
            "Tags": instance.tags or [f"secure={str(instance.secure).lower()}"],
            "Meta": {k: str(v) for k, v in instance.metadata.items()},
        }
        if self.cfg.consul_check_mode == "ttl":
            payload["Check"] = {
                "CheckID": self._check_id,
                "TTL": self.cfg.consul_ttl,
                "DeregisterCriticalServiceAfter": self.cfg.consul_deregister_after,
            }
        else:
            payload["Check"] = {
                "CheckID": self._check_id,
                "HTTP": instance.health_check_url,
                "Interval": self.cfg.consul_health_interval,
                "Timeout": self.cfg.consul_health_timeout,
                "DeregisterCriticalServiceAfter": self.cfg.consul_deregister_after,
            }
        return payload

    # ── ServiceRegistry ─────────────────────────────────────────────
    def register(self, instance: ServiceInstance) -> bool:
        if not self.cfg.consul_register:
            log.info("consul discovery.register=false，跳过注册")
            return True
        try:
            resp = requests.put(
                f"{self._base}/v1/agent/service/register",
                json=self._service_payload(instance),
                headers=self._headers(),
                timeout=_HTTP_TIMEOUT,
            )
            if resp.status_code == 200:
                log.info(
                    "已注册到 Consul：%s (%s:%s) check=%s",
                    instance.instance_id, instance.ip, instance.port, self.cfg.consul_check_mode,
                )
                if self.cfg.consul_check_mode == "ttl":
                    self._pass_ttl()  # 立即上报一次，避免注册后短暂 critical
                return True
            log.error("注册 Consul 失败 HTTP %s：%s", resp.status_code, resp.text[:300])
            return False
        except requests.RequestException as exc:
            log.error("注册 Consul 网络异常：%s", exc)
            return False

    def deregister(self, instance: ServiceInstance) -> bool:
        try:
            resp = requests.put(
                f"{self._base}/v1/agent/service/deregister/{instance.instance_id}",
                headers=self._headers(),
                timeout=_HTTP_TIMEOUT,
            )
            ok = resp.status_code == 200
            log.info("注销 Consul %s：%s", instance.instance_id, "成功" if ok else resp.status_code)
            return ok
        except requests.RequestException as exc:
            log.error("注销 Consul 网络异常：%s", exc)
            return False

    def discover(self, service_name: str) -> list[dict]:
        try:
            resp = requests.get(
                f"{self._base}/v1/health/service/{service_name}",
                params={"passing": "true"},
                headers=self._headers(),
                timeout=_HTTP_TIMEOUT,
            )
            resp.raise_for_status()
            out = []
            for entry in resp.json():
                svc = entry.get("Service", {})
                out.append({
                    "id": svc.get("ID"),
                    "address": svc.get("Address"),
                    "port": svc.get("Port"),
                    "tags": svc.get("Tags", []),
                })
            return out
        except requests.RequestException as exc:
            log.error("查询 Consul 服务异常：%s", exc)
            return []

    # ── TTL 心跳（仅 consul_check_mode=ttl 时启用）───────────────────
    def start(self, instance: ServiceInstance) -> bool:
        ok = self.register(instance)
        if ok and self.cfg.consul_check_mode == "ttl":
            self._start_heartbeat()
        return ok

    def stop(self, instance: ServiceInstance) -> bool:
        self._hb_stop.set()
        if self._hb_thread:
            self._hb_thread.join(timeout=2)
        return self.deregister(instance)

    def _pass_ttl(self) -> None:
        try:
            requests.put(
                f"{self._base}/v1/agent/check/pass/{self._check_id}",
                headers=self._headers(),
                timeout=_HTTP_TIMEOUT,
            )
        except requests.RequestException as exc:
            log.warning("Consul TTL 心跳上报失败：%s", exc)

    def _start_heartbeat(self) -> None:
        # TTL 例如 "30s"：取一半间隔上报，留足余量
        try:
            ttl_secs = int(self.cfg.consul_ttl.rstrip("s") or "30")
        except ValueError:
            ttl_secs = 30
        interval = max(5, ttl_secs // 2)

        def loop():
            while not self._hb_stop.wait(interval):
                self._pass_ttl()

        self._hb_thread = threading.Thread(target=loop, name="consul-ttl-heartbeat", daemon=True)
        self._hb_thread.start()
