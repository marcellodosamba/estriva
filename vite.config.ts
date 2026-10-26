import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Check if PWA plugin is available
let hasPWA = false;
try {
  require.resolve('vite-plugin-pwa');
  hasPWA = true;
} catch {
  hasPWA = false;
}

const plugins = [react()];

if (hasPWA) {
  const { VitePWA } = require('vite-plugin-pwa');
  plugins.push(
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'ESTRIVA - Mapa de Danos',
        short_name: 'ESTRIVA',
        description: 'Engenharia Civil Offline-First - Registro de ocorrências, fotos e relatórios PDF',
        theme_color: '#1a5c2e',
        background_color: '#f5f5f5',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        categories: ['productivity', 'utilities'],
        shortcuts: [
          {
            name: 'Novo Projeto',
            short_name: 'Novo',
            description: 'Criar novo projeto de engenharia',
            url: '/projects/new',
            icons: [{ src: 'pwa-192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  );
} else {
  console.warn('PWA plugin not available - skipping Service Worker generation');
}

export default defineConfig({
  plugins,
});