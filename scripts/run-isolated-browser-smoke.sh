#!/usr/bin/env bash

set -Eeuo pipefail
set -m

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PYTHON_DOCKER_IMAGE="${PYTHON_DOCKER_IMAGE:-}"
PLAYWRIGHT_DOCKER_IMAGE="${PLAYWRIGHT_DOCKER_IMAGE:-}"
BACKEND_CONTAINER_NAME=""
if [[ -n "$PYTHON_DOCKER_IMAGE" ]]; then
  PYTHON_BIN=""
  DOCKER_CMD=(sudo docker)
  BACKEND_CONTAINER_NAME="zhipin-browser-smoke-${CI_JOB_ID:-$$}"
elif [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON_BIN="$PYTHON_BIN"
elif [[ -x "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/.venv/bin/python" ]]; then
  PYTHON_BIN="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/.venv/bin/python"
else
  PYTHON_BIN=python3
fi
NODE_BIN="${NODE_BIN:-node}"
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
SMOKE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/zhipin-browser-smoke.XXXXXX")"
DATABASE_URL="sqlite:///$SMOKE_ROOT/smoke.db"
UPLOAD_FOLDER="$SMOKE_ROOT/uploads"
LOG_DIR="$SMOKE_ROOT/logs"
BACKEND_PID=""
OAUTH_PID=""
FRONTEND_PID=""
LOG_FILES=()
PIDS=()

mkdir -p "$UPLOAD_FOLDER" "$LOG_DIR"

cleanup() {
  local status=$?
  trap - EXIT INT TERM HUP
  # macOS 自带 Bash 3.2 在 nounset 下展开空数组会报错；清理阶段必须始终可执行。
  set +eu
  local pid
  local active_pids=("${PIDS[@]}")
  local active_logs=("${LOG_FILES[@]}")
  if [[ -n "$BACKEND_CONTAINER_NAME" ]]; then
    "${DOCKER_CMD[@]}" rm -f "$BACKEND_CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  for pid in "${active_pids[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  for _ in {1..40}; do
    local any_running=false
    for pid in "${active_pids[@]}"; do
      if kill -0 "$pid" >/dev/null 2>&1; then any_running=true; break; fi
    done
    [[ "$any_running" == false ]] && break
    sleep 0.1
  done
  for pid in "${active_pids[@]}"; do
    kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done
  local artifact_dir="$PROJECT_DIR/readdy-frontend/test-results/service-logs"
  mkdir -p "$artifact_dir"
  local log_file
  for log_file in "${active_logs[@]}"; do
    [[ -f "$log_file" ]] && cp "$log_file" "$artifact_dir/$(basename "$log_file")" || true
  done
  if [[ $status -ne 0 ]]; then
    printf '\n[浏览器冒烟失败：服务日志]\n' >&2
    for log_file in "${active_logs[@]}"; do
      [[ -f "$log_file" ]] || continue
      printf '\n===== %s =====\n' "$(basename "$log_file")" >&2
      tail -n 120 "$log_file" >&2 || true
    done
  fi
  case "$SMOKE_ROOT" in
    "${TMPDIR:-/tmp}"/zhipin-browser-smoke.*) rm -rf -- "$SMOKE_ROOT" ;;
    *) echo "拒绝清理非预期临时目录：$SMOKE_ROOT" >&2 ;;
  esac
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

wait_for_url() {
  local url="$1"
  local label="$2"
  local pid="$3"
  local log_file="$4"
  for _ in {1..60}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "$label 在就绪前退出。" >&2
      tail -n 120 "$log_file" >&2 || true
      return 1
    fi
    if curl --noproxy '*' --silent --fail --max-time 2 "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "$label 未在 60 秒内就绪：$url" >&2
  return 1
}

wait_for_container_url() {
  local url="$1"
  local label="$2"
  local container_name="$3"
  local log_file="$4"
  for _ in {1..60}; do
    if [[ "$("${DOCKER_CMD[@]}" inspect --format '{{.State.Running}}' "$container_name" 2>/dev/null || true)" != "true" ]]; then
      echo "$label 容器在就绪前退出。" >&2
      "${DOCKER_CMD[@]}" logs "$container_name" >&2 || true
      return 1
    fi
    if curl --noproxy '*' --silent --fail --max-time 2 "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "$label 未在 60 秒内就绪：$url" >&2
  "${DOCKER_CMD[@]}" logs "$container_name" >&2 || true
  return 1
}

REQUIRED_COMMANDS=("$NODE_BIN" curl)
if [[ -n "$PYTHON_DOCKER_IMAGE" ]]; then
  REQUIRED_COMMANDS+=(sudo docker)
else
  REQUIRED_COMMANDS+=("$PYTHON_BIN")
fi
for command in "${REQUIRED_COMMANDS[@]}"; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "缺少浏览器冒烟依赖：$command" >&2
    exit 1
  }
done

if [[ -n "$PYTHON_DOCKER_IMAGE" ]]; then
  "${DOCKER_CMD[@]}" run --rm "$PYTHON_DOCKER_IMAGE" \
    python -c 'import flask, sqlalchemy, alembic, gunicorn, bcrypt; import sys; assert (3, 11) <= sys.version_info[:2] < (3, 14)'
else
  "$PYTHON_BIN" -c 'import flask, sqlalchemy, alembic, gunicorn, bcrypt'
  "$PYTHON_BIN" -c 'import sys; assert (3, 11) <= sys.version_info[:2] < (3, 14), f"需要 Python 3.11-3.13，当前 {sys.version.split()[0]}"'
fi
"$NODE_BIN" -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (!((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22)) throw new Error(`需要 Node 20.19-20.x 或 22.12+，当前 ${process.versions.node}`)'

HEAD_SHA="$(git -C "$PROJECT_DIR" rev-parse HEAD)"
if [[ -n "${CI_COMMIT_SHA:-}" && "$HEAD_SHA" != "$CI_COMMIT_SHA" ]]; then
  echo "Runner checkout 错误：HEAD=$HEAD_SHA，CI_COMMIT_SHA=$CI_COMMIT_SHA" >&2
  exit 1
fi

PORTS=()
ALLOCATED_PORT=""
allocate_port() {
  local port
  while :; do
    port="$("$NODE_BIN" -e 'const net=require("net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
    [[ " ${PORTS[*]:-} " == *" $port "* ]] || break
  done
  PORTS+=("$port")
  ALLOCATED_PORT="$port"
}
allocate_port; BACKEND_PORT="$ALLOCATED_PORT"
allocate_port; OAUTH_PORT="$ALLOCATED_PORT"
allocate_port; FRONTEND_PORT="$ALLOCATED_PORT"

[[ -x "$PROJECT_DIR/readdy-frontend/node_modules/.bin/playwright" ]] || {
  echo "缺少 Playwright，请先安装前端依赖。" >&2
  exit 1
}

COMMON_BACKEND_ENV=(
  "DATABASE_URL=$DATABASE_URL"
  "UPLOAD_FOLDER=$UPLOAD_FOLDER"
  "FLASK_DEBUG=false"
  "ALLOW_INSECURE_SIT_STARTUP=true"
  "LOCAL_SCHEMA_COMPAT=false"
  "APOLLO_ENABLED=false"
  "APOLL_ENABLED=false"
  "CONSUL_ENABLED=false"
  "EUREKA_ENABLED=false"
  "AUTO_MIGRATE_DATABASE=false"
  "ALLOW_EMPTY_DATABASE_BOOTSTRAP=false"
  "RESUME_AI_ENABLED=false"
  "RESUME_PARSE_ASYNC_ENABLED=false"
  "JOB_PROFILE_AI_ENABLED=false"
  "AGENT_WEB_SEARCH_ENABLED=false"
  "RATE_LIMIT_ENABLED=false"
  "ALLOW_PUBLIC_REGISTRATION=false"
  "AUTH_DISABLED=false"
  "SECURITY_HEADERS_ENABLED=false"
  "BOSS_CLI_AUTO_INSTALL=false"
  "BUILD_VERSION=$HEAD_SHA"
  "BUILD_CHANNEL=CI"
)

if [[ -n "$PYTHON_DOCKER_IMAGE" ]]; then
  DOCKER_BACKEND_ENV=()
  for item in "${COMMON_BACKEND_ENV[@]}"; do
    DOCKER_BACKEND_ENV+=("-e" "$item")
  done
fi

cd "$PROJECT_DIR"
LOG_FILES+=("$LOG_DIR/init.log" "$LOG_DIR/backend.log" "$LOG_DIR/oauth.log" "$LOG_DIR/frontend.log")
(
  if [[ -n "$PYTHON_DOCKER_IMAGE" ]]; then
    DOCKER_PYTHON_BASE=(
      "${DOCKER_CMD[@]}" run --rm --network host
      --user "$(id -u):$(id -g)"
      -e HOME=/tmp
      "${DOCKER_BACKEND_ENV[@]}"
      -v "$PROJECT_DIR:/workspace:ro"
      -v "$SMOKE_ROOT:$SMOKE_ROOT"
    )
    "${DOCKER_PYTHON_BASE[@]}" -w /workspace "$PYTHON_DOCKER_IMAGE" \
      python backend/scripts/bootstrap_database.py \
      --database-url "$DATABASE_URL" \
      --allow-empty
    "${DOCKER_PYTHON_BASE[@]}" -w /workspace/backend "$PYTHON_DOCKER_IMAGE" \
      python seed_dev.py
    "${DOCKER_PYTHON_BASE[@]}" -w /workspace/backend "$PYTHON_DOCKER_IMAGE" \
      python scripts/verify_demand_scope.py --database "$DATABASE_URL"
  else
    env "${COMMON_BACKEND_ENV[@]}" "$PYTHON_BIN" \
      backend/scripts/bootstrap_database.py \
      --database-url "$DATABASE_URL" \
      --allow-empty
    cd backend
    env "${COMMON_BACKEND_ENV[@]}" "$PYTHON_BIN" seed_dev.py
    env "${COMMON_BACKEND_ENV[@]}" "$PYTHON_BIN" scripts/verify_demand_scope.py \
      --database "$DATABASE_URL"
  fi
) >"$LOG_DIR/init.log" 2>&1 &
INIT_PID=$!
PIDS+=("$INIT_PID")
init_deadline=$((SECONDS + 300))
while kill -0 "$INIT_PID" >/dev/null 2>&1; do
  if (( SECONDS >= init_deadline )); then
    echo "数据库初始化超过 5 分钟，已停止。" >&2
    exit 1
  fi
  sleep 0.5
done
wait "$INIT_PID"
PIDS=()

(
  if [[ -z "$PYTHON_DOCKER_IMAGE" ]]; then
    cd backend
    exec env "${COMMON_BACKEND_ENV[@]}" \
      "$PYTHON_BIN" -m gunicorn \
      --workers 1 \
      --bind "127.0.0.1:$BACKEND_PORT" \
      --timeout 120 \
      --keep-alive 5 \
      run:app
  fi
) >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
if [[ -n "$PYTHON_DOCKER_IMAGE" ]]; then
  wait "$BACKEND_PID"
  "${DOCKER_CMD[@]}" run -d --rm \
    --name "$BACKEND_CONTAINER_NAME" \
    --network host \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    "${DOCKER_BACKEND_ENV[@]}" \
    -v "$PROJECT_DIR:/workspace:ro" \
    -v "$SMOKE_ROOT:$SMOKE_ROOT" \
    -w /workspace/backend \
    "$PYTHON_DOCKER_IMAGE" \
    python -m gunicorn \
    --workers 1 \
    --bind "0.0.0.0:$BACKEND_PORT" \
    --timeout 120 \
    --keep-alive 5 \
    run:app >/dev/null
  "${DOCKER_CMD[@]}" logs --follow "$BACKEND_CONTAINER_NAME" \
    >"$LOG_DIR/backend.log" 2>&1 &
  BACKEND_PID=$!
  PIDS+=("$BACKEND_PID")
  wait_for_container_url \
    "http://127.0.0.1:$BACKEND_PORT/api/health" \
    "后端" \
    "$BACKEND_CONTAINER_NAME" \
    "$LOG_DIR/backend.log"
else
  PIDS+=("$BACKEND_PID")
  wait_for_url \
    "http://127.0.0.1:$BACKEND_PORT/api/health" \
    "后端" \
    "$BACKEND_PID" \
    "$LOG_DIR/backend.log"
fi
backend_info="$(curl --noproxy '*' --silent --fail --max-time 3 \
  "http://127.0.0.1:$BACKEND_PORT/actuator/info")"
[[ "$backend_info" == *"$HEAD_SHA"* ]] || {
  echo "后端运行版本不是当前 checkout：$HEAD_SHA" >&2
  exit 1
}

env \
  LOCAL_OAUTH_BRIDGE_PORT="$OAUTH_PORT" \
  LOCAL_OAUTH_BACKEND_BASE="http://127.0.0.1:$BACKEND_PORT/api" \
  LOCAL_OAUTH_FRONTEND_ORIGIN="http://127.0.0.1:$FRONTEND_PORT" \
  "$NODE_BIN" scripts/local-oauth-bridge.mjs \
  >"$LOG_DIR/oauth.log" 2>&1 &
OAUTH_PID=$!
PIDS+=("$OAUTH_PID")
wait_for_url \
  "http://127.0.0.1:$OAUTH_PORT/health" \
  "登录桥" \
  "$OAUTH_PID" \
  "$LOG_DIR/oauth.log"

(
  cd readdy-frontend
  exec env \
    COMPANY_GATEWAY_PROXY_TARGET="http://127.0.0.1:$OAUTH_PORT" \
    COMPANY_API_PROXY_TARGET="http://127.0.0.1:$BACKEND_PORT" \
    VITE_API_BASE_URL=/api \
    VITE_OAUTH_BASE_URL=/pgs/oauth \
    VITE_PERMISSION_CLIENT_ID=zhipin \
    VITE_BUILD_VERSION="$HEAD_SHA" \
    VITE_BUILD_CHANNEL=CI \
    "$NODE_BIN" node_modules/vite/bin/vite.js \
    --host 127.0.0.1 \
    --port "$FRONTEND_PORT" \
    --strictPort
) >"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
PIDS+=("$FRONTEND_PID")
wait_for_url \
  "http://127.0.0.1:$FRONTEND_PORT/login" \
  "前端" \
  "$FRONTEND_PID" \
  "$LOG_DIR/frontend.log"
frontend_build_info="$(curl --noproxy '*' --silent --fail --max-time 3 \
  "http://127.0.0.1:$FRONTEND_PORT/src/config/buildInfo.ts")"
[[ "$frontend_build_info" == *"$HEAD_SHA"* ]] || {
  echo "前端运行版本不是当前 checkout：$HEAD_SHA" >&2
  exit 1
}

anonymous_status="$(curl --noproxy '*' --silent --output /dev/null --write-out '%{http_code}' \
  "http://127.0.0.1:$BACKEND_PORT/api/jobs")"
[[ "$anonymous_status" == "401" ]] || {
  echo "未登录 API 应返回 401，实际为 $anonymous_status" >&2
  exit 1
}

PLAYWRIGHT_ENV=(
  "CI=true"
  "CI_ISOLATED_SMOKE=true"
  "E2E_BASE_URL=http://127.0.0.1:$FRONTEND_PORT"
  "E2E_PASSWORD=Zhipin2026"
  "E2E_RECRUITER_USER=hr01"
  "E2E_RECRUITER_PASSWORD=Zhipin2026"
  "E2E_MANAGER_USER=manager01"
  "E2E_MANAGER_PASSWORD=Zhipin2026"
  "E2E_INTERVIEWER_USER=interviewer01"
  "E2E_INTERVIEWER_PASSWORD=Zhipin2026"
  "E2E_DIRECTOR_USER=director01"
  "E2E_DIRECTOR_PASSWORD=Zhipin2026"
  "E2E_ADMIN_USER=admin01"
  "E2E_ADMIN_PASSWORD=Zhipin2026"
)

if [[ -n "$PLAYWRIGHT_DOCKER_IMAGE" ]]; then
  mkdir -p \
    "$PROJECT_DIR/readdy-frontend/playwright-report" \
    "$PROJECT_DIR/readdy-frontend/test-results"
  DOCKER_PLAYWRIGHT_ENV=()
  for item in "${PLAYWRIGHT_ENV[@]}"; do
    DOCKER_PLAYWRIGHT_ENV+=("-e" "$item")
  done
  DOCKER_PLAYWRIGHT_ENV+=(
    -e "PLAYWRIGHT_OUTPUT_DIR=/artifacts/test-results/output"
    -e "PLAYWRIGHT_HTML_REPORT_DIR=/artifacts/playwright-report/html"
  )
  "${DOCKER_CMD[@]}" run --rm \
    --network host \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    "${DOCKER_PLAYWRIGHT_ENV[@]}" \
    -v "$PROJECT_DIR/readdy-frontend/playwright-report:/artifacts/playwright-report" \
    -v "$PROJECT_DIR/readdy-frontend/test-results:/artifacts/test-results" \
    "$PLAYWRIGHT_DOCKER_IMAGE"
else
  (
    cd readdy-frontend
    env "${PLAYWRIGHT_ENV[@]}" \
      node_modules/.bin/playwright test \
      e2e/core-role-smoke.spec.ts \
      --project=chromium \
      --workers=1 \
      --global-timeout=600000
  )
fi

echo "隔离浏览器冒烟通过：当前 checkout、临时数据库、五角色与权限负路径均已验证。"
