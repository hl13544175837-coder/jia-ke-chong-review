#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
IMAGE_NAME="${1:?usage: ci-build-browser-image.sh IMAGE_NAME}"
NODE_BASE_IMAGE="${NODE_BASE_IMAGE:-registry.ymdd.tech/library/node:20-alpine}"

cd "$PROJECT_DIR"

timeout 1200 sudo docker build \
  --build-arg "NODE_BASE_IMAGE=$NODE_BASE_IMAGE" \
  --tag "$IMAGE_NAME" \
  --file readdy-frontend/Dockerfile.ci-browser \
  . || {
  status=$?
  if [[ "$status" -eq 124 ]]; then
    echo "Browser CI image preparation exceeded 20 minutes" >&2
  fi
  exit "$status"
}

sudo docker run --rm "$IMAGE_NAME" sh -c \
  'node --version && "$PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH" --version && node_modules/.bin/playwright --version'
