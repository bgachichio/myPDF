// SPDX-License-Identifier: AGPL-3.0-or-later
// R05: fields accept input; after flattening the saved file holds no form fields.
import { test, expect } from '@playwright/test'
import { prepare, openFile, toCanvas, exportPdf, docOf, allText } from './helpers'
import type * as M from 'mupdf'

test('R05 fill and flatten a form', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-annotation-text-widget.pdf')
  await toCanvas(page, 0)
  await page.getByTestId('tool-fields').click()
  const first = page.getByTestId('field').first()
  await expect(first).toBeVisible()
  await first.fill('Filled value'); await first.press('Tab')
  await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 15_000 })
  await page.getByTestId('flatten').click()
  await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByTestId('flatten')).toHaveCount(0)
  await page.getByLabel('Back to pages').click()
  const d = docOf(await exportPdf(page))
  expect((d.loadPage(0) as M.PDFPage).getWidgets()).toHaveLength(0)
  expect(d.getTrailer().get('Root').get('AcroForm').isNull()).toBe(true)
  expect(allText(d)).toContain('Filled value')
})
