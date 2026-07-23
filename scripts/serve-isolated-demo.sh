#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  "$SCRIPT_DIR/stop-isolated-demo.sh" || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

"$SCRIPT_DIR/start-isolated-demo.sh"
echo "服务会在当前终端持续运行；按 Ctrl+C 可只停止本独立项目。"

while true; do
  sleep 3600
done
