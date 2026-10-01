// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'
import { statSync } from 'fs'
import { LIGHTNING_ADDRESS, BTC_ADDRESS } from './src/config/support.ts'
import { assertSupportConfig } from './src/config/support-guard.ts'

// Build guard (CLAUDE.md, F15/R15): a production build fails if either receiving address is empty.
const supportGuard = { name: 'support-guard', apply: 'build' as const, buildStart() {
  assertSupportConfig(LIGHTNING_ADDRESS, BTC_ADDRESS)
} }

export default defineConfig({
  plugins: [
    supportGuard,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm,gz}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        importScripts: ['share-target-sw.js'],
        navigateFallbackDenylist: [/^\/share/],
        runtimeCaching: []
      },
      includeAssets: ['fonts/**', 'tesseract/**', 'share-target-sw.js'],
      manifest: {
        name: 'myPDF',
        short_name: 'myPDF',
        description: 'Private PDF editor. Your files never leave your device.',
        theme_color: '#237352',
        background_color: '#F7FAF8',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        id: '/',
        categories: ['productivity', 'utilities', 'business'],
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        screenshots: [
          { src: '/screenshots/home-narrow.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Open a PDF, privately' },
          { src: '/screenshots/pages-narrow.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Organise pages' },
          { src: '/screenshots/page-wide.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'Edit, sign and redact' }
        ],
        share_target: {
          action: '/share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'file', accept: ['application/pdf', '.pdf'] }] }
        },
        file_handlers: [{ action: '/', accept: { 'application/pdf': ['.pdf'] } }]
      }
    })
  ],
  define: { __WASM_BYTES__: statSync(resolve(import.meta.dirname, 'node_modules/mupdf/dist/mupdf-wasm.wasm')).size },
  resolve: {
    alias: { '@': resolve(import.meta.dirname, './src') }
  },
  worker: {
    format: 'es'
  }
})
