// SPDX-License-Identifier: AGPL-3.0-or-later
// R06: a signature placed on a page is at the same position after save, and is reusable after a browser restart.
import { test, expect } from '@playwright/test'
import { prepare, openFile, toCanvas, exportPdf, docOf } from './helpers'

test('R06 sign, keep, and reuse after reload', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf')
  await toCanvas(page, 0)
  await page.getByTestId('tool-sign').click()
  await page.getByTestId('sign-tab-type').click()
  await page.getByTestId('sign-typed').fill('Brian Gachichio')
  await page.getByTestId('sign-use-typed').click()
  await expect(page.getByRole('status').filter({ hasText: 'Tap where the signature goes' })).toBeVisible()
  const box = (await page.getByTestId('overlay').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3)
  await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 15_000 })
  await page.getByLabel('Back to pages').click()
  const d = docOf(await exportPdf(page))
  const boxes: number[][] = []
  d.loadPage(0).toStructuredText('preserve-images').walk({ onImageBlock(b) { boxes.push([...b] as number[]) } })
  expect(boxes.length).toBeGreaterThan(0)
  const [x0, y0, x1, y1] = boxes[boxes.length - 1]
  const pb = d.loadPage(0).getBounds()
  expect((x0 + x1) / 2).toBeGreaterThan(pb[2] * 0.4); expect((x0 + x1) / 2).toBeLessThan(pb[2] * 0.6)
  expect((y0 + y1) / 2).toBeGreaterThan(pb[3] * 0.2); expect((y0 + y1) / 2).toBeLessThan(pb[3] * 0.45)
  // "after a browser restart": a fresh page load in the same profile still lists the saved signature
  await page.reload()
  await openFile(page, 'pdfjs-basicapi.pdf')
  await toCanvas(page, 0)
  await page.getByTestId('tool-sign').click()
  await page.getByTestId('sign-tab-saved').click()
  await expect(page.getByTestId('sign-use-saved')).toHaveCount(1)
})
