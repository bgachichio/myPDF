// SPDX-License-Identifier: AGPL-3.0-or-later
// R04: replacing a word saves and shows the new word; the old one is gone.
import { test, expect } from '@playwright/test'
import { prepare, openFile, toCanvas, exportPdf, docOf, allText } from './helpers'

test('R04 edit a word in existing text', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-tracemonkey-text.pdf')
  await toCanvas(page, 0)
  await page.getByTestId('search').fill('Trace-based'); await page.getByTestId('search').press('Enter')
  const hit = page.getByTestId('hit').first()
  await expect(hit).toBeVisible()
  await page.getByTestId('tool-edit').click()
  await expect(hit).toBeVisible()
  const b = (await hit.boundingBox())! // measured after the tool bar settles: switching tools changes the header height
  await page.mouse.move(b.x + 1, b.y + b.height / 2); await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 }); await page.mouse.move(b.x + b.width - 1, b.y + b.height / 2, { steps: 4 }); await page.mouse.up()
  await expect(page.getByTestId('edit-text')).toHaveValue(/Trace/)
  await page.getByTestId('edit-text').fill('Replacement')
  await page.getByTestId('edit-apply').click()
  await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 15_000 })
  await page.getByLabel('Back to pages').click()
  const d = docOf(await exportPdf(page))
  const t = allText(d)
  expect(t).toContain('Replacement')
  expect(t).not.toContain('Trace-based')
})
