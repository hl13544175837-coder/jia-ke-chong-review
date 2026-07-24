#!/usr/bin/env bash

set -euo pipefail
set +x
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/isolated-demo-common.sh"

ENV_FILE="$RUNTIME_ROOT/mysql-pilot.env"
PYTHON_BIN="$APP_ROOT/.venv/bin/python"
status=0

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
    echo "Cannot verify mysql-pilot.env permissions; check refused." >&2
    exit 1
  fi
  if [[ "$mode" != "600" ]]; then
    echo "mysql-pilot.env must have mode 600; check refused." >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  if [[ -z "${PILOT_DATABASE_URL:-}" ]]; then
    echo "mysql-pilot.env is missing required runtime values." >&2
    exit 1
  fi
  if [[ "$PILOT_DATABASE_URL" != mysql://* && "$PILOT_DATABASE_URL" != mysql+pymysql://* ]]; then
    echo "PILOT_DATABASE_URL must select MySQL; check refused." >&2
    exit 1
  fi
  export DATABASE_URL="$PILOT_DATABASE_URL"
}

check_port() {
  local label="$1"
  local port="$2"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "${label}: port ${port} is listening"
  else
    echo "${label}: port ${port} is not listening"
    status=1
  fi
}

check_url() {
  local label="$1"
  local url="$2"
  if curl --silent --fail --max-time 3 "$url" >/dev/null; then
    echo "${label}: ready"
  else
    echo "${label}: unavailable (${url})"
    status=1
  fi
}

require_command curl
require_command lsof
if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Missing project Python runtime; check refused." >&2
  exit 1
fi

load_mysql_pilot_env
check_port "backend" "$BACKEND_PORT"
check_port "OAuth bridge" "$OAUTH_PORT"
check_port "product frontend" "$FRONTEND_PORT"
check_port "operations frontend" "$OPERATIONS_PORT"
check_url "backend health" "http://127.0.0.1:$BACKEND_PORT/api/health"

if "$PYTHON_BIN" "$APP_ROOT/backend/scripts/audit_mysql_pilot_schema.py" --require-compatible; then
  echo "database and schema revision: compatible"
else
  echo "database or schema revision: not compatible" >&2
  status=1
fi

exit "$status"
