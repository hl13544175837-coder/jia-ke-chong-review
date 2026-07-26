#!/usr/bin/env bash

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/isolated-demo-common.sh"

status=0

check_process() {
  local label="$1"
  local pid_file="$2"
  local pid
  if pid="$(read_owned_pid "$pid_file" 2>/dev/null)"; then
    echo "${label}：运行中（进程 ${pid}）"
  else
    echo "${label}：未运行"
    status=1
  fi
}

check_url() {
  local label="$1"
  local url="$2"
  if curl --silent --fail --max-time 3 "$url" >/dev/null; then
    echo "${label}：可访问"
  else
    echo "${label}：不可访问（${url}）"
    status=1
  fi
}

check_process "后端" "$BACKEND_PID_FILE"
check_process "登录桥" "$OAUTH_PID_FILE"
check_process "完整 Readdy 前端" "$FRONTEND_PID_FILE"
check_url "后端健康检查" "http://127.0.0.1:$BACKEND_PORT/api/health"
check_url "登录桥健康检查" "http://127.0.0.1:$OAUTH_PORT/health"
check_url "完整 Readdy 前端页面（5190）" "http://127.0.0.1:$FRONTEND_PORT"
print_access_urls

exit "$status"
