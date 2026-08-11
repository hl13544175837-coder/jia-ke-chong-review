# Build stage
FROM registry.ymdd.tech/library/node:20-alpine AS build-stage
WORKDIR /app

ARG VITE_API_BASE_URL=/api
ARG VITE_OAUTH_BASE_URL=https://test-pgsgw.yimidida.com/pgs/oauth
ARG VITE_DEFAULT_ROLE=recruiter
ARG VITE_GATEWAY_ROLE_MAP=
ARG VITE_PERMISSION_CLIENT_ID=zhipin
ARG BUILD_VERSION=local
ARG BUILD_CHANNEL=local
ARG BUILD_TIME=unknown

COPY readdy-frontend/package*.json ./
RUN npm ci

COPY readdy-frontend/ ./
RUN VITE_API_BASE_URL="$VITE_API_BASE_URL" \
    VITE_OAUTH_BASE_URL="$VITE_OAUTH_BASE_URL" \
    VITE_DEFAULT_ROLE="$VITE_DEFAULT_ROLE" \
    VITE_GATEWAY_ROLE_MAP="$VITE_GATEWAY_ROLE_MAP" \
    VITE_PERMISSION_CLIENT_ID="$VITE_PERMISSION_CLIENT_ID" \
    VITE_BUILD_VERSION="$BUILD_VERSION" \
    VITE_BUILD_CHANNEL="$BUILD_CHANNEL" \
    VITE_BUILD_TIME="$BUILD_TIME" \
    npm run build

# Production stage
FROM registry.ymdd.tech/library/nginx:1.25-alpine
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx
RUN sed -i 's/^user/#user/' /etc/nginx/nginx.conf && \
    sed -i 's!/var/run/nginx.pid!/tmp/nginx.pid!' /etc/nginx/nginx.conf && \
    sed -i 's/^worker_processes.*/worker_processes 2;/' /etc/nginx/nginx.conf
COPY --chown=nginx:nginx --from=build-stage /app/out /usr/share/nginx/html
COPY --chown=nginx:nginx readdy-frontend/nginx.conf /etc/nginx/conf.d/default.conf
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
