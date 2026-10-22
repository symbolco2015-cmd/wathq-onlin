import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

// خطوط pdf.js القياسية وcmaps (PdfPreview.tsx) تُقدَّم من /pdfjs/: في dev من
// node_modules مباشرة، وفي البناء تُنسخ إلى dist/pdfjs/. لا تدخل الـ precache
// (امتداداتها خارج globPatterns)، فتُحمَّل عند الحاجة فقط.
const PDFJS_DIRS = ['standard_fonts', 'cmaps'];
const PDFJS_ROOT = path.resolve(__dirname, 'node_modules/pdfjs-dist');

function pdfjsAssets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'wathq-pdfjs-assets',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const [dir, ...rest] = rel.split('/');
        if (!PDFJS_DIRS.includes(dir) || rest.length !== 1) return next();
        const file = path.join(PDFJS_ROOT, dir, path.basename(rest[0]));
        // ملف غير موجود 404، لا index.html، حتى لا يفشل pdf.js بصمت
        if (!fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      for (const dir of PDFJS_DIRS) {
        fs.cpSync(path.join(PDFJS_ROOT, dir), path.join(outDir, 'pdfjs', dir), {recursive: true});
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      pdfjsAssets(),
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
          // عامل pdf.js وحده من ملفات .mjs، حتى يفتح PDF بلا اتصال.
          globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg,ico}', '**/pdf.worker*.mjs'],
          globIgnores: ['brand/og-image.png'],
          // خط Tabler يُطلب بلاحقة ?v3.44.0، فبدون /^v\d/ لا يطابق نسخة
          // الـ precache وتظهر الأيقونات مربعات فارغة بلا اتصال. أول قيمتين
          // هما الافتراضيتان في workbox.
          ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v\d/],
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
