#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_ROOT="$APP_ROOT/runtime"

BACKEND_PORT=5010
OAUTH_PORT=5110
FRONTEND_PORT=5190

DATABASE_PATH="$RUNTIME_ROOT/zhipin-demo.db"
UPLOAD_ROOT="$RUNTIME_ROOT/uploads"
LOG_ROOT="$RUNTIME_ROOT/logs"
PID_ROOT="$RUNTIME_ROOT/pids"

BACKEND_PID_FILE="$PID_ROOT/backend.pid"
OAUTH_PID_FILE="$PID_ROOT/oauth.pid"
FRONTEND_PID_FILE="$PID_ROOT/frontend.pid"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少运行命令：$1" >&2
    exit 1
  fi
}

pid_is_running() {
  local pid="${1:-}"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" >/dev/null 2>&1
}

pid_belongs_to_app() {
  local pid="${1:-}"
  local command_line
  pid_is_running "$pid" || return 1
  command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$command_line" == *"$APP_ROOT"* || "$command_line" == *"$RUNTIME_ROOT"* ]]
}

read_owned_pid() {
  local pid_file="$1"
  local pid
  [[ -f "$pid_file" ]] || return 1
  pid="$(tr -d '[:space:]' < "$pid_file")"
  pid_belongs_to_app "$pid" || return 1
  printf '%s\n' "$pid"
}

assert_port_free() {
  local port="$1"
  local label="$2"
  local owners
  owners="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -n "$owners" ]]; then
    echo "$label 端口 $port 已被占用（进程：${owners}），为保护其他项目已停止启动。" >&2
    exit 1
  fi
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --silent --fail --max-time 2 "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "$label 未在预期时间内就绪：$url" >&2
  return 1
}

stop_service() {
  local label="$1"
  local pid_file="$2"
  local pid

  if [[ ! -f "$pid_file" ]]; then
    echo "${label}：未发现本项目进程记录。"
    return 0
  fi

  pid="$(tr -d '[:space:]' < "$pid_file")"
  if ! pid_is_running "$pid"; then
    rm -f "$pid_file"
    echo "${label}：进程已停止，已清理旧记录。"
    return 0
  fi

  if ! pid_belongs_to_app "$pid"; then
    echo "${label}：进程 $pid 不属于本项目，为保护其他产品不会终止它。" >&2
    return 1
  fi

  kill "$pid"
  for _ in {1..20}; do
    if ! pid_is_running "$pid"; then
      rm -f "$pid_file"
      echo "${label}：已停止。"
      return 0
    fi
    sleep 0.5
  done

  kill -9 "$pid"
  rm -f "$pid_file"
  echo "${label}：已强制停止本项目进程。"
}

lan_ip() {
  local interface
  local address
  for interface in en0 en1; do
    address="$(ipconfig getifaddr "$interface" 2>/dev/null || true)"
    if [[ -n "$address" ]]; then
      printf '%s\n' "$address"
      return 0
    fi
  done
  return 1
}

print_access_urls() {
  local address
  echo "完整 Readdy 前端：http://127.0.0.1:$FRONTEND_PORT"
  address="$(lan_ip || true)"
  if [[ -n "$address" ]]; then
    echo "同一内网完整 Readdy 前端：http://$address:$FRONTEND_PORT"
  else
    echo "同一内网：暂未检测到有效 Wi-Fi/网线地址。"
  fi
}
