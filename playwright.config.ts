// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, devices } from '@playwright/test'

// BASE_URL=https://mypdf.gachichio.org npx playwright test runs the same suite against production (DEPLOY.md section 7).
// `--project=firefox` and `--project=webkit` run the cross-browser pass; Edge shares Chromium's engine and is covered by the main project.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL, serviceWorkers: 'block' },
  webServer: process.env.BASE_URL ? undefined : { command: 'npm run build && node scripts/serve-dist.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'main', testIgnore: /r02-/ },
    // R02 measures main-thread long tasks (a Chromium API), so it runs alone, after everything else, on an idle machine.
    { name: 'perf', testMatch: /r02-/, dependencies: ['main'], fullyParallel: false },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /r02-/, workers: 2 },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /r02-/, workers: 2 },
  ],
})
