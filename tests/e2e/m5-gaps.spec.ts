// SPDX-License-Identifier: AGPL-3.0-or-later
// Small gaps closed after launch: F04 insert an image, F10 document properties and decrypt, F12 save over the original, F01 desktop file handler,
// zoom (buttons, Ctrl+wheel, pinch), the first-run loading state, and the brand assets (logo, icons, install screenshots).
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import * as mupdf from 'mupdf'
import { prepare, openFile, toCanvas, exportPdf, docOf, corpus, ORIGIN } from './helpers'

const png = () => { const p = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 90, 40], false); p.clear(60); return Buffer.from(p.asPNG()) }
const b64 = (f: string) => readFileSync(corpus(f)).toString('base64')

test('F04 insert a picture on a page', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf'); await toCanvas(page, 0)
  await page.getByTestId('tool-image').click()
  await page.getByTestId('insert-image').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png() })
  await expect(page.getByTestId('image-hint')).toContainText('Tap where the image goes')
  const box = (await page.getByTestId('overlay').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 4)
  await expect(page.getByTestId('undo')).toBeEnabled({ timeout: 15_000 }) // the edit has been recorded
  await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 15_000 })
  await page.getByLabel('Back to pages').click()
  const d = docOf(await exportPdf(page)); const boxes: number[][] = []
  d.loadPage(0).toStructuredText('preserve-images').walk({ onImageBlock(b) { boxes.push([...b] as number[]) } })
  expect(boxes.length).toBeGreaterThan(0)
  const [x0, , x1] = boxes[boxes.length - 1], w = d.loadPage(0).getBounds()[2]
  expect((x0 + x1) / 2).toBeGreaterThan(w * 0.4); expect((x0 + x1) / 2).toBeLessThan(w * 0.6)
})

test('F10 document properties are prefilled, saved, and an exported file is decrypted', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf')
  await page.getByTestId('export').click()
  await page.getByTestId('opt-strip').setChecked(false)
  for (const [k, v] of [['title', 'Board paper'], ['author', 'B. Gachichio'], ['subject', 'Q3 results'], ['keywords', 'board, q3']]) await page.getByTestId(`meta-${k}`).fill(v)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-save').click()])
  const d = docOf(new Uint8Array(readFileSync((await dl.path())!)))
  expect(['Title', 'Author', 'Subject', 'Keywords'].map((k) => d.getMetaData(`info:${k}`))).toEqual(['Board paper', 'B. Gachichio', 'Q3 results', 'board, q3'])
  await page.keyboard.press('Escape')
  await page.getByTestId('export').click(); await page.getByTestId('opt-strip').setChecked(false)
  await expect(page.getByTestId('meta-title')).toHaveValue('Board paper')
  await page.keyboard.press('Escape')
  // decrypt: open a password file, export without a password, the result opens without one
  await page.getByLabel('Back to home').click()
  await page.getByTestId('file-input').setInputFiles(corpus('synthetic-encrypted-aes256.pdf'))
  await page.getByLabel(/is password protected/).fill('testpass'); await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByTestId('grid')).toBeVisible({ timeout: 30_000 })
  const plain = mupdf.Document.openDocument(await exportPdf(page), 'application/pdf')
  expect(plain.needsPassword()).toBe(false); expect(plain.countPages()).toBe(3)
})

async function fakeHandles(page: import('@playwright/test').Page, file: string) {
  await page.addInitScript(([data, name]) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const w = window as unknown as { __written: number[][]; __perm: number; showOpenFilePicker?: unknown; showSaveFilePicker?: unknown }
    w.__written = []; w.__perm = 0
    const handle = {
      kind: 'file', name,
      getFile: async () => new File([bytes], name, { type: 'application/pdf' }),
      requestPermission: async () => { w.__perm++; return 'granted' },
      createWritable: async () => { const chunks: number[] = []; return { write: async (b: Uint8Array) => { chunks.push(...b) }, close: async () => { w.__written.push(chunks) } } },
    }
    ;(window as unknown as { __handle: unknown }).__handle = handle
    w.showOpenFilePicker = async () => [handle]
    delete w.showSaveFilePicker
  }, [b64(file), file])
}

test('F12 save over the original file, with a confirming second tap', async ({ page }) => {
  await prepare(page); await fakeHandles(page, 'pdfjs-basicapi.pdf')
  await page.goto('/')
  await page.getByTestId('open-pdf').click()
  await expect(page.getByTestId('grid')).toBeVisible({ timeout: 30_000 })
  await page.locator('[data-testid="page-0"] button').click(); await page.getByTestId('dock-rotate').click(); await expect(page.getByTestId('busy')).toHaveCount(0)
  await page.getByTestId('export').click()
  const replace = page.getByTestId('export-replace')
  await expect(replace).toContainText('Save over the original (pdfjs-basicapi.pdf)')
  await replace.click(); await expect(replace).toContainText('Tap again to replace')
  expect(await page.evaluate(() => (window as unknown as { __written: unknown[] }).__written.length)).toBe(0) // nothing written yet
  await replace.click()
  await expect(page.getByTestId('toast')).toContainText('Replaced pdfjs-basicapi.pdf')
  const written = await page.evaluate(() => (window as unknown as { __written: number[][] }).__written)
  expect(written).toHaveLength(1)
  const d = docOf(new Uint8Array(written[0]))
  expect(d.countPages()).toBe(3)
  expect(Number((d.loadPage(0) as mupdf.PDFPage).getObject().getInheritable('Rotate').asNumber())).toBe(90)
})

test('F01 desktop file handler opens the launched file', async ({ page }) => {
  await prepare(page); await fakeHandles(page, 'pdfjs-tracemonkey-text.pdf')
  await page.addInitScript(() => { Object.defineProperty(window, 'launchQueue', { configurable: true, value: { setConsumer(cb: (p: { files: unknown[] }) => void) { (window as unknown as { __launch: unknown }).__launch = cb } } }) })
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as unknown as { __launch?: unknown }).__launch))
  await page.evaluate(() => { const w = window as unknown as { __launch: (p: { files: unknown[] }) => void; __handle: unknown }; w.__launch({ files: [w.__handle] }) })
  await expect(page.getByTestId('grid')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('page-count')).toContainText('14 pages')
})

test('zoom: buttons, Ctrl+wheel and a two-finger pinch', async ({ page, browserName }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf'); await toCanvas(page, 0)
  const level = page.getByTestId('zoom-level')
  await expect(level).toHaveText('100%')
  await page.getByLabel('Zoom in').click(); await expect(level).toHaveText('125%')
  await page.getByLabel('Zoom out').click(); await page.getByLabel('Zoom out').click(); await expect(level).toHaveText('75%')
  const box = (await page.locator('main').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 200); await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control')
  await expect.poll(async () => parseInt((await level.innerText()).replace('%', ''))).toBeGreaterThan(75)
  if (browserName !== 'chromium') return // touch pinch is driven through the Chrome DevTools protocol
  const before = parseInt((await level.innerText()).replace('%', ''))
  const cdp = await page.context().newCDPSession(page)
  const cx = box.x + box.width / 2, cy = box.y + 300
  const pts = (d: number) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(40) })
  for (const d of [60, 90, 120]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => parseInt((await level.innerText()).replace('%', ''))).toBeGreaterThan(before)
})

test('first-run loading: thumbnails show skeletons until rendered', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'synthetic-board-pack-310p.pdf')
  await expect.poll(() => page.locator('canvas.skeleton').count(), { timeout: 5000 }).toBeGreaterThan(0)
  await expect(page.locator('[data-testid="page-0"] canvas')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  await expect(page.locator('[data-testid="page-0"] canvas')).not.toHaveClass(/skeleton/)
})

test.describe('brand assets', () => {
  test('logo and icons are real, wired in, and the manifest points at files that exist', async ({ page, request }) => {
    await prepare(page); await page.goto('/')
    const logo = page.getByTestId('logo')
    await expect(logo).toBeVisible()
    expect(await logo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    expect(await page.locator('header img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    for (const sel of ['link[rel="icon"][type="image/svg+xml"]', 'link[rel="apple-touch-icon"]', 'link[rel="shortcut icon"]', 'meta[property="og:image"]']) expect(await page.locator(sel).count(), sel).toBeGreaterThan(0)
    const manifest = await (await request.get(`${ORIGIN}/manifest.webmanifest`)).json()
    const urls = [...manifest.icons, ...manifest.screenshots].map((i: { src: string }) => i.src).concat(['/favicon.ico', '/og-image.png', '/icons/apple-touch-icon.png', '/icons/logo.svg'])
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
    expect(manifest.screenshots.some((s: { form_factor: string }) => s.form_factor === 'wide')).toBe(true)
    for (const u of urls) { const r = await request.get(`${ORIGIN}${u}`); expect(r.status(), u).toBe(200); expect((await r.body()).length, u).toBeGreaterThan(300) }
  })
})
