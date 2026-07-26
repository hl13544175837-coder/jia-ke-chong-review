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
READDY_VITE_BIN="$APP_ROOT/readdy-frontend/node_modules/vite/bin/vite.js"

for executable in "$PYTHON_BIN" "$GUNICORN_BIN" "$NODE_BIN"; do
  if [[ ! -x "$executable" && "$executable" != *.js ]]; then
    echo "缺少依赖：$executable" >&2
    exit 1
  fi
done
if [[ ! -f "$READDY_VITE_BIN" ]]; then
  echo "缺少完整 Readdy 前端依赖，请先在 readdy-frontend 目录运行 npm ci。" >&2
  exit 1
fi

mkdir -p "$UPLOAD_ROOT" "$LOG_ROOT" "$PID_ROOT"

DATABASE_URL_VALUE="${PILOT_DATABASE_URL:-sqlite:///$DATABASE_PATH}"
LOCAL_SCHEMA_COMPAT_VALUE=true
UPLOAD_FOLDER_VALUE="$UPLOAD_ROOT"
MYSQL_PILOT_MODE=false
if [[ "$DATABASE_URL_VALUE" == mysql* ]]; then
  MYSQL_PILOT_MODE=true
  LOCAL_SCHEMA_COMPAT_VALUE=false
  UPLOAD_FOLDER_VALUE="${UPLOAD_FOLDER:-}"
  if [[ "${PILOT_SCHEMA_VERIFIED:-false}" != "true" ]]; then
    echo "MySQL pilot schema was not verified in this process; startup refused." >&2
    exit 1
  fi
  if [[ -z "$UPLOAD_FOLDER_VALUE" ]]; then
    echo "MySQL pilot UPLOAD_FOLDER is required; startup refused." >&2
    exit 1
  fi
fi

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
assert_port_free "$FRONTEND_PORT" "完整 Readdy 前端"

BACKEND_ENV=(
  "CONSUL_ENABLED=false"
  "EUREKA_ENABLED=false"
  "FLASK_DEBUG=true"
  "LOCAL_SCHEMA_COMPAT=$LOCAL_SCHEMA_COMPAT_VALUE"
  "DATABASE_URL=$DATABASE_URL_VALUE"
  "UPLOAD_FOLDER=$UPLOAD_FOLDER_VALUE"
  "RATE_LIMIT_ENABLED=false"
  "ALLOW_PUBLIC_REGISTRATION=false"
  "AUTH_DISABLED=false"
  "PORT=$BACKEND_PORT"
)

# Apollo、JWT、MCP SSO 和模型密钥只允许来自现有环境、backend/.env 或 CI 注入。
# 本隔离脚本不覆盖也不清空这些公司配置。

if [[ "$MYSQL_PILOT_MODE" == "false" && ! -f "$DATABASE_PATH" ]]; then
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
    stop_service "完整 Readdy 前端" "$FRONTEND_PID_FILE" || true
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

echo "正在启动完整 Readdy 前端……"
if [[ "${READDY_AUTH_MODE:-company}" == "local" ]]; then
  READDY_AUTH_ENV=(
    "COMPANY_GATEWAY_PROXY_TARGET=http://127.0.0.1:$OAUTH_PORT"
    "COMPANY_API_PROXY_TARGET=http://127.0.0.1:$BACKEND_PORT"
    "VITE_API_BASE_URL=/api"
    "VITE_OAUTH_BASE_URL=/pgs/oauth"
    "VITE_PERMISSION_CLIENT_ID=zhipin"
    "VITE_DEFAULT_ROLE=admin"
  )
else
  READDY_AUTH_ENV=(
    "COMPANY_GATEWAY_PROXY_TARGET=${COMPANY_GATEWAY_PROXY_TARGET:-https://pgsgw.yimidida.com}"
    "COMPANY_API_PROXY_TARGET=${COMPANY_API_PROXY_TARGET:-https://pgsgw.yimidida.com}"
    "VITE_API_BASE_URL=https://pgsgw.yimidida.com/zhipin-server/api"
    "VITE_OAUTH_BASE_URL=https://pgsgw.yimidida.com/pgs/oauth"
    "VITE_PERMISSION_CLIENT_ID=zhipin"
    "VITE_DEFAULT_ROLE=admin"
  )
fi
(
  cd "$APP_ROOT/readdy-frontend"
  nohup env "${READDY_AUTH_ENV[@]}" "$NODE_BIN" "$READDY_VITE_BIN" \
    --host 0.0.0.0 --port "$FRONTEND_PORT" --strictPort \
    >"$LOG_ROOT/frontend.log" 2>&1 &
  printf '%s\n' "$!" >"$FRONTEND_PID_FILE"
)
wait_for_url "http://127.0.0.1:$FRONTEND_PORT" "完整 Readdy 前端"

trap - EXIT

echo
echo "独立演示环境已启动。"
print_access_urls
if [[ "${READDY_AUTH_MODE:-company}" == "local" ]]; then
  echo "完整 Readdy 前端本地账号：admin01 / Zhipin2026"
else
  echo "完整 Readdy 前端：使用公司账号和密码，通过公司 OAuth 登录"
fi
echo "运行数据：$RUNTIME_ROOT"
