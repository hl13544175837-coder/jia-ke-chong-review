import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com', '.loca.lt'],
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      // 网关 OAuth 登录/用户信息（/pgs/oauth/*）。本地开发代理到测试网关，
      // 便于联调网关登录；部署时前端直接用绝对网关地址（VITE_OAUTH_BASE_URL）。
      '/pgs': {
        target: 'https://test-pgsgw.yimidida.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
