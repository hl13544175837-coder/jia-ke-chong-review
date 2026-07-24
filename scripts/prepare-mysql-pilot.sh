#!/usr/bin/env bash

set -euo pipefail
set +x
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/isolated-demo-common.sh"

ENV_FILE="$RUNTIME_ROOT/mysql-pilot.env"
PYTHON_BIN="$APP_ROOT/.venv/bin/python"

load_mysql_pilot_env() {
  local mode
  if [[ ! -f "$ENV_FILE" || -L "$ENV_FILE" ]]; then
    echo "Missing secure MySQL pilot environment file: ../runtime/mysql-pilot.env" >&2
    exit 1
  fi
  if mode="$(stat -f '%Lp' "$ENV_FILE" 2>/dev/null)"; then
    :
  elif mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null)"; then
    :
  else
    echo "Cannot verify mysql-pilot.env permissions; preparation refused." >&2
    exit 1
  fi
  if [[ "$mode" != "600" ]]; then
    echo "mysql-pilot.env must have mode 600; preparation refused." >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  for name in PILOT_DATABASE_URL JWT_SECRET UPLOAD_FOLDER BACKUP_DIR; do
    if [[ -z "${!name:-}" ]]; then
      echo "mysql-pilot.env is missing required runtime values." >&2
      exit 1
    fi
  done
  if [[ "$PILOT_DATABASE_URL" != mysql://* && "$PILOT_DATABASE_URL" != mysql+pymysql://* ]]; then
    echo "PILOT_DATABASE_URL must select MySQL; preparation refused." >&2
    exit 1
  fi
  export DATABASE_URL="$PILOT_DATABASE_URL"
}

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Missing project Python runtime; preparation refused." >&2
  exit 1
fi

load_mysql_pilot_env
exec "$PYTHON_BIN" "$APP_ROOT/backend/scripts/prepare_mysql_pilot.py" "$@"
