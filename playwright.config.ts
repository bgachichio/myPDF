// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'block' },
  webServer: { command: 'npm run build && node scripts/serve-dist.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'main', testIgnore: /r02-/ },
    // R02 measures main-thread long tasks, so it runs alone, after everything else, on an idle machine.
    { name: 'perf', testMatch: /r02-/, dependencies: ['main'], fullyParallel: false },
  ],
})
