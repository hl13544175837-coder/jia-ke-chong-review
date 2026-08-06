from app.middleware import rate_limit as limiter


def test_forwarded_for_is_ignored_without_trusted_proxy(app):
    app.config["TRUST_PROXY_HOPS"] = 0
    with app.test_request_context(
        "/",
        headers={"X-Forwarded-For": "198.51.100.9"},
        environ_base={"REMOTE_ADDR": "203.0.113.20"},
    ):
        assert limiter._client_ip() == "203.0.113.20"


def test_one_trusted_proxy_resolves_client_from_right(app):
    app.config["TRUST_PROXY_HOPS"] = 1
    with app.test_request_context(
        "/",
        headers={"X-Forwarded-For": "198.51.100.9"},
        environ_base={"REMOTE_ADDR": "10.0.0.10"},
    ):
        assert limiter._client_ip() == "198.51.100.9"


def test_bucket_store_never_exceeds_configured_limit(app):
    limiter._reset_rate_limit_state()
    app.config.update(RATE_LIMIT_BUCKET_MAX=2, TRUST_PROXY_HOPS=0)
    for address in ("203.0.113.1", "203.0.113.2", "203.0.113.3"):
        with app.test_request_context(
            "/",
            environ_base={"REMOTE_ADDR": address},
        ):
            limiter._record_attempt(
                "auth.login",
                now=1.0,
                limit=10,
                window=60,
            )
    assert limiter._bucket_count() == 2
