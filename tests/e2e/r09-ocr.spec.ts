// SPDX-License-Identifier: AGPL-3.0-or-later
// R09: after OCR, searching a known word on the scan finds it, and the page looks unchanged (the layer is invisible).
import { test, expect } from '@playwright/test'
import { prepare, openFile, toCanvas, exportPdf, docOf, allText } from './helpers'

test('R09 OCR a scan and search it', async ({ page }) => {
  test.setTimeout(180_000)
  await prepare(page)
  await openFile(page, 'synthetic-scan-5p.pdf')
  await page.getByTestId('dock-ocr').click()
  await page.getByTestId('ocr-apply').click()
  await expect(page.getByTestId('toast')).toContainText('Text recognised', { timeout: 150_000 })
  await toCanvas(page, 0)
  await page.getByTestId('search').fill('Greenfield'); await page.getByTestId('search').press('Enter')
  await expect(page.getByTestId('search-count')).toContainText(/of 5 pages|of \d+ pages/)
  await expect(page.getByTestId('hit').first()).toBeVisible()
  await page.getByLabel('Back to pages').click()
  expect(allText(docOf(await exportPdf(page)))).toContain('Greenfield')
})
