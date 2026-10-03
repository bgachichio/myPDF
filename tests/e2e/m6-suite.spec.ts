// SPDX-License-Identifier: AGPL-3.0-or-later
// 03-10-2026: the rest of the suite. Script-font signatures, initials, date and marks, pen options and eraser, styled text, signature fields,
// pages to pictures, split, crop, page-number options, export name and limits, save the text, and certificate signing with a read-back check.
import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as mupdf from 'mupdf'
import { prepare, openFile, toCanvas, exportPdf, docOf, allText, selectPage, readDownload, pageCount, audit } from './helpers'

const tmp = mkdtempSync(join(tmpdir(), 'mypdf-m6-'))
const idle = (page: Page) => expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 20_000 })
/** Waits until the nth edit on the open page has been applied (the canvas carries the document revision). */
const rev = (page: Page, n: number) => expect(page.getByTestId('page-canvas')).toHaveAttribute('data-rev', String(n), { timeout: 20_000 })
async function box(page: Page) { return (await page.getByTestId('overlay').boundingBox())! }
async function drag(page: Page, a: [number, number], b: [number, number], steps = 6) {
  const o = await box(page)
  await page.mouse.move(o.x + o.width * a[0], o.y + o.height * a[1]); await page.mouse.down()
  await page.mouse.move(o.x + o.width * b[0], o.y + o.height * b[1], { steps }); await page.mouse.up()
}
async function tap(page: Page, fx: number, fy: number) { const o = await box(page); await page.mouse.click(o.x + o.width * fx, o.y + o.height * fy) }
const images = (d: mupdf.PDFDocument, p = 0) => { const out: number[][] = []; d.loadPage(p).toStructuredText('preserve-images').walk({ onImageBlock(b) { out.push([...b] as number[]) } }); return out }
async function download(page: Page, click: () => Promise<void>) { const [dl] = await Promise.all([page.waitForEvent('download'), click()]); return { dl, bytes: await readDownload(dl) } }
const zipEntries = (bytes: Uint8Array) => {
  const f = join(tmp, `z-${Math.random().toString(36).slice(2)}.zip`); writeFileSync(f, bytes)
  expect(execFileSync('unzip', ['-t', f], { stdio: 'pipe' }).toString()).toMatch(/No errors detected/)
  const names = execFileSync('unzip', ['-Z1', f], { stdio: 'pipe' }).toString().trim().split('\n')
  return { names, read: (n: string) => new Uint8Array(execFileSync('unzip', ['-p', f, n], { stdio: 'pipe', maxBuffer: 1 << 28 })) }
}
async function openMore(page: Page, id: string) { await page.getByTestId('dock-more').click(); await page.getByTestId(id).click() }

test('F6 a typed signature in a shipped script font is placed twice, and initials are kept apart', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf'); await toCanvas(page, 0)
  await page.getByTestId('tool-sign').click()
  await page.getByTestId('sign-tab-type').click()
  await page.getByTestId('sign-typed').fill('Brian Gachichio')
  await page.getByTestId('sign-font-apple').click()
  await expect(page.getByTestId('sign-preview')).toBeVisible()
  expect(await page.evaluate(() => document.fonts.check('24px "Sig Homemade Apple"'))).toBe(true)
  await page.getByTestId('sign-use-typed').click()
  await expect(page.getByRole('status').filter({ hasText: 'Tap where the signature goes' })).toBeVisible({ timeout: 15_000 })
  await tap(page, 0.3, 0.2); await rev(page, 1)
  await tap(page, 0.6, 0.32); await rev(page, 2)
  await page.getByTestId('sign-done').click()
  // initials are a separate saved list
  await page.getByTestId('tool-sign').click()
  await page.getByTestId('role-initials').click(); await page.getByTestId('sign-tab-saved').click()
  await expect(page.getByTestId('sign-use-saved')).toHaveCount(0)
  await page.getByTestId('role-signature').click()
  await expect(page.getByTestId('sign-use-saved')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.getByLabel('Back to pages').click()
  expect(images(docOf(await exportPdf(page))).length).toBe(2)
})

test('F6 a date and a tick are placed as marks', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf'); await toCanvas(page, 0)
  await page.getByTestId('tool-sign').click()
  await page.getByTestId('sign-tab-stamps').click()
  await page.getByTestId('stamp-text').fill('03-10-2026'); await page.getByTestId('stamp-date').click()
  await tap(page, 0.3, 0.3); await rev(page, 1)
  await page.getByTestId('sign-done').click()
  await page.getByTestId('tool-sign').click(); await page.getByTestId('sign-tab-stamps').click(); await page.getByTestId('stamp-tick').click()
  await expect(page.getByRole('status').filter({ hasText: 'Tap where the signature goes' })).toBeVisible()
  await tap(page, 0.7, 0.32); await rev(page, 2)
  await page.getByLabel('Back to pages').click()
  expect(images(docOf(await exportPdf(page))).length).toBe(2)
})

test('F18 pen colour and width are kept, and the eraser removes a stroke', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf'); await toCanvas(page, 0)
  await page.getByTestId('tool-draw').click()
  await page.getByTestId('pen-colour-red').click(); await page.getByTestId('pen-width-thick').click()
  await drag(page, [0.2, 0.3], [0.6, 0.3]); await idle(page)
  await page.getByLabel('Back to pages').click()
  const first = docOf(await exportPdf(page)); await page.keyboard.press('Escape')
  const ink = (first.loadPage(0) as mupdf.PDFPage).getAnnotations().filter((a) => a.getType() === 'Ink')
  expect(ink).toHaveLength(1)
  expect(ink[0].getBorderWidth()).toBe(6)
  const [r, g, b] = ink[0].getColor() as number[]
  expect(r).toBeGreaterThan(0.6); expect(g).toBeLessThan(0.4); expect(b).toBeLessThan(0.2)
  // erase it
  await toCanvas(page, 0)
  await page.getByTestId('tool-draw').click(); await page.getByTestId('eraser-on').click()
  await drag(page, [0.3, 0.27], [0.5, 0.33], 8); await idle(page)
  await page.getByLabel('Back to pages').click()
  const second = docOf(await exportPdf(page))
  expect((second.loadPage(0) as mupdf.PDFPage).getAnnotations().filter((a) => a.getType() === 'Ink')).toHaveLength(0)
})

test('F17 a text box takes a font, bold, italic, size and colour', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf'); await toCanvas(page, 0)
  await page.getByTestId('tool-markup').click(); await page.getByTestId('markup-freetext').click()
  await drag(page, [0.15, 0.3], [0.8, 0.4])
  await page.getByTestId('note-text').fill('Styled words')
  await page.getByTestId('text-font-serif').click(); await page.getByTestId('text-bold').click(); await page.getByTestId('text-italic').click()
  await page.getByTestId('text-size').fill('20'); await page.getByTestId('text-colour-red').click()
  await page.getByTestId('note-apply').click(); await idle(page)
  await page.getByLabel('Back to pages').click()
  const d = docOf(await exportPdf(page))
  expect(allText(d)).toContain('Styled words')
  let hit: { bold: boolean; italic: boolean; serif: boolean; size: number } | null = null
  const chars: string[] = []
  d.loadPage(0).toStructuredText('preserve-whitespace').walk({ onChar(c, _o, font, size) { chars.push(c); if (c === 'S' && chars.join('').endsWith('S') && !hit && font.isBold() && font.isItalic()) hit = { bold: font.isBold(), italic: font.isItalic(), serif: font.isSerif(), size } } })
  expect(hit).toMatchObject({ bold: true, italic: true, serif: true }); expect(hit!.size).toBeCloseTo(20, 0)
})

test('F6 a signature field offers Sign here and takes the signature inside it', async ({ page }) => {
  await prepare(page)
  const doc = new mupdf.PDFDocument()
  doc.insertPage(0, doc.addPage([0, 0, 400, 400], 0, doc.newDictionary(), ''))
  const pg = doc.findPage(0), field = doc.addObject({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: '(ApproverSignature)', F: 4, Rect: [60, 60, 260, 120] })
  const annots = doc.newArray(); annots.push(field); pg.put('Annots', annots)
  doc.getTrailer().get('Root').put('AcroForm', { Fields: [field] })
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles({ name: 'form.pdf', mimeType: 'application/pdf', buffer: Buffer.from(doc.saveToBuffer('').asUint8Array()) })
  await expect(page.getByTestId('grid')).toBeVisible({ timeout: 30_000 })
  await toCanvas(page, 0)
  await page.getByTestId('tool-fields').click()
  await page.getByTestId('sign-field').click()
  await page.getByTestId('sign-tab-type').click(); await page.getByTestId('sign-typed').fill('Approver')
  await page.getByTestId('sign-use-typed').click(); await idle(page)
  await page.getByLabel('Back to pages').click()
  const d = docOf(await exportPdf(page)); const b = images(d)
  expect(b).toHaveLength(1)
  const [x0, y0, x1, y1] = b[0]
  expect(x0).toBeGreaterThanOrEqual(58); expect(x1).toBeLessThanOrEqual(262)
  expect(y0).toBeGreaterThanOrEqual(400 - 122); expect(y1).toBeLessThanOrEqual(400 - 58)
})

test('F22 pages to pictures: one page is a PNG, several are a ZIP', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-tracemonkey-text.pdf')
  await selectPage(page, 0)
  await openMore(page, 'more-images')
  await page.getByTestId('img-scope').selectOption('selected'); await page.getByTestId('img-dpi').selectOption('96')
  const one = await download(page, () => page.getByTestId('img-apply').click())
  expect(one.dl.suggestedFilename()).toMatch(/-page-\d+\.png$/)
  expect([...one.bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  await page.keyboard.press('Escape')
  await selectPage(page, 1)
  await openMore(page, 'more-images')
  await page.getByTestId('img-jpg').click(); await page.getByTestId('img-scope').selectOption('selected'); await page.getByTestId('img-dpi').selectOption('96')
  const many = await download(page, () => page.getByTestId('img-apply').click())
  expect(many.dl.suggestedFilename()).toMatch(/-pages\.zip$/)
  const z = zipEntries(many.bytes)
  expect(z.names).toHaveLength(2); expect(z.names.every((n) => n.endsWith('.jpg'))).toBe(true)
  expect([...z.read(z.names[0]).slice(0, 3)]).toEqual([0xff, 0xd8, 0xff])
})

test('F22 split every 5 pages makes a ZIP of PDFs that add up to the original', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-tracemonkey-text.pdf')
  await openMore(page, 'more-split')
  await page.getByTestId('split-text').fill('5')
  await expect(page.getByTestId('split-preview')).toContainText('Makes 3 files')
  const { bytes } = await download(page, () => page.getByTestId('split-apply').click())
  const z = zipEntries(bytes)
  expect(z.names).toHaveLength(3)
  expect(z.names.map((n) => docOf(z.read(n)).countPages())).toEqual([5, 5, 4])
})

test('F21 crop trims every page by the margins', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf')
  const before = docOf(await exportPdf(page)).loadPage(0).getBounds(); await page.keyboard.press('Escape')
  await openMore(page, 'more-crop')
  for (const k of ['top', 'right', 'bottom', 'left']) await page.getByTestId(`crop-${k}`).fill('20')
  await page.getByTestId('crop-apply').click(); await idle(page)
  const after = docOf(await exportPdf(page)).loadPage(0).getBounds()
  const trim = 40 * 72 / 25.4
  expect(after[2] - after[0]).toBeCloseTo(before[2] - before[0] - trim, 0); expect(after[3] - after[1]).toBeCloseTo(before[3] - before[1] - trim, 0)
})

test('F11 page numbers take a position, a style and a first number', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-tracemonkey-text.pdf')
  await openMore(page, 'more-numbers')
  await page.getByTestId('num-pos').selectOption('top-right'); await page.getByTestId('num-format').selectOption('n-of-total'); await page.getByTestId('num-start').fill('5')
  await page.getByTestId('num-apply').click(); await idle(page)
  const t = allText(docOf(await exportPdf(page)))
  expect(t).toContain('6 of 18'); expect(t).toContain('18 of 18')
})

test('F12 and F20 a chosen file name, a size note, and limits that readers see', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf')
  await page.getByTestId('export').click()
  await page.getByTestId('export-name').fill('board-final')
  await page.getByTestId('limits').locator('summary').click()
  await page.getByTestId('allow-print').setChecked(false)
  // limits without an owner password are refused with a reason
  await page.getByTestId('export-save').click()
  await expect(page.getByTestId('toast')).toContainText('owner password')
  await page.getByTestId('opt-owner').fill('owner-pw-9')
  const { dl, bytes } = await download(page, () => page.getByTestId('export-save').click())
  expect(dl.suggestedFilename()).toBe('board-final.pdf')
  const d = mupdf.Document.openDocument(bytes, 'application/pdf')
  expect(d.needsPassword()).toBe(false); expect(d.hasPermission('print')).toBe(false); expect(d.hasPermission('copy')).toBe(true)
  await expect(page.getByTestId('toast')).toContainText(/smaller|larger|same size/)
})

test('F23 the text of every page is saved as a text file', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-tracemonkey-text.pdf')
  await page.getByTestId('dock-more').click()
  const { dl, bytes } = await download(page, () => page.getByTestId('more-text').click())
  expect(dl.suggestedFilename()).toMatch(/\.txt$/)
  expect(new TextDecoder().decode(bytes)).toContain('Trace-based')
})

test('F19 make a signing ID, sign, read the signature back, and see it break on edit', async ({ page }) => {
  test.setTimeout(120_000)
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf')
  await page.getByTestId('export').click()
  await page.getByTestId('sign-panel').locator('summary').click()
  await page.getByTestId('sign-id-new').click()
  await page.getByTestId('new-id-name').fill('Test Signer'); await page.getByTestId('new-id-email').fill('signer@example.org')
  await page.getByTestId('new-id-password').fill('short')
  await page.getByTestId('new-id-make').click()
  await expect(page.getByTestId('sign-error')).toContainText('8 characters')
  await page.getByTestId('new-id-password').fill('correct-horse-9')
  const id = await download(page, () => page.getByTestId('new-id-make').click())
  expect(id.dl.suggestedFilename()).toMatch(/\.p12$/)
  const p12 = join(tmp, 'id.p12'); writeFileSync(p12, id.bytes)
  await expect(page.getByTestId('sign-id-ready')).toContainText('Test Signer')
  await page.getByTestId('sign-reason').fill('I approve this'); await page.getByTestId('sign-location').fill('Nairobi')
  const signed = await download(page, () => page.getByTestId('sign-save').click())
  expect(signed.dl.suggestedFilename()).toMatch(/-signed\.pdf$/)
  const file = join(tmp, 'signed.pdf'); writeFileSync(file, signed.bytes)
  // an independent reader agrees
  try {
    const out = execFileSync('pdfsig', [file], { stdio: 'pipe' }).toString()
    expect(out).toMatch(/Signature Validation: Signature is Valid/); expect(out).toMatch(/Test Signer/)
  } catch (e) { if ((e as { code?: string }).code !== 'ENOENT') throw e }
  expect(docOf(signed.bytes).countPages()).toBeGreaterThan(0)

  // open the signed file: the chip reports it, and an edit turns the chip into a warning
  await page.keyboard.press('Escape')
  await page.getByLabel('Back to home').click()
  await page.getByTestId('file-input').setInputFiles(file)
  await expect(page.getByTestId('grid')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('sig-chip')).toContainText('Signed (1)', { timeout: 15_000 })
  await page.getByTestId('sig-chip').click()
  await expect(page.getByTestId('sig-state')).toContainText('Signed content unchanged')
  await page.keyboard.press('Escape')
  await selectPage(page, 0); await page.getByTestId('dock-rotate').click(); await idle(page)
  await expect(page.getByTestId('sig-chip')).toContainText('break the signature')

  // the saved ID opens again, and a wrong password is told apart
  await page.getByTestId('export').click()
  await page.getByTestId('sign-panel').locator('summary').click()
  await page.getByTestId('sign-id-file').setInputFiles(p12)
  await page.getByTestId('sign-id-password').fill('wrong'); await page.getByTestId('sign-id-open').click()
  await expect(page.getByTestId('sign-error')).toContainText('password did not open')
  await page.getByTestId('sign-id-password').fill('correct-horse-9'); await page.getByTestId('sign-id-open').click()
  await expect(page.getByTestId('sign-id-ready')).toContainText('Test Signer')
  expect(await pageCount(page)).toBeGreaterThan(0)
})

test('every new screen fits a phone at the largest text, in light and dark, with 44 px targets', async ({ page }) => {
  test.setTimeout(180_000)
  await prepare(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => { localStorage.setItem('ui.fontScale', 'xlarge') })
  await openFile(page, 'pdfjs-tracemonkey-text.pdf')
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.getByTestId('dock-more').click(); await audit(page, `more menu ${scheme}`)
    for (const [id, label] of [['more-split', 'split'], ['more-images', 'images'], ['more-crop', 'crop'], ['more-numbers', 'numbers'], ['more-sigs', 'signatures']] as const) {
      await page.getByTestId(id).click(); await audit(page, `${label} ${scheme}`)
      await page.getByRole('button', { name: 'Back', exact: true }).click()
    }
    await page.keyboard.press('Escape')
    await page.getByTestId('export').click()
    await page.getByTestId('limits').locator('summary').click(); await page.getByTestId('sign-panel').locator('summary').click()
    await audit(page, `export with limits and signing open ${scheme}`)
    await page.getByTestId('sign-id-new').click(); await audit(page, `new signing ID ${scheme}`)
    await page.keyboard.press('Escape')
  }
  await page.emulateMedia({ colorScheme: 'light' })
  await selectPage(page, 0); await page.getByTestId('dock-edit').click()
  await expect(page.getByTestId('page-canvas')).toHaveAttribute('data-rendered', '0', { timeout: 15_000 })
  await page.getByTestId('tool-draw').click(); await audit(page, 'pen options')
  await page.getByTestId('eraser-on').click(); await audit(page, 'eraser')
  await page.getByTestId('tool-markup').click(); await page.getByTestId('markup-freetext').click()
  await drag(page, [0.15, 0.3], [0.8, 0.4]); await audit(page, 'text style sheet'); await page.keyboard.press('Escape')
  await page.getByTestId('tool-sign').click()
  for (const tab of ['draw', 'type', 'image', 'stamps', 'saved']) { await page.getByTestId(`sign-tab-${tab}`).click(); await audit(page, `sign ${tab}`) }
  await page.getByTestId('sign-tab-type').click(); await page.getByTestId('sign-typed').fill('Brian Gachichio'); await expect(page.getByTestId('sign-preview')).toBeVisible(); await audit(page, 'sign type with preview')
  await page.getByTestId('role-initials').click(); await audit(page, 'sign initials')
})

test('F7 ready-made redaction patterns mark every email and phone number, and removal is verified', async ({ page }) => {
  await prepare(page)
  const doc = new mupdf.PDFDocument()
  const font = doc.addSimpleFont(new mupdf.Font('Helvetica'), 'Latin')
  doc.insertPage(0, doc.addPage([0, 0, 500, 300], 0, doc.addObject({ Font: { F1: font } }), 'BT /F1 12 Tf 30 200 Td (Write to brian@gachichio.org or call 0725 471 260 about KRA PIN A123456789Z.) Tj ET'))
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles({ name: 'contact.pdf', mimeType: 'application/pdf', buffer: Buffer.from(doc.saveToBuffer('').asUint8Array()) })
  await expect(page.getByTestId('grid')).toBeVisible({ timeout: 30_000 })
  await toCanvas(page, 0)
  await page.getByTestId('tool-redact').click()
  await page.getByTestId('redact-preset-email').click(); await expect(page.getByTestId('redact-banner')).toContainText('1 area marked', { timeout: 15_000 })
  await page.getByTestId('redact-preset-phone').click(); await expect(page.getByTestId('redact-banner')).toContainText('2 areas marked', { timeout: 15_000 })
  await page.getByTestId('redact-preset-kra').click(); await expect(page.getByTestId('redact-banner')).toContainText('3 areas marked', { timeout: 15_000 })
  await page.getByTestId('redact-apply').click(); await expect(page.getByTestId('toast')).toContainText('verified', { timeout: 15_000 })
  await page.getByLabel('Back to pages').click()
  const t = allText(docOf(await exportPdf(page)))
  expect(t).toContain('Write to'); expect(t).toContain('about')
  for (const gone of ['brian@gachichio.org', '0725 471 260', 'A123456789Z']) expect(t).not.toContain(gone)
})

test('F25 a link to a web address and one to a page are added', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-tracemonkey-text.pdf'); await toCanvas(page, 0)
  await page.getByTestId('tool-markup').click(); await page.getByTestId('markup-link').click()
  await drag(page, [0.2, 0.2], [0.6, 0.25]); await page.getByTestId('link-value').fill('not an address'); await page.getByTestId('link-apply').click()
  await expect(page.getByTestId('toast')).toContainText('Use an address')
  await page.getByTestId('link-value').fill('https://gachichio.org'); await page.getByTestId('link-apply').click(); await rev(page, 1)
  await drag(page, [0.2, 0.3], [0.6, 0.35]); await page.getByTestId('link-page').click(); await page.getByTestId('link-value').fill('5'); await page.getByTestId('link-apply').click(); await rev(page, 2)
  await page.getByLabel('Back to pages').click()
  const d = docOf(await exportPdf(page)); const links = d.loadPage(0).getLinks()
  expect(links).toHaveLength(2)
  expect(links.find((l) => l.isExternal())!.getURI()).toBe('https://gachichio.org')
  expect(d.resolveLink(links.find((l) => !l.isExternal())!)).toBe(4)
})

test('F24 marks can be made permanent, and undo brings them back', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf'); await toCanvas(page, 0)
  await page.getByTestId('tool-draw').click(); await drag(page, [0.2, 0.3], [0.6, 0.3]); await rev(page, 1)
  await page.getByLabel('Back to pages').click()
  await page.getByTestId('dock-more').click(); await page.getByTestId('more-flatten').click(); await idle(page)
  const live = async () => (docOf(await exportPdf(page)).loadPage(0) as mupdf.PDFPage).getAnnotations().filter((a) => a.getType() === 'Ink').length
  expect(await live()).toBe(0); await page.keyboard.press('Escape')
  await page.getByTestId('undo').click(); await idle(page)
  expect(await live()).toBe(1)
})
