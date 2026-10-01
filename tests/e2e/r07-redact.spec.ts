// SPDX-License-Identifier: AGPL-3.0-or-later
// R07: after applying redaction the saved file returns zero text matches for the name, and the app reports it verified.
import { test, expect } from '@playwright/test'
import { prepare, openFile, toCanvas, exportPdf, docOf, allText } from './helpers'

test('R07 redact a name for real', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-tracemonkey-text.pdf')
  await toCanvas(page, 0)
  await page.getByTestId('tool-redact').click()
  await page.getByTestId('redact-term').fill('Trace-based')
  await page.getByTestId('redact-mark').click()
  await expect(page.getByTestId('redact-banner')).toContainText(/[1-9]\d* areas? marked/)
  await page.getByTestId('redact-apply').click()
  await expect(page.getByTestId('toast')).toContainText('verified', { timeout: 15_000 })
  await expect(page.getByTestId('redact-banner')).toContainText('0 areas marked')
  await page.getByLabel('Back to pages').click()
  const t = allText(docOf(await exportPdf(page)))
  expect(t).not.toContain('Trace-based')
  expect(t.length).toBeGreaterThan(1000)
})
