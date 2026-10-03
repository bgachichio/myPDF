// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Engine methods added on 03-10-2026 (F17 to F21): typed text, ink eraser, crop, stamp options, restrictions, and placement on rotated pages.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as mupdf from 'mupdf'

vi.mock('comlink', () => ({ expose: vi.fn(), wrap: vi.fn(), transfer: (v: unknown) => v }))

const corpus = (f: string) => readFileSync(resolve(__dirname, '../corpus', f))
const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
let engine: typeof import('@/engine/mupdf/engine.worker').engine
const open = async (f: string) => (await engine.open(ab(corpus(f)))).id
const reopen = (bytes: Uint8Array) => mupdf.Document.openDocument(bytes, 'application/pdf').asPDF()!
const SAVE = { compress: false, stripMetadata: false }
/** Bounding box of the words that start a line containing `needle`, in page space. */
function wordBox(d: mupdf.PDFDocument, page: number, needle: string): { box: number[]; bold: boolean; italic: boolean; mono: boolean; serif: boolean } | null {
  let found: ReturnType<typeof wordBox> = null
  const text: { c: string; q: number[]; bold: boolean; italic: boolean; mono: boolean; serif: boolean }[] = []
  d.loadPage(page).toStructuredText('preserve-whitespace').walk({ onChar(c, _o, font, _s, quad) { text.push({ c, q: [...quad], bold: font.isBold(), italic: font.isItalic(), mono: font.isMono(), serif: font.isSerif() }) } })
  const joined = text.map((t) => t.c).join(''), at = joined.indexOf(needle)
  if (at >= 0) {
    const run = text.slice(at, at + needle.length)
    const xs = run.flatMap((t) => [t.q[0], t.q[2], t.q[4], t.q[6]]), ys = run.flatMap((t) => [t.q[1], t.q[3], t.q[5], t.q[7]])
    found = { box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], bold: run[0].bold, italic: run[0].italic, mono: run[0].mono, serif: run[0].serif }
  }
  return found
}
async function blankDoc(w = 400, h = 600, n = 1) {
  const doc = new mupdf.PDFDocument()
  for (let i = 0; i < n; i++) doc.insertPage(i, doc.addPage([0, 0, w, h], 0, doc.newDictionary(), ''))
  return (await engine.open(ab(Buffer.from(doc.saveToBuffer('').asUint8Array()))))
}

beforeAll(async () => { engine = (await import('@/engine/mupdf/engine.worker')).engine })

describe('F17 typed text', () => {
  it('places text in the chosen face and colour, wrapped inside its box', async () => {
    const { id } = await blankDoc()
    const rect: [number, number, number, number] = [50, 100, 200, 200]
    const ok = await engine.addText(id, 0, rect, 'Bold serif words that need to wrap onto several lines inside this box', { font: 'serif', size: 14, bold: true, italic: true, color: '#c2410c' })
    expect(ok).toBe(true)
    const d = reopen(await engine.save(id, SAVE))
    const hit = wordBox(d, 0, 'Bold serif')!
    expect(hit.bold).toBe(true); expect(hit.italic).toBe(true); expect(hit.serif).toBe(true)
    expect(hit.box[0]).toBeGreaterThanOrEqual(rect[0] - 1); expect(hit.box[1]).toBeGreaterThanOrEqual(rect[1] - 2)
    const all = d.loadPage(0).toStructuredText('preserve-whitespace').asText().split('\n').filter(Boolean)
    expect(all.length).toBeGreaterThan(2) // wrapped
    let maxX = 0
    d.loadPage(0).toStructuredText('preserve-whitespace').walk({ onChar(_c, _o, _f, _s, q) { maxX = Math.max(maxX, q[2], q[6]) } })
    expect(maxX).toBeLessThanOrEqual(rect[2] + 2)
    // The colour is in the page, not just the text: sample a rendered pixel inside the first glyphs.
    const px = d.loadPage(0).toPixmap(mupdf.Matrix.scale(4, 4), mupdf.ColorSpace.DeviceRGB, false, true)
    const data = px.getPixels(), n = px.getNumberOfComponents(), stride = px.getStride()
    let orange = 0
    for (let y = 0; y < px.getHeight(); y++) for (let x = 0; x < px.getWidth(); x++) { const i = y * stride + x * n; if (data[i] > 150 && data[i + 1] < 110 && data[i + 2] < 60) orange++ }
    expect(orange).toBeGreaterThan(50)
  })

  it('reports characters the face cannot draw, and keeps the rest', async () => {
    const { id } = await blankDoc()
    expect(await engine.addText(id, 0, [20, 20, 300, 60], 'Price ₹ 100', { font: 'sans', size: 12, bold: false, italic: false, color: '#000000' })).toBe(false)
    expect(reopen(await engine.save(id, SAVE)).loadPage(0).toStructuredText('preserve-whitespace').asText()).toContain('Price ? 100')
  })

  it('lands inside the chosen box on a rotated page', async () => {
    const { id } = await blankDoc(400, 600)
    await engine.rotate(id, [0], 90)
    const rect: [number, number, number, number] = [60, 80, 300, 120]
    await engine.addText(id, 0, rect, 'Sideways', { font: 'mono', size: 14, bold: false, italic: false, color: '#000000' })
    const d = reopen(await engine.save(id, SAVE))
    const hit = wordBox(d, 0, 'Sideways')!
    expect(hit.mono).toBe(true)
    expect(hit.box[0]).toBeGreaterThan(rect[0] - 2); expect(hit.box[2]).toBeLessThan(rect[2])
    expect(hit.box[1]).toBeGreaterThan(rect[1] - 2); expect(hit.box[3]).toBeLessThan(rect[3] + 2)
  })
})

describe('F18 ink and eraser', () => {
  it('draws with a chosen width and erases whole strokes near a point', async () => {
    const { id } = await blankDoc()
    await engine.annotate(id, 0, { type: 'ink', page: 0, inkList: [[[50, 50], [150, 50]]], color: '#1a3fb0', borderWidth: 6 })
    await engine.annotate(id, 0, { type: 'ink', page: 0, inkList: [[[50, 300], [150, 300]]], color: '#c2410c' })
    const count = async () => (reopen(await engine.save(id, SAVE)).loadPage(0) as mupdf.PDFPage).getAnnotations().filter((a) => a.getType() === 'Ink')
    const before = await count()
    expect(before).toHaveLength(2)
    expect(before.map((a) => a.getBorderWidth()).sort()).toEqual([2, 6])
    expect(await engine.eraseInk(id, 0, [400, 500], 10)).toBe(0)
    expect(await engine.eraseInk(id, 0, [100, 56], 5)).toBe(1) // 6 pt away from a 6 pt wide stroke: inside its edge
    expect(await count()).toHaveLength(1)
    expect(await engine.eraseInk(id, 0, [100, 300], 4)).toBe(1)
    expect(await count()).toHaveLength(0)
  })
})

describe('F21 crop', () => {
  it('trims the visible page by the margins on an upright and a rotated page', async () => {
    const { id } = await blankDoc(400, 600, 2)
    await engine.rotate(id, [1], 90)
    await engine.crop(id, [0, 1], { top: 20, right: 30, bottom: 40, left: 10 })
    const pages = await engine.pages(id)
    expect(pages[0].width).toBeCloseTo(360, 0); expect(pages[0].height).toBeCloseTo(540, 0)
    expect(pages[1].width).toBeCloseTo(560, 0); expect(pages[1].height).toBeCloseTo(340, 0) // 90 degrees: the page is 600 wide and 400 tall as seen, and the margins are taken as seen
    const d = reopen(await engine.save(id, SAVE))
    expect(d.loadPage(0).getBounds()[2]).toBeCloseTo(360, 0)
  })

  it('keeps the page content where it was, relative to the new corner', async () => {
    const { id } = await blankDoc(400, 600)
    await engine.addText(id, 0, [100, 100, 300, 130], 'Anchor', { font: 'sans', size: 14, bold: false, italic: false, color: '#000000' })
    const before = wordBox(reopen(await engine.save(id, SAVE)), 0, 'Anchor')!.box
    await engine.crop(id, [0], { top: 50, right: 0, bottom: 0, left: 30 })
    const after = wordBox(reopen(await engine.save(id, SAVE)), 0, 'Anchor')!.box
    expect(after[0]).toBeCloseTo(before[0] - 30, 0); expect(after[1]).toBeCloseTo(before[1] - 50, 0)
  })

  it('refuses margins that leave nothing', async () => {
    const { id } = await blankDoc(200, 200)
    await expect(engine.crop(id, [0], { top: 100, right: 0, bottom: 100, left: 0 })).rejects.toThrow()
  })
})

describe('F11 stamp options and placement', () => {
  it('numbers pages with a format, a start and a corner', async () => {
    const { id } = await blankDoc(400, 600, 3)
    await engine.stamp(id, 'pageNumbers', undefined, { format: 'n-of-total', start: 5, position: 'top-right', size: 12 })
    const d = reopen(await engine.save(id, SAVE))
    const hit = wordBox(d, 1, '6 of 7')!
    expect(hit.box[1]).toBeLessThan(60); expect(hit.box[2]).toBeGreaterThan(300)
    expect(wordBox(d, 2, '7 of 7')).not.toBeNull()
  })

  it('numbers pages upright on a rotated page', async () => {
    const { id } = await blankDoc(400, 600)
    await engine.rotate(id, [0], 90)
    await engine.stamp(id, 'pageNumbers', undefined, { position: 'bottom-center' })
    const hit = wordBox(reopen(await engine.save(id, SAVE)), 0, '1')!
    expect(hit.box[1]).toBeGreaterThan(340) // the visible page is 600 wide and 400 tall; the number sits near the visible bottom
  })

  it('watermarks with a chosen text and keeps the page readable', async () => {
    const { id } = await blankDoc(400, 600)
    await engine.stamp(id, 'watermark', 'SAMPLE', { opacity: 0.3, color: '#ff0000' })
    const d = reopen(await engine.save(id, SAVE))
    expect(d.loadPage(0).toStructuredText('preserve-whitespace').asText()).toContain('SAMPLE')
  })

  it('places an image where it was dropped on a rotated page', async () => {
    const { id } = await blankDoc(400, 600)
    await engine.rotate(id, [0], 270)
    const png = new Blob([new Uint8Array(mupdf.Pixmap.prototype ? (() => { const p = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 20, 10], false); p.clear(40); return p.asPNG() })() : [])], { type: 'image/png' })
    await engine.placeImage(id, 0, [100, 50, 200, 100], png)
    const d = reopen(await engine.save(id, SAVE))
    const boxes: number[][] = []
    d.loadPage(0).toStructuredText('preserve-images').walk({ onImageBlock(b) { boxes.push([...b] as number[]) } })
    expect(boxes).toHaveLength(1)
    const [x0, y0, x1, y1] = boxes[0]
    expect(x0).toBeCloseTo(100, 0); expect(y0).toBeCloseTo(50, 0); expect(x1).toBeCloseTo(200, 0); expect(y1).toBeCloseTo(100, 0)
  })
})

describe('F20 restrictions', () => {
  it('opens freely but blocks the actions that were switched off', async () => {
    const id = await open('pdfjs-basicapi.pdf')
    const none = await engine.save(id, { ...SAVE, ownerPassword: 'owner-pw-1', restrict: { print: false, copy: false, edit: false } })
    const d = mupdf.Document.openDocument(none, 'application/pdf')
    expect(d.needsPassword()).toBe(false)
    expect(d.hasPermission('print')).toBe(false); expect(d.hasPermission('copy')).toBe(false); expect(d.hasPermission('edit')).toBe(false)
    const some = mupdf.Document.openDocument(await engine.save(id, { ...SAVE, ownerPassword: 'owner-pw-1', restrict: { print: true, copy: false, edit: false } }), 'application/pdf')
    expect(some.hasPermission('print')).toBe(true); expect(some.hasPermission('copy')).toBe(false)
  })

  it('adds an open password when one is given', async () => {
    const id = await open('pdfjs-basicapi.pdf')
    const out = await engine.save(id, { ...SAVE, password: 'open-pw-1', ownerPassword: 'owner-pw-1', restrict: { print: true, copy: true, edit: false } })
    const d = mupdf.Document.openDocument(out, 'application/pdf')
    expect(d.needsPassword()).toBe(true)
    expect(d.authenticatePassword('open-pw-1')).toBeGreaterThan(0)
  })
})

describe('F24 and F25 links and permanent marks', () => {
  it('adds a web link and a link to a page, and both survive a save', async () => {
    const { id } = await blankDoc(400, 600, 3)
    await engine.addLink(id, 0, [50, 50, 200, 80], { uri: 'https://gachichio.org' })
    await engine.addLink(id, 0, [50, 100, 200, 130], { page: 2 })
    const d = reopen(await engine.save(id, SAVE))
    const links = d.loadPage(0).getLinks()
    expect(links).toHaveLength(2)
    expect(links.find((l) => l.isExternal())!.getURI()).toBe('https://gachichio.org')
    expect(d.resolveLink(links.find((l) => !l.isExternal())!)).toBe(2)
    await expect(engine.addLink(id, 0, [1, 1, 20, 20], { uri: '  ' })).rejects.toThrow()
  })

  it('makes highlights and drawings part of the page, leaving no annotations', async () => {
    const id = await open('pdfjs-tracemonkey-text.pdf')
    const hit = (await engine.search(id, 'Trace-based'))[0]
    await engine.annotate(id, hit.page, { type: 'highlight', page: hit.page, quads: hit.quads.slice(0, 1) })
    await engine.annotate(id, 0, { type: 'ink', page: 0, inkList: [[[50, 400], [200, 420]]], color: '#c2410c', borderWidth: 4 })
    const live = (b: Uint8Array) => (reopen(b).loadPage(0) as mupdf.PDFPage).getAnnotations().filter((a) => ['Highlight', 'Ink'].includes(a.getType())).length
    expect(live(await engine.save(id, SAVE))).toBe(2)
    await engine.flatten(id, true)
    const out = await engine.save(id, SAVE)
    expect(live(out)).toBe(0)
    // The marks are painted: the page renders with orange pixels where the stroke was.
    const px = reopen(out).loadPage(0).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true)
    const data = px.getPixels(), n = px.getNumberOfComponents(), stride = px.getStride()
    let orange = 0
    for (let y = 0; y < px.getHeight(); y++) for (let x = 0; x < px.getWidth(); x++) { const i = y * stride + x * n; if (data[i] > 150 && data[i + 1] < 110 && data[i + 2] < 60) orange++ }
    expect(orange).toBeGreaterThan(100)
  })
})

describe('R07 verification is not vacuous', () => {
  it('passes when the neighbouring words stay and the marked word goes', async () => {
    const doc = new mupdf.PDFDocument()
    const font = doc.addSimpleFont(new mupdf.Font('Helvetica'), 'Latin')
    doc.insertPage(0, doc.addPage([0, 0, 400, 200], 0, doc.addObject({ Font: { F1: font } }), 'BT /F1 14 Tf 30 100 Td (alpha SECRET omega) Tj ET'))
    const { id } = await engine.open(ab(Buffer.from(doc.saveToBuffer('').asUint8Array())))
    for (const h of await engine.search(id, 'SECRET')) await engine.markRedaction(id, h.page, h.quads)
    expect(await engine.applyRedactions(id)).toEqual({ verified: true, residualMatches: 0 })
    const text = reopen(await engine.save(id, SAVE)).loadPage(0).toStructuredText('preserve-whitespace').asText()
    expect(text).toContain('alpha'); expect(text).toContain('omega'); expect(text).not.toContain('SECRET')
  })
})
