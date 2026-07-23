#!/usr/bin/env bash

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/isolated-demo-common.sh"

require_command curl
require_command lsof
require_command node
require_command ps

PYTHON_BIN="$APP_ROOT/.venv/bin/python"
GUNICORN_BIN="$APP_ROOT/.venv/bin/gunicorn"
NODE_BIN="$(command -v node)"
VITE_BIN="$APP_ROOT/frontend/node_modules/vite/bin/vite.js"

for executable in "$PYTHON_BIN" "$GUNICORN_BIN" "$NODE_BIN" "$VITE_BIN"; do
  if [[ ! -x "$executable" && "$executable" != *.js ]]; then
    echo "缺少依赖：$executable" >&2
    exit 1
  fi
done
if [[ ! -f "$VITE_BIN" ]]; then
  echo "缺少前端依赖，请先在 frontend 目录运行 npm ci。" >&2
  exit 1
fi

mkdir -p "$UPLOAD_ROOT" "$LOG_ROOT" "$PID_ROOT"

if read_owned_pid "$BACKEND_PID_FILE" >/dev/null \
  && read_owned_pid "$OAUTH_PID_FILE" >/dev/null \
  && read_owned_pid "$FRONTEND_PID_FILE" >/dev/null; then
  echo "独立演示环境已经在运行。"
  print_access_urls
  exit 0
fi

for pid_file in "$BACKEND_PID_FILE" "$OAUTH_PID_FILE" "$FRONTEND_PID_FILE"; do
  if [[ -f "$pid_file" ]] && ! read_owned_pid "$pid_file" >/dev/null; then
    rm -f "$pid_file"
  fi
done

assert_port_free "$BACKEND_PORT" "后端"
assert_port_free "$OAUTH_PORT" "登录桥"
assert_port_free "$FRONTEND_PORT" "前端"

BACKEND_ENV=(
  "APOLLO_ENABLED=false"
  "CONSUL_ENABLED=false"
  "EUREKA_ENABLED=false"
  "FLASK_DEBUG=true"
  "LOCAL_SCHEMA_COMPAT=true"
  "DATABASE_URL=sqlite:///$DATABASE_PATH"
  "UPLOAD_FOLDER=$UPLOAD_ROOT"
  "JWT_SECRET=isolated-demo-only-20260724-do-not-use-in-production"
  "RATE_LIMIT_ENABLED=false"
  "ALLOW_PUBLIC_REGISTRATION=false"
  "AUTH_DISABLED=false"
  "LLM_API_KEY="
  "PORT=$BACKEND_PORT"
)

if [[ ! -f "$DATABASE_PATH" ]]; then
  echo "首次运行：正在创建独立演示数据库……"
  (
    cd "$APP_ROOT/backend"
    env "${BACKEND_ENV[@]}" "$PYTHON_BIN" seed_dev.py
  ) >"$LOG_ROOT/seed.log" 2>&1
fi

cleanup_partial_start() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    echo "启动没有完成，正在只清理本项目刚启动的进程……" >&2
    stop_service "前端" "$FRONTEND_PID_FILE" || true
    stop_service "登录桥" "$OAUTH_PID_FILE" || true
    stop_service "后端" "$BACKEND_PID_FILE" || true
  fi
  exit "$status"
}
trap cleanup_partial_start EXIT

echo "正在启动独立后端……"
(
  cd "$APP_ROOT/backend"
  nohup env "${BACKEND_ENV[@]}" "$GUNICORN_BIN" \
    --workers 1 \
    --bind "0.0.0.0:$BACKEND_PORT" \
    --timeout 120 \
    --keep-alive 5 \
    --pid "$BACKEND_PID_FILE" \
    --access-logfile "$LOG_ROOT/backend-access.log" \
    --error-logfile "$LOG_ROOT/backend-error.log" \
    --capture-output \
    run:app >/dev/null 2>&1 &
)
wait_for_url "http://127.0.0.1:$BACKEND_PORT/api/health" "后端"

echo "正在启动独立登录桥……"
nohup env \
  "LOCAL_OAUTH_BRIDGE_PORT=$OAUTH_PORT" \
  "LOCAL_OAUTH_BACKEND_BASE=http://127.0.0.1:$BACKEND_PORT/api" \
  "LOCAL_OAUTH_FRONTEND_ORIGIN=http://127.0.0.1:$FRONTEND_PORT" \
  "$NODE_BIN" "$APP_ROOT/frontend/scripts/local-oauth-bridge.mjs" \
  >"$LOG_ROOT/oauth.log" 2>&1 &
printf '%s\n' "$!" >"$OAUTH_PID_FILE"
wait_for_url "http://127.0.0.1:$OAUTH_PORT/health" "登录桥"

echo "正在启动独立前端……"
(
  cd "$APP_ROOT/frontend"
  nohup env \
    "LOCAL_BACKEND_PROXY_TARGET=http://127.0.0.1:$BACKEND_PORT" \
    "LOCAL_OAUTH_PROXY_TARGET=http://127.0.0.1:$OAUTH_PORT" \
    "VITE_API_BASE_URL=/api" \
    "VITE_OAUTH_BASE_URL=/pgs/oauth" \
    "VITE_ALLOW_LAN=true" \
    "$NODE_BIN" "$VITE_BIN" \
    --host 0.0.0.0 --port "$FRONTEND_PORT" --strictPort \
    >"$LOG_ROOT/frontend.log" 2>&1 &
  printf '%s\n' "$!" >"$FRONTEND_PID_FILE"
)
wait_for_url "http://127.0.0.1:$FRONTEND_PORT" "前端"

trap - EXIT

echo
echo "独立演示环境已启动。"
print_access_urls
echo "账号：admin01（也可用 manager01、hr01、interviewer01）"
echo "密码：Zhipin2026"
echo "运行数据：$RUNTIME_ROOT"
