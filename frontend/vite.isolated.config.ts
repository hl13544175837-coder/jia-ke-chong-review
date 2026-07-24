import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const backendTarget = env.LOCAL_BACKEND_PROXY_TARGET || 'http://localhost:5001';
  const oauthTarget = env.LOCAL_OAUTH_PROXY_TARGET || 'https://test-pgsgw.yimidida.com';
  const allowLan = env.VITE_ALLOW_LAN === 'true';

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      port: 5173,
      strictPort: true,
      allowedHosts: allowLan ? true : ['.trycloudflare.com', '.loca.lt'],
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        // 网关 OAuth 登录/用户信息（/pgs/oauth/*）。本地验收可代理到独立登录桥，
        // 其他开发环境继续默认代理到测试网关。
        '/pgs': {
          target: oauthTarget,
          changeOrigin: true,
          secure: oauthTarget.startsWith('https://'),
        },
      },
    },
  };
});
