#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -P -- "$(dirname -- "$0")" && pwd)
RELEASE_MARKER="$SCRIPT_DIR/.release-channel"

if [ ! -r "$RELEASE_MARKER" ]; then
    echo "Refusing startup: release channel marker is missing" >&2
    exit 1
fi

RELEASE_CHANNEL=$(cat "$RELEASE_MARKER")

require_ga_value() {
    variable_name=$1
    actual_value=$2
    expected_value=$3
    normalized_value=$(printf '%s' "$actual_value" | tr '[:upper:]' '[:lower:]')
    if [ "$normalized_value" != "$expected_value" ]; then
        echo "Refusing GA startup: $variable_name must be $expected_value" >&2
        exit 1
    fi
}

case "$RELEASE_CHANNEL" in
    RC)
        # RC/SIT 镜像默认开启服务注册并指向 SIT Consul（无 K8S/Libra env 注入时兜底）。
        # 运行时 env 始终优先（:= 仅在变量未设置/为空时才赋默认）。
        # GA 分支不设这些默认，保持“默认不注册”，避免生产误连 SIT 注册中心。
        : "${CONSUL_ENABLED:=true}"
        : "${EUREKA_ENABLED:=false}"
        : "${CONSUL_HOST:=consul.tomcat.tomcat.01.sit}"
        : "${CONSUL_PORT:=8500}"
        : "${SERVICE_NAME:=zhipin-server}"
        : "${SERVICE_PORT:=5000}"
        : "${CONSUL_CHECK_MODE:=ttl}"
        export CONSUL_ENABLED EUREKA_ENABLED CONSUL_HOST CONSUL_PORT \
               SERVICE_NAME SERVICE_PORT CONSUL_CHECK_MODE
        echo "RC 默认服务注册：CONSUL_ENABLED=$CONSUL_ENABLED CONSUL_HOST=$CONSUL_HOST CONSUL_PORT=$CONSUL_PORT CHECK_MODE=$CONSUL_CHECK_MODE"
        ;;
    GA)
        require_ga_value ALLOW_INSECURE_SIT_STARTUP "${ALLOW_INSECURE_SIT_STARTUP:-}" false
        require_ga_value AUTO_MIGRATE_DATABASE "${AUTO_MIGRATE_DATABASE:-}" false
        require_ga_value ALLOW_EMPTY_DATABASE_BOOTSTRAP "${ALLOW_EMPTY_DATABASE_BOOTSTRAP:-}" false
        require_ga_value SECURITY_HEADERS_ENABLED "${SECURITY_HEADERS_ENABLED:-}" true
        require_ga_value RATE_LIMIT_ENABLED "${RATE_LIMIT_ENABLED:-}" true
        require_ga_value ALLOW_PUBLIC_REGISTRATION "${ALLOW_PUBLIC_REGISTRATION:-}" false
        ;;
    *)
        echo "Refusing startup: unknown release channel '$RELEASE_CHANNEL'" >&2
        exit 1
        ;;
esac

if [ "${ALLOW_EMPTY_DATABASE_BOOTSTRAP:-false}" = "true" ]; then
    echo "Bootstrapping database only when it is truly empty"
    python /app/backend/scripts/bootstrap_database.py --allow-empty
fi

if [ "${AUTO_MIGRATE_DATABASE:-false}" = "true" ]; then
    echo "Applying database migrations before application startup"
    alembic -c /app/backend/alembic.ini upgrade head
fi

# 切到脚本所在目录（/app/backend）再启动应用：即使编排层覆盖了 workingDir，
# gunicorn 的相对配置路径（gunicorn.conf.py）、run:app 等也能稳定解析。
cd "$SCRIPT_DIR"

exec "$@"
