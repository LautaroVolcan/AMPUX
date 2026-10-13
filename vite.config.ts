/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// En GitHub Pages la app vive en /AMPUX/ (el workflow define VITE_BASE).
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/*.ttf', 'icon.svg'],
      manifest: {
        name: 'AMPUX',
        short_name: 'AMPUX',
        description: 'Editor de guiones',
        theme_color: '#111111',
        background_color: '#f4f4f2',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,ttf,woff2}'] },
    }),
  ],
  server: { port: 5173 },
  test: { environment: 'node' },
});
