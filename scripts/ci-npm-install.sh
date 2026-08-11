#!/usr/bin/env bash
set -euo pipefail

# npm ci 在慢/不稳定网络下的稳定执行：
# 1) 关闭审计请求（多一次外部网络调用，慢网下最容易超时）
# 2) 加大重试次数与超时
# 3) 限制并发连接数，避免打满公司网络代理
# 4) 官方源失败时自动切换到国内镜像源重试（与后端 PyPI 用清华源的思路一致）
#
# 用法：bash scripts/ci-npm-install.sh [readdy-frontend 目录]
FRONTEND_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)/readdy-frontend}"
cd "$FRONTEND_DIR"

npm config set audit false
npm config set fetch-retries 5
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000
npm config set maxsockets 5

if npm ci --prefer-offline --fetch-timeout=600000; then
  exit 0
fi

echo "[npm-ci] registry.npmjs.org 拉取失败，切换 registry.npmmirror.com 重试"
npm config set registry https://registry.npmmirror.com
npm config set replace-registry-host always
npm ci --prefer-offline --fetch-timeout=600000
