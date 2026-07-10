#!/bin/sh
set -eu

if [ "${AUTO_MIGRATE_DATABASE:-false}" = "true" ]; then
    echo "Applying database migrations before application startup"
    alembic upgrade head
fi

exec "$@"
