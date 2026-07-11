#!/bin/sh
set -eu

if [ "${ALLOW_EMPTY_DATABASE_BOOTSTRAP:-false}" = "true" ]; then
    echo "Bootstrapping database only when it is truly empty"
    python /app/backend/scripts/bootstrap_database.py --allow-empty
fi

if [ "${AUTO_MIGRATE_DATABASE:-false}" = "true" ]; then
    echo "Applying database migrations before application startup"
    alembic -c /app/backend/alembic.ini upgrade head
fi

exec "$@"
