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
# dev 以实测可连、且已配置 zhipin 应用的 10.206.20.59 为准（早期资料里的
# 10.201.250.29 未采用，如仍需请与运维核对）。
META_BY_ENV = {
    "dev": "http://10.206.20.59:8080",
    "sit": "http://10.206.34.115:8080",
    "fat": "http://10.206.152.49:8080",
    "pre": "http://172.16.24.139:8080",
    "pre_wx": "http://10.205.59.84:8080",
    "pro": "http://172.16.37.83:8080",
    "pro_wx": "http://10.205.73.203:8080",
}

_HTTP_TIMEOUT = 5
_loaded = False  # 进程级幂等标记（fork 会被子进程继承）


def _env_any(*names: str, default: str = "") -> str:
    """返回候选环境变量名里第一个已设置且非空的值（兼容不同命名）。"""
    for name in names:
        value = os.environ.get(name)
        if value is not None and str(value).strip() != "":
            return str(value).strip()
    return default


# APOLLO_ENV 未设置时的默认环境。
DEFAULT_APOLLO_ENV = "sit"


def _apollo_env() -> str:
    """当前 Apollo 环境（未设置则默认 sit）。兼容 APOLLO_ENV / APOLL_ENV。"""
    return _env_any("APOLLO_ENV", "APOLL_ENV", default=DEFAULT_APOLLO_ENV).lower()


def _meta_address() -> str:
    """Apollo 地址来源优先级：
    运维注入的 APOLLO_SERVER_URL / APOLLO_META > 按 APOLLO_ENV 从内置表兜底。
    """
    explicit = _env_any("APOLLO_SERVER_URL", "APOLLO_META")
    if explicit:
        return explicit.rstrip("/")
    return META_BY_ENV.get(_apollo_env(), "").rstrip("/")


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

    enabled_raw = _env_any("APOLLO_ENABLED", "APOLL_ENABLED", default="false")
    if enabled_raw.lower() != "true":
        log.info("Apollo 未启用（APOLLO_ENABLED=%r），跳过，走环境变量配置", enabled_raw)
        return {"enabled": False}

    _loaded = True  # 尽早置位，避免并发/重入重复拉取
    meta = _meta_address()
    env_is_default = not _env_any("APOLLO_ENV", "APOLL_ENV")
    apollo_env = _apollo_env() + ("(默认)" if env_is_default else "")
    if not meta:
        msg = (
            f"Apollo 已启用但未解析到地址（APOLLO_ENV={apollo_env} 不在内置表中，"
            f"且未注入 APOLLO_SERVER_URL / APOLLO_META）"
        )
        log.error(msg)
        if (os.environ.get("APOLLO_FAIL_FAST") or "false").lower() == "true":
            raise RuntimeError(msg)
        return {"enabled": True, "error": msg}

    # appId 写死为 zhipin：服务器上 APOLLO_APP_ID 被误配为 zhipin-mvp，这里刻意忽略
    # 该环境变量，始终只读 zhipin。（多 appId 拉取逻辑保留，仅入口固定为 zhipin。）
    app_ids = ["zhipin"]
    cluster = _env_any("APOLLO_CLUSTER", default="default")
    namespaces = [
        n.strip() for n in _env_any("APOLLO_NAMESPACES", default="application").split(",") if n.strip()
    ]
    secret = _env_any("APOLLO_SECRET")
    override = _env_any("APOLLO_OVERRIDE_ENV", default="false").lower() == "true"

    # 拉取前先打目标，网络卡住/超时时也能从日志看出在连哪个地址。
    log.info(
        "Apollo 开始连接：meta=%s env=%s app=%s cluster=%s ns=%s secret=%s override=%s",
        meta, apollo_env, ",".join(app_ids), cluster, ",".join(namespaces),
        "有" if secret else "无", override,
    )

    servers = _config_servers(meta, app_ids[0], secret)
    log.info("Apollo config service：%s", servers)
    merged: dict[str, str] = {}
    errors = []
    for app_id in app_ids:
        for namespace in namespaces:
            pulled = None
            for server in servers:
                try:
                    pulled = _pull_namespace(server, app_id, cluster, namespace, secret)
                    log.info("Apollo %s/%s 拉取成功（%d 个 key）", app_id, namespace, len(pulled))
                    break
                except requests.RequestException as exc:
                    errors.append(f"{app_id}/{namespace}@{server}: {exc}")
                    log.warning("Apollo %s/%s 拉取失败 @%s：%s", app_id, namespace, server, exc)
            if pulled:
                merged.update(pulled)

    if not merged and errors:
        msg = f"Apollo 连接/拉取失败（meta={meta} app={app_ids}）：{errors[0]}"
        log.error(msg)
        if (os.environ.get("APOLLO_FAIL_FAST") or "false").lower() == "true":
            raise RuntimeError(msg)
        return {"enabled": True, "meta": meta, "app_ids": app_ids, "keys": 0, "error": msg}

    injected_keys = []
    skipped_existing = []
    for key, value in merged.items():
        # 永远不让 Apollo 配置覆盖 Apollo 自身的引导参数（meta/env/开关等）。
        if key.startswith("APOLLO_"):
            continue
        if override or key not in os.environ:
            os.environ[key] = value
            injected_keys.append(key)
        else:
            skipped_existing.append(key)

    # 只打 key 名，不打 value（可能是密钥）。
    log.info(
        "Apollo 连接成功：meta=%s app=%s 注入%d个key=%s%s",
        meta, ",".join(app_ids), len(injected_keys), sorted(injected_keys),
        f"；跳过{len(skipped_existing)}个已存在环境变量={sorted(skipped_existing)}" if skipped_existing else "",
    )
    return {
        "enabled": True,
        "meta": meta,
        "app_ids": app_ids,
        "cluster": cluster,
        "namespaces": namespaces,
        "keys": len(injected_keys),
        "injected_keys": sorted(injected_keys),
    }
