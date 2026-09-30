// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        runtimeCaching: []
      },
      includeAssets: ['fonts/**', 'tesseract/**'],
      manifest: {
        name: 'myPDF',
        short_name: 'myPDF',
        description: 'Private PDF editor. Your files never leave your device.',
        theme_color: '#237352',
        background_color: '#F7FAF8',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        share_target: {
          action: '/share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'file', accept: ['application/pdf'] }] }
        },
        file_handlers: [{ action: '/', accept: { 'application/pdf': ['.pdf'] } }]
      }
    })
  ],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, './src') }
  },
  worker: {
    format: 'es'
  }
})
