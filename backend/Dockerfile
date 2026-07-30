FROM registry.ymdd.tech/library/python:3.12-uv

ARG RELEASE_CHANNEL=UNKNOWN
ARG AUTO_MIGRATE_DATABASE=false
ARG ALLOW_EMPTY_DATABASE_BOOTSTRAP=false
ARG ALLOW_INSECURE_SIT_STARTUP=false
ARG SECURITY_HEADERS_ENABLED=true
ARG RATE_LIMIT_ENABLED=true
ARG ALLOW_PUBLIC_REGISTRATION=false
ARG RESUME_AI_ENABLED=true
ARG BUILD_VERSION=local
ARG BUILD_CHANNEL=local
ARG BUILD_TIME=unknown

WORKDIR /app

# Install curl for utility/healthchecks. Runtime dependency installation is forbidden.
RUN for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do \
        if [ -f "$f" ]; then \
            sed -i 's/archive.ubuntu.com/mirrors.aliyun.com/g' "$f"; \
            sed -i 's/security.ubuntu.com/mirrors.aliyun.com/g' "$f"; \
            sed -i 's/deb.debian.org/mirrors.aliyun.com/g' "$f"; \
            sed -i 's/security.debian.org/mirrors.aliyun.com/g' "$f"; \
        fi; \
    done && \
    apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy backend requirements first to leverage Docker cache
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# Copy backend and base_agent modules
COPY backend /app/backend
COPY base_agent /app/base_agent

RUN case "$RELEASE_CHANNEL" in \
        "RC"|"GA") printf '%s\n' "$RELEASE_CHANNEL" > /app/backend/.release-channel ;; \
        *) echo "RELEASE_CHANNEL must be RC or GA" >&2; exit 1 ;; \
    esac

# Configure Python environment
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/backend:/app
ENV PORT=5000
ENV FLASK_DEBUG=false
ENV LOCAL_SCHEMA_COMPAT=false
ENV AUTO_MIGRATE_DATABASE=${AUTO_MIGRATE_DATABASE}
ENV ALLOW_EMPTY_DATABASE_BOOTSTRAP=${ALLOW_EMPTY_DATABASE_BOOTSTRAP}
ENV ALLOW_INSECURE_SIT_STARTUP=${ALLOW_INSECURE_SIT_STARTUP}
ENV SECURITY_HEADERS_ENABLED=${SECURITY_HEADERS_ENABLED}
ENV RATE_LIMIT_ENABLED=${RATE_LIMIT_ENABLED}
ENV ALLOW_PUBLIC_REGISTRATION=${ALLOW_PUBLIC_REGISTRATION}
ENV RESUME_AI_ENABLED=${RESUME_AI_ENABLED}
ENV BUILD_VERSION=${BUILD_VERSION}
ENV BUILD_CHANNEL=${BUILD_CHANNEL}
ENV BUILD_TIME=${BUILD_TIME}

RUN chmod +x /app/backend/docker-entrypoint.sh

EXPOSE 5000

WORKDIR /app/backend

# Run with Gunicorn. gunicorn.conf.py 提供 worker/超时等参数，并在 master
# 单点完成服务注册（Consul/Eureka），避免多 worker 重复注册。SSE 需要的大超时也在其中。
ENTRYPOINT ["/app/backend/docker-entrypoint.sh"]
CMD ["gunicorn", "-c", "/app/backend/gunicorn.conf.py", "run:app"]
