// SPDX-License-Identifier: AGPL-3.0-or-later
// R11: every edit can be undone and redone at least 50 steps deep.
import { test, expect } from '@playwright/test'
import { openFile, pageCount } from './helpers'

test('R11 60 edits undo and redo in order', async ({ page }) => {
  await openFile(page, 'pdfjs-basicapi.pdf')
  const start = await pageCount(page)
  for (let i = 1; i <= 60; i++) {
    await page.getByTestId('dock-blank').click()
    await expect.poll(() => pageCount(page), { timeout: 15_000 }).toBe(start + i)
  }
  for (let i = 59; i >= 0; i--) {
    await page.getByTestId('undo').click()
    await expect.poll(() => pageCount(page), { timeout: 15_000 }).toBe(start + i)
  }
  await expect(page.getByTestId('undo')).toBeDisabled()
  for (let i = 1; i <= 60; i++) {
    await page.getByTestId('redo').click()
    await expect.poll(() => pageCount(page), { timeout: 15_000 }).toBe(start + i)
  }
})
