// SPDX-License-Identifier: AGPL-3.0-or-later
// R12: with the network off after install, the organiser, edit, protect and OCR paths still work.
import { test, expect } from '@playwright/test'
import { prepare, mergeFiles, pageCount, selectPage, exportPdf, docOf, openFile } from './helpers'

test.use({ serviceWorkers: 'allow' })

test('R12 works offline after install', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit cannot reload a service-worker page while offline ("WebKit encountered an internal error"); offline is proven on Chromium and Firefox')
  test.setTimeout(240_000)
  await prepare(page)
  await page.goto('/')
  // wait for the install to finish: the engine wasm and the OCR language data are both precached
  await expect.poll(() => page.evaluate(async () => {
    const urls: string[] = []
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(r.url)
    return Boolean(navigator.serviceWorker.controller) && urls.some((u) => u.includes('mupdf-wasm')) && urls.some((u) => u.includes('eng.traineddata.gz'))
  }), { timeout: 120_000 }).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('open-pdf')).toBeVisible()
  // organise: merge, rotate, delete, export
  await mergeFiles(page, ['pdfjs-basicapi.pdf', 'pdfjs-attachment.pdf'])
  await expect.poll(() => pageCount(page)).toBe(4)
  await selectPage(page, 3)
  await page.getByTestId('dock-rotate').click()
  await page.getByTestId('dock-delete').click()
  await expect.poll(() => pageCount(page)).toBe(3)
  await page.getByTestId('undo').click()
  await expect.poll(() => pageCount(page)).toBe(4)
  const d = docOf(await exportPdf(page, { compress: true, password: 'offline1' }), 'offline1')
  expect(d.countPages()).toBe(4)
  // OCR with the self-hosted engine, offline
  await openFile(page, 'synthetic-scan-5p.pdf')
  await page.getByTestId('dock-ocr').click()
  await page.getByTestId('ocr-apply').click()
  await expect(page.getByTestId('toast')).toContainText('Text recognised', { timeout: 150_000 })
  // script-font signature, then a certificate signature with a new ID, both offline
  await openFile(page, 'pdfjs-basicapi.pdf')
  await selectPage(page, 0); await page.getByTestId('dock-edit').click()
  await expect(page.getByTestId('page-canvas')).toHaveAttribute('data-rendered', '0', { timeout: 15_000 })
  await page.getByTestId('tool-sign').click(); await page.getByTestId('sign-tab-type').click()
  await page.getByTestId('sign-typed').fill('Offline Signer'); await page.getByTestId('sign-font-dancing').click()
  await expect(page.getByTestId('sign-preview')).toBeVisible()
  expect(await page.evaluate(() => document.fonts.check('24px "Sig Dancing Script"'))).toBe(true)
  await page.getByTestId('sign-use-typed').click()
  const o = (await page.getByTestId('overlay').boundingBox())!; await page.mouse.click(o.x + o.width / 2, o.y + o.height / 4)
  await expect(page.getByTestId('page-canvas')).toHaveAttribute('data-rev', '1', { timeout: 15_000 })
  await page.getByLabel('Back to pages').click()
  await page.getByTestId('export').click(); await page.getByTestId('sign-panel').locator('summary').click(); await page.getByTestId('sign-id-new').click()
  await page.getByTestId('new-id-name').fill('Offline Signer'); await page.getByTestId('new-id-password').fill('correct-horse-9')
  await Promise.all([page.waitForEvent('download'), page.getByTestId('new-id-make').click()])
  const [signed] = await Promise.all([page.waitForEvent('download'), page.getByTestId('sign-save').click()])
  expect(signed.suggestedFilename()).toMatch(/-signed\.pdf$/)
})
