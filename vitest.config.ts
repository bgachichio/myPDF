// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  define: { __WASM_BYTES__: 10409826 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: { '@': resolve(import.meta.dirname, './src') },
  },
})
