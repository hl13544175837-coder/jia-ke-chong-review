# Build stage
FROM registry.ymdd.tech/library/node:20-alpine AS build-stage
WORKDIR /app

# 前端 API 请求前缀（网关地址）。由构建流水线按环境传入 build-arg：
#   测试：--build-arg VITE_API_BASE_URL=https://test-pgsgw.yimidida.com/zhipin-server/api
#   生产：--build-arg VITE_API_BASE_URL=https://pgsgw.yimidida.com/zhipin-server/api
# 默认指向测试网关（满足当前 SIT 联调）。生产构建务必显式传入生产网关，
# 否则生产前端会打到测试网关。注意：.dockerignore 排除了 .env*，
# 所以只能通过本 ARG 注入，不能靠 .env 文件。
ARG VITE_API_BASE_URL=https://test-pgsgw.yimidida.com/zhipin-server/api

# 网关 OAuth 登录/用户信息前缀（/pgs/oauth）。测试与生产同一网关不同环境：
#   测试：--build-arg VITE_OAUTH_BASE_URL=https://test-pgsgw.yimidida.com/pgs/oauth
#   生产：--build-arg VITE_OAUTH_BASE_URL=https://pgsgw.yimidida.com/pgs/oauth
ARG VITE_OAUTH_BASE_URL=https://test-pgsgw.yimidida.com/pgs/oauth

# 临时默认角色（网关 profile 无应用角色，联调兜底）。接后端 /auth/me 后移除。
ARG VITE_DEFAULT_ROLE=admin

# Copy package dependency configuration relative to root build context
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source code and build
COPY frontend/ ./
RUN VITE_API_BASE_URL="$VITE_API_BASE_URL" \
    VITE_OAUTH_BASE_URL="$VITE_OAUTH_BASE_URL" \
    VITE_DEFAULT_ROLE="$VITE_DEFAULT_ROLE" \
    npm run build

# Production stage
FROM registry.ymdd.tech/library/nginx:1.25-alpine
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx
RUN sed -i 's/^user/#user/' /etc/nginx/nginx.conf && \
    sed -i 's!/var/run/nginx.pid!/tmp/nginx.pid!' /etc/nginx/nginx.conf && \
    sed -i 's/^worker_processes.*/worker_processes 2;/' /etc/nginx/nginx.conf
COPY --chown=nginx:nginx --from=build-stage /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx frontend/nginx.conf /etc/nginx/conf.d/default.conf
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
