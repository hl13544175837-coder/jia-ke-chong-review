"""Apollo 配置中心接入（携程 Apollo，零第三方依赖，仅用 requests + 标准库）。

思路：启动时从 Apollo 拉取命名空间配置，注入 os.environ，让现有 Config（读环境变量）
透明拿到 Apollo 的值。应用代码无需改动——Apollo 里的 key 用应用的环境变量名即可
（如 DATABASE_URL / JWT_SECRET / LLM_API_KEY / CONSUL_HOST ...）。

选址：APOLLO_META 显式指定优先；否则按 APOLLO_ENV 从下表选公司 meta 地址。
开关：APOLLO_ENABLED=true 才启用；默认关闭，不影响现有基于环境变量的配置。
覆盖：默认「环境变量优先」（Apollo 只补缺失的 key）；APOLLO_OVERRIDE_ENV=true 则 Apollo 覆盖。
容错：Apollo 不可达时记录日志并继续用环境变量启动（APOLLO_FAIL_FAST=true 则直接失败）。

调用点：run.py 顶部（create_app 之前）+ gunicorn.conf.py 的 on_starting（master fork 前）。
幂等：同进程只真正拉取一次（fork 后 worker 继承 master 已加载状态，不重复拉）。
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import time

import requests

log = logging.getLogger("apollo")

# 公司各环境 Apollo meta 地址（可用 APOLLO_META 覆盖）。
META_BY_ENV = {
    "dev": "http://10.201.250.29:8080",
    "sit": "http://10.206.34.115:8080",
    "fat": "http://10.206.152.49:8080",
    "pre": "http://172.16.24.139:8080",
    "pre_wx": "http://10.205.59.84:8080",
    "pro": "http://172.16.37.83:8080",
    "pro_wx": "http://10.205.73.203:8080",
}

_HTTP_TIMEOUT = 5
_loaded = False  # 进程级幂等标记（fork 会被子进程继承）


def _meta_address() -> str:
    explicit = (os.environ.get("APOLLO_META") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    env = (os.environ.get("APOLLO_ENV") or "").strip().lower()
    return META_BY_ENV.get(env, "").rstrip("/")


def _signed_headers(app_id: str, secret: str, path_with_query: str) -> dict:
    """Apollo 访问密钥签名头（配置了 access key 时需要）。"""
    if not secret:
        return {}
    timestamp = str(int(time.time() * 1000))
    string_to_sign = f"{timestamp}\n{path_with_query}"
    digest = hmac.new(secret.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha1).digest()
    signature = base64.b64encode(digest).decode("utf-8")
    return {"Authorization": f"Apollo {app_id}:{signature}", "Timestamp": timestamp}


def _config_servers(meta: str, app_id: str, secret: str) -> list[str]:
    """通过 meta 的 /services/config 发现 config service；失败则直接用 meta 地址。"""
    path = f"/services/config?appId={app_id}"
    try:
        resp = requests.get(
            f"{meta}{path}",
            headers=_signed_headers(app_id, secret, path),
            timeout=_HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        urls = [
            str(s.get("homepageUrl", "")).rstrip("/")
            for s in resp.json()
            if s.get("homepageUrl")
        ]
        if urls:
            return urls
    except requests.RequestException as exc:
        log.info("Apollo 服务发现失败，直接使用 meta 地址：%s", exc)
    return [meta]


def _pull_namespace(server: str, app_id: str, cluster: str, namespace: str, secret: str) -> dict:
    """拉取单个命名空间的扁平 KV（cached configfiles/json 接口）。"""
    path = f"/configfiles/json/{app_id}/{cluster}/{namespace}"
    resp = requests.get(
        f"{server}{path}",
        headers=_signed_headers(app_id, secret, path),
        timeout=_HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, dict):
        return {}
    return {str(k): str(v) for k, v in data.items()}


def load_apollo_into_environ() -> dict:
    """从 Apollo 拉配置注入 os.environ。返回 {enabled, meta, keys, error} 摘要。"""
    global _loaded
    if _loaded:
        return {"enabled": True, "skipped": "already-loaded"}

    if (os.environ.get("APOLLO_ENABLED") or "false").strip().lower() != "true":
        return {"enabled": False}

    _loaded = True  # 尽早置位，避免并发/重入重复拉取
    meta = _meta_address()
    if not meta:
        msg = "APOLLO_ENABLED=true 但未解析到 meta 地址（设置 APOLLO_ENV 或 APOLLO_META）"
        log.error(msg)
        if (os.environ.get("APOLLO_FAIL_FAST") or "false").lower() == "true":
            raise RuntimeError(msg)
        return {"enabled": True, "error": msg}

    app_id = (os.environ.get("APOLLO_APP_ID") or "zhipin").strip()
    cluster = (os.environ.get("APOLLO_CLUSTER") or "default").strip()
    namespaces = [
        n.strip() for n in (os.environ.get("APOLLO_NAMESPACES") or "application").split(",") if n.strip()
    ]
    secret = (os.environ.get("APOLLO_SECRET") or "").strip()
    override = (os.environ.get("APOLLO_OVERRIDE_ENV") or "false").lower() == "true"

    servers = _config_servers(meta, app_id, secret)
    merged: dict[str, str] = {}
    errors = []
    for namespace in namespaces:
        pulled = None
        for server in servers:
            try:
                pulled = _pull_namespace(server, app_id, cluster, namespace, secret)
                break
            except requests.RequestException as exc:
                errors.append(f"{namespace}@{server}: {exc}")
        if pulled:
            merged.update(pulled)

    if not merged and errors:
        msg = f"Apollo 拉取失败（meta={meta} app={app_id}）：{errors[0]}"
        log.error(msg)
        if (os.environ.get("APOLLO_FAIL_FAST") or "false").lower() == "true":
            raise RuntimeError(msg)
        return {"enabled": True, "meta": meta, "app_id": app_id, "keys": 0, "error": msg}

    injected = 0
    for key, value in merged.items():
        # 永远不让 Apollo 配置覆盖 Apollo 自身的引导参数（meta/env/开关等）。
        if key.startswith("APOLLO_"):
            continue
        if override or key not in os.environ:
            os.environ[key] = value
            injected += 1

    log.info(
        "Apollo 配置已加载：meta=%s app=%s cluster=%s ns=%s 注入%d个key(override=%s)",
        meta, app_id, cluster, ",".join(namespaces), injected, override,
    )
    return {
        "enabled": True,
        "meta": meta,
        "app_id": app_id,
        "cluster": cluster,
        "namespaces": namespaces,
        "keys": injected,
    }
