// SPDX-License-Identifier: AGPL-3.0-or-later
// R13: scenarios 1 to 3 of PRODUCT-SPEC section 5 record zero requests to any origin other than the app's, no request that carries a body,
// and, after the initial load, only static asset reads. User-tapped links (Paystack, X, GitHub, wallets) are navigations and are not exercised here.
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import * as mupdf from 'mupdf'
import { readFileSync } from 'fs'
import { ORIGIN, prepare, openFile, toCanvas, selectPage, exportPdf, pageCount, corpus, docOf, allText } from './helpers'

const img = (kind: 'png' | 'jpg') => { const p = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 120, 80], false); p.clear(180); return kind === 'png' ? p.asPNG() : p.asJPEG(80) }
const STATIC = /^\/(assets\/|tesseract\/|fonts\/|icons\/|manifest\.webmanifest$|sw\.js$|registerSW\.js$|workbox-|share-target-sw\.js$|theme-init\.js$|$)/

function watch(context: BrowserContext) {
  const log = { foreign: [] as string[], bodies: [] as string[], late: [] as string[], loaded: false }
  context.on('request', (r) => {
    const u = new URL(r.url()); if (!/^https?:$/.test(u.protocol)) return
    if (u.origin !== ORIGIN) log.foreign.push(r.url())
    if (r.method() !== 'GET' || r.postData()) log.bodies.push(`${r.method()} ${r.url()}`)
    if (log.loaded && u.origin === ORIGIN && !STATIC.test(u.pathname)) log.late.push(r.url())
  })
  return log
}
async function settle(page: Page, log: ReturnType<typeof watch>) { await page.waitForLoadState('networkidle'); log.loaded = true }

test.describe('R13 zero egress', () => {
  test('scenario 1: open, edit a word, sign, export', async ({ page, context }) => {
    await prepare(page); const log = watch(context)
    await page.goto('/'); await settle(page, log)
    await openFile(page, 'pdfjs-tracemonkey-text.pdf')
    await toCanvas(page, 0)
    await page.getByTestId('search').fill('Trace-based'); await page.getByTestId('search').press('Enter')
    await page.getByTestId('tool-edit').click()
    const hit = page.getByTestId('hit').first(); await expect(hit).toBeVisible()
    const b = (await hit.boundingBox())!
    await page.mouse.move(b.x + 1, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width - 1, b.y + b.height / 2, { steps: 5 }); await page.mouse.up()
    await page.getByTestId('edit-text').fill('Edited'); await page.getByTestId('edit-apply').click()
    await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 15_000 })
    await page.getByTestId('tool-sign').click(); await page.getByTestId('sign-tab-type').click()
    await page.getByTestId('sign-typed').fill('B Gachichio'); await page.getByTestId('sign-use-typed').click()
    const o = (await page.getByTestId('overlay').boundingBox())!; await page.mouse.click(o.x + o.width / 2, o.y + o.height / 2)
    await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 15_000 })
    await page.getByLabel('Back to pages').click()
    expect(allText(docOf(await exportPdf(page)))).toContain('Edited')
    expect(log.foreign).toEqual([]); expect(log.bodies).toEqual([]); expect(log.late).toEqual([])
  })

  test('scenario 2: assemble a pack from three files and two images, number, watermark, compress, save', async ({ page, context }) => {
    await prepare(page); const log = watch(context)
    await page.goto('/'); await settle(page, log)
    await page.getByTestId('merge-input').setInputFiles([
      ...['pdfjs-basicapi.pdf', 'pdfjs-attachment.pdf', 'synthetic-image-heavy-8p.pdf'].map((f) => ({ name: f, mimeType: 'application/pdf', buffer: readFileSync(corpus(f)) })),
      { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(img('png')) }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(img('jpg')) },
    ])
    await expect(page.getByTestId('grid')).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => pageCount(page)).toBe(3 + 1 + 8 + 2)
    await selectPage(page, 5); await page.getByTestId('dock-rotate').click(); await page.getByTestId('dock-delete').click()
    await expect.poll(() => pageCount(page)).toBe(13)
    await page.getByTestId('dock-numbers').click(); await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 15_000 })
    await page.getByTestId('dock-watermark').click(); await page.getByTestId('watermark-apply').click(); await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 15_000 })
    const d = docOf(await exportPdf(page, { compress: true, strip: true }))
    expect(d.countPages()).toBe(13); expect(allText(d)).toContain('CONFIDENTIAL')
    expect(log.foreign).toEqual([]); expect(log.bodies).toEqual([]); expect(log.late).toEqual([])
  })

  test('scenario 4: sign with a script font and a certificate, split, save pictures', async ({ page, context }) => {
    await prepare(page); const log = watch(context)
    await page.goto('/'); await settle(page, log)
    await openFile(page, 'pdfjs-tracemonkey-text.pdf')
    await toCanvas(page, 0)
    await page.getByTestId('tool-sign').click(); await page.getByTestId('sign-tab-type').click()
    await page.getByTestId('sign-typed').fill('B Gachichio'); await page.getByTestId('sign-font-caveat').click(); await page.getByTestId('sign-use-typed').click()
    const o = (await page.getByTestId('overlay').boundingBox())!; await page.mouse.click(o.x + o.width / 2, o.y + o.height / 4)
    await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 15_000 })
    await page.getByLabel('Back to pages').click()
    await page.getByTestId('dock-more').click(); await page.getByTestId('more-split').click(); await page.getByTestId('split-text').fill('7')
    const [z] = await Promise.all([page.waitForEvent('download'), page.getByTestId('split-apply').click()]); expect(z.suggestedFilename()).toMatch(/\.zip$/)
    await page.keyboard.press('Escape')
    await selectPage(page, 0); await page.getByTestId('dock-more').click(); await page.getByTestId('more-images').click()
    await page.getByTestId('img-scope').selectOption('selected'); await page.getByTestId('img-dpi').selectOption('96')
    const [im] = await Promise.all([page.waitForEvent('download'), page.getByTestId('img-apply').click()]); expect(im.suggestedFilename()).toMatch(/\.png$/)
    await page.keyboard.press('Escape')
    await page.getByTestId('export').click(); await page.getByTestId('sign-panel').locator('summary').click(); await page.getByTestId('sign-id-new').click()
    await page.getByTestId('new-id-name').fill('Egress Check'); await page.getByTestId('new-id-password').fill('correct-horse-9')
    await Promise.all([page.waitForEvent('download'), page.getByTestId('new-id-make').click()])
    await expect(page.getByTestId('sign-id-ready')).toBeVisible()
    const [signed] = await Promise.all([page.waitForEvent('download'), page.getByTestId('sign-save').click()]); expect(signed.suggestedFilename()).toMatch(/-signed\.pdf$/)
    expect(log.foreign).toEqual([]); expect(log.bodies).toEqual([]); expect(log.late).toEqual([])
  })

  test('scenario 3: search, mark, redact, export', async ({ page, context }) => {
    await prepare(page); const log = watch(context)
    await page.goto('/'); await settle(page, log)
    await openFile(page, 'pdfjs-tracemonkey-text.pdf'); await toCanvas(page, 0)
    await page.getByTestId('tool-redact').click(); await page.getByTestId('redact-term').fill('Trace-based'); await page.getByTestId('redact-mark').click()
    await page.getByTestId('redact-apply').click(); await expect(page.getByTestId('toast')).toContainText('verified', { timeout: 15_000 })
    await page.getByLabel('Back to pages').click()
    expect(allText(docOf(await exportPdf(page)))).not.toContain('Trace-based')
    await page.goto('/'); // the receipt reflects the session
    expect(log.foreign).toEqual([]); expect(log.bodies).toEqual([]); expect(log.late).toEqual([])
  })

  test('the Privacy Receipt agrees: green chip, zero other sites, one document', async ({ page }) => {
    await prepare(page)
    await openFile(page, 'pdfjs-basicapi.pdf')
    await page.getByLabel('Back to home').click()
    await page.getByTestId('receipt-chip').click()
    await expect(page.getByTestId('receipt-other')).toHaveText('0')
    await expect(page.getByTestId('receipt-blocked')).toHaveText('0')
    await expect(page.getByTestId('receipt-docs')).toHaveText('1')
    await expect(page.getByTestId('receipt-summary')).toContainText('Nothing you opened has left this device.')
  })

  test('the security policy blocks an outside request and the receipt notices', async ({ page }) => {
    await prepare(page); await page.goto('/')
    await page.evaluate(() => { void fetch('https://example.com/probe').catch(() => undefined) })
    await expect(page.getByTestId('receipt-chip')).toContainText('Check the privacy receipt', { timeout: 5000 })
  })
})
