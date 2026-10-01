// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'block' },
  webServer: { command: 'npm run build && node scripts/serve-dist.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 120_000 },
})
