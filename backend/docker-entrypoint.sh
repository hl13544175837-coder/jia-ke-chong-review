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

exec "$@"
