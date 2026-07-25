import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Cycle Computer',
        short_name: 'Cycle Computer',
        description: '自転車用GPS追跡アプリ - リアルタイムメトリクス表示とナビゲーション',
        theme_color: '#667eea',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%23667eea" width="192" height="192"/><text x="96" y="120" font-size="100" fill="white" text-anchor="middle" dominant-baseline="central">🚴</text></svg>',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect fill="%23667eea" width="512" height="512"/><text x="256" y="330" font-size="280" fill="white" text-anchor="middle" dominant-baseline="central">🚴</text></svg>',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
        screenshots: [
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 720"><rect fill="%23f5f5f5" width="540" height="720"/><rect fill="%23667eea" width="216" height="720"/><text x="108" y="360" font-size="60" fill="white" text-anchor="middle">Metrics</text><rect fill="%23f0f0f0" width="324" height="720" x="216"/><text x="378" y="360" font-size="60" fill="%23666" text-anchor="middle">Map</text></svg>',
            sizes: '540x720',
            type: 'image/svg+xml',
            form_factor: 'narrow',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'openstreetmap-tiles',
              expiration: {
                maxEntries: 50,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        navigateFallback: 'index.html',
        suppressWarnings: true,
      },
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
})
