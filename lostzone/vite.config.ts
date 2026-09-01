import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // 允许 Arena 预览域名与本地访问
    allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'],
  },
  build: { target: 'es2022' }
});
