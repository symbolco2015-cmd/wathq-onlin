import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // 'script' (not inline) keeps SW registration compatible with the
        // strict CSP in index.html (script-src 'self', no unsafe-inline).
        injectRegister: 'script',
        includeAssets: ['favicon.ico', 'brand/favicon.svg', 'brand/apple-touch-icon.png'],
        manifest: {
          name: 'وثّق — ملف الإنجاز المهني',
          short_name: 'وثّق',
          description: 'منصة ملف الإنجاز الرقمي المهني للمعلمين والمعلمات في السعودية',
          lang: 'ar',
          dir: 'rtl',
          display: 'standalone',
          start_url: '/',
          background_color: '#0A2E1F',
          theme_color: '#0A2E1F',
          icons: [
            { src: 'brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Precache only built static assets (JS/CSS/HTML/fonts/icons).
          // No runtimeCaching is configured anywhere in this plugin, so
          // Supabase API/Realtime calls and the /api/* Gemini proxy are
          // never touched by the service worker — they always hit the
          // network, same as without a PWA.
          globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg,ico}'],
          globIgnores: ['brand/og-image.png'],
          // injectRegister: 'script' (CSP-driven, see above) means
          // vite-plugin-pwa does NOT auto-enable these for registerType:
          // 'autoUpdate' (it only does so for injectRegister 'auto'/null).
          // Without them, a new SW installs but stays stuck in 'waiting'
          // forever since registerSW.js never posts SKIP_WAITING — set
          // explicitly so the new SW activates and takes control immediately.
          skipWaiting: true,
          clientsClaim: true,
        },
      }),
    ],
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
