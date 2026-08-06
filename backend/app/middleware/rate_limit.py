from collections import OrderedDict, deque
from functools import wraps
from threading import Lock
from time import monotonic

from flask import current_app, jsonify, request


_buckets = OrderedDict()
_bucket_lock = Lock()


def _client_ip():
    remote = request.remote_addr or "unknown"
    hops = max(
        0,
        int(current_app.config.get("TRUST_PROXY_HOPS", 0) or 0),
    )
    if hops == 0:
        return remote

    forwarded = [
        item.strip()
        for item in request.headers.get("X-Forwarded-For", "").split(",")
        if item.strip()
    ]
    chain = forwarded + [remote]
    return chain[-(hops + 1)] if len(chain) > hops else remote


def _limit_config(name):
    limits = current_app.config.get("RATE_LIMITS") or {}
    return limits.get(name) or {}


def _record_attempt(name, *, now, limit, window):
    key = f"{name}:{_client_ip()}"
    maximum = max(
        1,
        int(current_app.config.get("RATE_LIMIT_BUCKET_MAX", 10000)),
    )
    with _bucket_lock:
        bucket = _buckets.get(key)
        if bucket is None:
            while len(_buckets) >= maximum:
                _buckets.popitem(last=False)
            bucket = deque()
            _buckets[key] = bucket
        _buckets.move_to_end(key)

        while bucket and now - bucket[0] >= window:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(window - (now - bucket[0])))
            return True, retry_after

        bucket.append(now)
        return False, 0


def _reset_rate_limit_state():
    with _bucket_lock:
        _buckets.clear()


def _bucket_count():
    with _bucket_lock:
        return len(_buckets)


def rate_limit(name):
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            if not current_app.config.get("RATE_LIMIT_ENABLED", True):
                return fn(*args, **kwargs)

            config = _limit_config(name)
            limit = int(config.get("limit") or 0)
            window = int(config.get("window_seconds") or 60)
            if limit <= 0:
                return fn(*args, **kwargs)

            blocked, retry_after = _record_attempt(
                name,
                now=monotonic(),
                limit=limit,
                window=window,
            )
            if blocked:
                response = jsonify({"error": "请求过于频繁，请稍后再试"})
                response.status_code = 429
                response.headers["Retry-After"] = str(retry_after)
                return response
            return fn(*args, **kwargs)

        return wrapped

    return decorator
