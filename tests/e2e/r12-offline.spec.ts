// SPDX-License-Identifier: AGPL-3.0-or-later
// R12: with the network off after install, the organiser, edit, protect and OCR paths still work.
import { test, expect } from '@playwright/test'
import { prepare, mergeFiles, pageCount, selectPage, exportPdf, docOf, openFile } from './helpers'

test.use({ serviceWorkers: 'allow' })

test('R12 works offline after install', async ({ page, context }) => {
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
})
