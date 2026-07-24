#!/usr/bin/env bash

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/isolated-demo-common.sh"

stop_service "完整 ZIP 前端" "$FRONTEND_PID_FILE"
stop_service "接口与图片简历版前端" "$OPERATIONS_FRONTEND_PID_FILE"
stop_service "登录桥" "$OAUTH_PID_FILE"
stop_service "后端" "$BACKEND_PID_FILE"

echo "独立演示服务已全部停止；数据库和上传文件仍保留在：$RUNTIME_ROOT"
