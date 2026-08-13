#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
IMAGE_NAME="${1:?usage: ci-build-python-image.sh IMAGE_NAME}"
PYTHON_BASE_IMAGE="${PYTHON_BASE_IMAGE:-registry.ymdd.tech/library/python:3.12-uv}"

cd "$PROJECT_DIR"

timeout 1200 sudo docker build \
  --build-arg "PYTHON_BASE_IMAGE=$PYTHON_BASE_IMAGE" \
  --tag "$IMAGE_NAME" \
  --file backend/Dockerfile.ci \
  . || {
  status=$?
  if [[ "$status" -eq 124 ]]; then
    echo "Python CI image preparation exceeded 20 minutes" >&2
  fi
  exit "$status"
}

sudo docker run --rm "$IMAGE_NAME" python -c \
  'import sys; assert (3, 11) <= sys.version_info[:2] < (3, 14); print(sys.version.split()[0])'
