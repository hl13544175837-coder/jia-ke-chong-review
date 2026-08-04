#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_DIR/readdy-frontend"
PYTHON_BIN="$PROJECT_DIR/.venv/bin/python"
EXPECTED_SCHEMA="20260804_14"
BUILD_VERSION="$(git -C "$PROJECT_DIR" rev-parse --short=12 HEAD)"
BUILD_TIME="2026-07-30T00:00:00Z"

run_step() {
  local label="$1"
  shift
  printf '\n[%s]\n' "$label"
  "$@"
}

fail() {
  printf '\n[失败] %s\n' "$1" >&2
  exit 1
}

[[ -x "$PYTHON_BIN" ]] || fail "缺少 .venv；请先安装 backend/requirements.txt 和 backend/requirements-audit.txt。"
[[ -d "$FRONTEND_DIR/node_modules" ]] || fail "缺少前端 node_modules；请先在 readdy-frontend 运行 npm ci。"
"$PYTHON_BIN" -c 'import pip_audit' >/dev/null 2>&1 || fail "缺少 pip-audit；请安装 backend/requirements-audit.txt。"

cd "$PROJECT_DIR"

# pytest backend/tests base_agent/tests
run_step "后端全量测试" "$PYTHON_BIN" -m pytest backend/tests base_agent/tests -q

# node --test tests/*.test.mjs
run_step "前端契约测试" bash -c 'cd "$1" && node --test tests/*.test.mjs' _ "$FRONTEND_DIR"
run_step "前端类型检查" bash -c 'cd "$1" && npm run type-check' _ "$FRONTEND_DIR"
run_step "前端代码规范" bash -c 'cd "$1" && npm run lint' _ "$FRONTEND_DIR"
run_step "前端正式构建" bash -c 'cd "$1" && npm run build' _ "$FRONTEND_DIR"
run_step "前端包体积门禁" node scripts/check-frontend-bundle-budget.mjs

run_step "前端依赖安全" node scripts/check-frontend-audit.mjs
# pip_audit --local --strict
run_step "Python 依赖安全" "$PYTHON_BIN" -m pip_audit --local --strict

# alembic heads
heads_output="$(cd backend && ../.venv/bin/alembic heads)"
[[ "$heads_output" == "$EXPECTED_SCHEMA (head)" ]] || fail "数据库迁移头不是唯一的 $EXPECTED_SCHEMA：$heads_output"
printf '\n[数据库迁移]\n%s\n' "$heads_output"

run_step "Git 差异格式" git diff --check
tracked_sensitive="$(git ls-files | rg '(^|/)\.env$|\.(db|sqlite|sqlite3)$|(^|/)(runtime|uploads|backups)/' || true)"
[[ -z "$tracked_sensitive" ]] || fail "发现被 Git 跟踪的运行数据或敏感文件：$tracked_sensitive"

worktree_changes="$(git status --porcelain)"
[[ -z "$worktree_changes" ]] || fail "工作区仍有未提交改动，不能形成可追踪发布候选。"

# make -n build
run_step "RC 镜像参数检查" make -n build \
  PKG_TAG=RC \
  PKG_VERSION=trial-check \
  BUILD_VERSION="$BUILD_VERSION" \
  BUILD_TIME="$BUILD_TIME" >/dev/null

if [[ -n "${SIT_ENV_FILE:-}" ]]; then
  run_step "SIT 实值配置" "$PYTHON_BIN" backend/scripts/check_pilot_readiness.py \
    --profile sit-team \
    --env-file "$SIT_ENV_FILE"
else
  printf '\n[SIT 实值配置]\n未提供 SIT_ENV_FILE，本地候选不冒充公司环境验收。\n'
fi

printf '\n[放行摘要]\n'
printf '提交：%s\n' "$BUILD_VERSION"
printf '数据库：%s\n' "$EXPECTED_SCHEMA"
printf '范围：Mock 保留；简历 AI 关闭；现有数据未清理。\n'
printf '状态：本地检查通过，未推送、未发布。\n'
