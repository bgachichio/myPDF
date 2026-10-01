// SPDX-License-Identifier: AGPL-3.0-or-later
// R02: scrolling a 300-page file never blocks the main thread for more than 200 ms (long task entries).
import { test, expect } from '@playwright/test'
import { openFile } from './helpers'

test('R02 310-page file scrolls without a main-thread block over 200 ms', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __tasks: number[] }).__tasks = []
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window as unknown as { __tasks: number[] }).__tasks.push(e.duration))).observe({ type: 'longtask', buffered: true })
  })
  await openFile(page, 'synthetic-board-pack-310p.pdf')
  await expect(page.getByTestId('page-count')).toContainText('310 pages')
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 700) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(40) }
  await page.waitForTimeout(500)
  const tasks = await page.evaluate(() => (window as unknown as { __tasks: number[] }).__tasks)
  expect(Math.max(0, ...tasks)).toBeLessThan(200)
  await expect(page.locator('[data-testid^="page-"] canvas[data-ready="true"]').first()).toBeAttached()
})
