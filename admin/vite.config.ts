import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served by the API at /admin-panel in production; `npm run dev` proxies API calls to localhost:4000.
export default defineConfig({
  base: '/admin-panel/',
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:4000', rewrite: (p) => p.replace(/^\/api/, '') } } },
});
