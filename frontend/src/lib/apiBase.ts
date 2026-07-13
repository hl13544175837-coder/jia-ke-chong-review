// 全前端 API 请求的统一前缀（唯一真源）。
//
// - 本地开发默认 '/api'，由 Vite 代理转发到本地后端（见 vite.config.ts）。
// - 部署时通过构建期环境变量 VITE_API_BASE_URL 指向网关，例如：
//     测试网关：https://test-pgsgw.yimidida.com/zhipin/api
//     生产网关：https://pgsgw.yimidida.com/zhipin/api
//   （见 frontend/Dockerfile 的 ARG VITE_API_BASE_URL）
//
// 末尾斜杠会被去掉，保证 `${API_BASE}${path}`（path 以 '/' 开头）不出现双斜杠。
const raw = (import.meta.env.VITE_API_BASE_URL ?? '/api').trim();

export const API_BASE = raw.replace(/\/+$/, '') || '/api';
