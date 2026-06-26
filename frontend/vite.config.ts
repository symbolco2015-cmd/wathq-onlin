import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // GEMINI_API_KEY is intentionally NOT injected here.
    // All Gemini calls must go through backend/api-server/server.js (/api/gemini)
    // so the key stays server-side and never appears in the browser bundle.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // File watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // Forward /api/* to the Express proxy server during development.
        // In production, deploy server.js behind the same origin or a reverse proxy.
        '/api': 'http://localhost:3001',
      },
    },
  };
});
