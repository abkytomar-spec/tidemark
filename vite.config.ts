import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'Tidemark — Every day leaves a mark', short_name: 'Tidemark', description: 'A private, rewarding planner for tasks, goals and progress.',
      theme_color: '#0B2A3C', background_color: '#EEF4F7', display: 'standalone', start_url: '/', scope: '/', orientation: 'any',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { navigateFallbackDenylist: [/^\/api\//] },
  })],
  server: { proxy: { '/api': 'http://127.0.0.1:8080' } },
});
