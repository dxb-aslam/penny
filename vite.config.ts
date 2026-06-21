import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Penny dev config: proxy /api -> local Anthropic proxy server (server/index.mjs)
const SERVER_PORT = process.env.PENNY_SERVER_PORT || '8788';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
