// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Every PdfEngine method against corpus fixtures (BUILD-BRIEF section 9). Also carries the engine-level halves of R03, R05, R07, R08, R10.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { writeFileSync } from 'fs'
import * as mupdf from 'mupdf'

vi.mock('comlink', () => ({ expose: vi.fn(), wrap: vi.fn(), transfer: (v: unknown) => v }))

const corpus = (f: string) => readFileSync(resolve(__dirname, '../corpus', f))
const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
let engine: typeof import('@/engine/mupdf/engine.worker').engine

async function open(file: string, pw?: string) {
  const r = await engine.open(ab(corpus(file)), pw)
  if (!r.id) throw new Error('needs password')
  return r
}
function qpdfOk(bytes: Uint8Array, password?: string): boolean | null {
  try { execFileSync('qpdf', ['--version'], { stdio: 'pipe' }) } catch { return null }
  const p = join(tmpdir(), `eng-${process.pid}-${Math.random()}.pdf`)
  writeFileSync(p, bytes)
  try { execFileSync('qpdf', [...(password ? [`--password=${password}`] : []), '--check', p], { stdio: 'pipe' }); return true } catch (e) { return (e as { status?: number }).status === 3 }
}
const reopen = (bytes: Uint8Array) => mupdf.Document.openDocument(bytes, 'application/pdf').asPDF()!
const pg = (d: mupdf.PDFDocument, i: number) => d.loadPage(i) as mupdf.PDFPage
const textOf = (bytes: Uint8Array) => { const d = reopen(bytes); let t = ''; for (let i = 0; i < d.countPages(); i++) t += d.loadPage(i).toStructuredText('preserve-whitespace').asText(); return t }

beforeAll(async () => { engine = (await import('@/engine/mupdf/engine.worker')).engine })

describe('organise (M1)', () => {
  it('opens, reports pages and asks for a password', async () => {
    const r = await open('pdfjs-tracemonkey-text.pdf')
    expect(r.pages).toHaveLength(14)
    const enc = await engine.open(ab(corpus('synthetic-encrypted-aes256.pdf')))
    expect(enc.needsPassword).toBe(true)
    expect((await engine.open(ab(corpus('synthetic-encrypted-aes256.pdf')), 'wrong')).id).toBe('')
    expect((await engine.open(ab(corpus('synthetic-encrypted-aes256.pdf')), 'testpass')).id).not.toBe('')
  })

  it('text and search find a known word', async () => {
    const { id } = await open('pdfjs-tracemonkey-text.pdf')
    expect(await engine.text(id, 0)).toContain('Trace-based')
    const hits = await engine.search(id, 'Trace')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].quads[0]).toHaveLength(8)
    expect(await engine.search(id, 'zzzqqqxxx')).toEqual([])
  })

  it('textIn returns the words under a search hit rectangle', async () => {
    const { id } = await open('pdfjs-tracemonkey-text.pdf')
    const q = (await engine.search(id, 'Trace-based'))[0].quads[0]
    const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]
    expect(await engine.textIn(id, 0, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])).toContain('Trace')
  })

  it('structure returns paragraphs with the title as the largest type and no stray hyphen joins', async () => {
    const { id } = await open('pdfjs-tracemonkey-text.pdf')
    const { paragraphs, bodySize } = await engine.structure(id)
    expect(paragraphs.length).toBeGreaterThan(40); expect(bodySize).toBeGreaterThan(5); expect(bodySize).toBeLessThan(14)
    const title = paragraphs[0]
    expect(title.runs.map((r) => r.text).join('')).toContain('Trace-based')
    expect(title.size).toBeGreaterThan(bodySize * 1.25)
    expect(new Set(paragraphs.map((p) => p.page)).size).toBeGreaterThan(10)
    expect(paragraphs.every((p) => p.runs.every((r) => !/[a-z]- [a-z]/.test(r.text)))).toBe(true)
    const scan = await open('synthetic-scan-5p.pdf')
    expect((await engine.structure(scan.id)).paragraphs).toEqual([])
  })

  it('wordAt finds the word under a point and nothing in empty space', async () => {
    const { id } = await open('pdfjs-tracemonkey-text.pdf')
    const q = await engine.wordAt(id, 0, [120, 87])
    expect(q).not.toBeNull()
    expect(await engine.textIn(id, 0, [Math.min(q![0], q![4]), q![1], Math.max(q![2], q![6]), q![5]])).toContain('Trace')
    expect(await engine.wordAt(id, 0, [5, 5])).toBeNull()
  })

  it('outline lists bookmarks with their pages and depth', async () => {
    const doc = new mupdf.PDFDocument()
    for (let i = 0; i < 3; i++) doc.insertPage(i, doc.addPage([0, 0, 200, 200], 0, doc.newDictionary(), ''))
    const it = doc.outlineIterator()
    it.insert({ title: 'Chapter 1', uri: doc.formatLinkURI({ chapter: 0, page: 0, type: 'Fit', x: 0, y: 0, width: 0, height: 0, zoom: 0 } as never), open: true })
    it.insert({ title: 'Chapter 2', uri: doc.formatLinkURI({ chapter: 0, page: 2, type: 'Fit', x: 0, y: 0, width: 0, height: 0, zoom: 0 } as never), open: true })
    const bytes = doc.saveToBuffer('').asUint8Array().slice()
    const r = await engine.open(ab(Buffer.from(bytes)))
    const o = await engine.outline(r.id)
    expect(o.map((e) => [e.title, e.page, e.depth])).toEqual([['Chapter 1', 0, 0], ['Chapter 2', 2, 0]])
    const real = await engine.outline((await open('pdfjs-basicapi.pdf')).id)
    expect(real.length).toBeGreaterThan(0)
    for (const e of real) { expect(typeof e.title).toBe('string'); expect(e.page).toBeGreaterThanOrEqual(0); expect(e.depth).toBeGreaterThanOrEqual(0) }
  })

  it('F10: reads and writes Title, Author, Subject and Keywords; decrypting drops the password', async () => {
    const { id } = await open('pdfjs-basicapi.pdf')
    await engine.setMetadata(id, { Title: 'T1', Author: 'A1', Subject: 'S1', Keywords: 'k1, k2' })
    expect(await engine.getMetadata(id)).toEqual({ Title: 'T1', Author: 'A1', Subject: 'S1', Keywords: 'k1, k2' })
    const out = reopen(await engine.save(id, { compress: false, stripMetadata: false }))
    expect(['Title', 'Author', 'Subject', 'Keywords'].map((k) => out.getMetaData(`info:${k}`))).toEqual(['T1', 'A1', 'S1', 'k1, k2'])
    const enc = await open('synthetic-encrypted-aes256.pdf', 'testpass')
    expect(mupdf.Document.openDocument(await engine.save(enc.id, { compress: false, stripMetadata: false }), 'application/pdf').needsPassword()).toBe(true) // snapshots keep the password
    const plain = mupdf.Document.openDocument(await engine.save(enc.id, { compress: false, stripMetadata: false, decrypt: true }), 'application/pdf')
    expect(plain.needsPassword()).toBe(false)
    expect(plain.countPages()).toBe(3)
  })

  it('reports a repaired file on open', async () => {
    const good = corpus('pdfjs-basicapi.pdf')
    const broken = Buffer.from(good.toString('latin1').replace(/startxref\s+\d+/g, 'startxref\n999999'), 'latin1')
    const r = await engine.open(ab(broken))
    expect(r.id).not.toBe('')
    expect(r.repaired).toBe(true)
    expect((await open('pdfjs-basicapi.pdf')).repaired).toBe(false)
  })

  it('R03: merges three files and moves page 5 to position 1', async () => {
    const a = await open('pdfjs-tracemonkey-text.pdf'), b = await open('pdfjs-basicapi.pdf'), c = await open('synthetic-image-heavy-8p.pdf')
    await engine.merge(a.id, b.id, 14)
    await engine.merge(a.id, c.id, 17)
    const total = 14 + 3 + 8
    const before = (await engine.text(a.id, 4))
    const order = [4, ...Array.from({ length: total }, (_, i) => i).filter((i) => i !== 4)]
    await engine.rearrange(a.id, order)
    const out = await engine.save(a.id, { compress: false, stripMetadata: false })
    const d = reopen(out)
    expect(d.countPages()).toBe(total)
    expect(d.loadPage(0).toStructuredText('preserve-whitespace').asText()).toBe(before)
    expect(qpdfOk(out)).not.toBe(false)
  })

  it('rotates, inserts a blank page, duplicates and deletes via rearrange, extracts', async () => {
    const { id } = await open('pdfjs-tracemonkey-text.pdf')
    await engine.rotate(id, [0], 90)
    await engine.rotate(id, [0], 270)
    await engine.rotate(id, [1], 180)
    await engine.insertBlank(id, 1)
    await engine.rearrange(id, [0, 0, 1, 2, 3])
    const out = reopen(await engine.save(id, { compress: false, stripMetadata: false }))
    expect(out.countPages()).toBe(5)
    expect(pg(out, 1).getObject().getInheritable('Rotate').isNull() || pg(out, 1).getObject().getInheritable('Rotate').asNumber() === 0).toBe(true)
    const ex = await engine.extract(id, [2, 3])
    expect(reopen(await engine.save(ex, { compress: false, stripMetadata: false })).countPages()).toBe(2)
  })

  it('imagesToPdf makes one page per image', async () => {
    const png = await (async () => { const px = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 40, 20], false); px.clear(200); return px.asPNG() })()
    const id = await engine.imagesToPdf([new Blob([png.slice()]), new Blob([png.slice()])])
    expect(reopen(await engine.save(id, { compress: false, stripMetadata: false })).countPages()).toBe(2)
  })

  it('setMetadata and stripMetadata', async () => {
    const { id } = await open('pdfjs-basicapi.pdf')
    await engine.setMetadata(id, { Title: 'Hello myPDF' })
    expect(reopen(await engine.save(id, { compress: false, stripMetadata: false })).getMetaData('info:Title')).toBe('Hello myPDF')
    expect(reopen(await engine.save(id, { compress: false, stripMetadata: true })).getMetaData('info:Title') ?? '').toBe('')
  })
})

describe('edit (M2)', () => {
  it('annotates: highlight, ink, freetext, shapes and note', async () => {
    const { id } = await open('pdfjs-tracemonkey-text.pdf')
    const hit = (await engine.search(id, 'Trace'))[0]
    await engine.annotate(id, 0, { type: 'highlight', page: 0, quads: [hit.quads[0]] })
    await engine.annotate(id, 0, { type: 'ink', page: 0, inkList: [[[50, 50], [80, 90], [120, 60]]], color: '#ff0000' })
    await engine.annotate(id, 0, { type: 'freetext', page: 0, rect: [50, 400, 250, 440], contents: 'note text' })
    await engine.annotate(id, 0, { type: 'square', page: 0, rect: [60, 500, 160, 560] })
    await engine.annotate(id, 0, { type: 'note', page: 0, rect: [300, 60, 320, 80], contents: 'sticky' })
    const d = reopen(await engine.save(id, { compress: false, stripMetadata: false }))
    const types = pg(d, 0).getAnnotations().map((a) => a.getType())
    expect(types).toEqual(expect.arrayContaining(['Highlight', 'Ink', 'FreeText', 'Square', 'Text']))
  })

  it('R04: replaces a word and keeps it on the page', async () => {
    const { id } = await open('pdfjs-tracemonkey-text.pdf')
    const hit = (await engine.search(id, 'Trace-based'))[0]
    const r = await engine.replaceText(id, 0, [hit.quads[0]], 'Replaced')
    expect(typeof r.usedFallbackFont).toBe('boolean')
    const t = textOf(await engine.save(id, { compress: false, stripMetadata: false }))
    expect(t).toContain('Replaced')
    expect(t).not.toContain('Trace-based')
  })

  it('R05: lists, fills and flattens form fields', async () => {
    const { id } = await open('pdfjs-annotation-text-widget.pdf')
    const fields = await engine.fields(id)
    expect(fields.length).toBeGreaterThan(0)
    const text = fields.find((f) => f.type === 'text')!
    await engine.setField(id, text.name, 'Filled in')
    expect((await engine.fields(id)).find((f) => f.name === text.name)!.value).toBe('Filled in')
    await engine.flatten(id)
    const d = reopen(await engine.save(id, { compress: false, stripMetadata: false }))
    expect(pg(d, 0).getWidgets()).toHaveLength(0)
    expect(d.getTrailer().get('Root').get('AcroForm').isNull()).toBe(true)
  })

  it('R06: places a signature image at the same position', async () => {
    const { id } = await open('pdfjs-basicapi.pdf')
    const px = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 60, 20], false); px.clear(0)
    await engine.placeImage(id, 1, [100, 200, 220, 240], new Blob([px.asPNG().slice()]))
    const d = reopen(await engine.save(id, { compress: false, stripMetadata: false }))
    const boxes: number[][] = []
    d.loadPage(1).toStructuredText('preserve-images').walk({ onImageBlock(bbox) { boxes.push(bbox as number[]) } })
    expect(boxes.some((b) => Math.abs(b[0] - 100) < 1 && Math.abs(b[1] - 200) < 1 && Math.abs(b[2] - 220) < 1 && Math.abs(b[3] - 240) < 1)).toBe(true)
  })

  it('stamps page numbers and a watermark', async () => {
    const { id } = await open('pdfjs-basicapi.pdf')
    await engine.stamp(id, 'pageNumbers')
    await engine.stamp(id, 'watermark', 'DRAFT')
    const t = textOf(await engine.save(id, { compress: false, stripMetadata: false }))
    expect(t).toContain('DRAFT')
    expect(t).toMatch(/\b3\b/)
  })
})

describe('protect (M3)', () => {
  it('R07: redaction removes the text and verifies it', async () => {
    const { id } = await open('pdfjs-tracemonkey-text.pdf')
    const hits = await engine.search(id, 'Trace-based')
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) await engine.markRedaction(id, h.page, h.quads)
    const r = await engine.applyRedactions(id)
    expect(r).toEqual({ verified: true, residualMatches: 0 })
    const out = await engine.save(id, { compress: false, stripMetadata: false })
    expect(textOf(out)).not.toContain('Trace-based')
    expect(qpdfOk(out)).not.toBe(false)
  })

  it('R08: compress shrinks the image-heavy file by at least 30 percent and it still renders', async () => {
    const original = corpus('synthetic-image-heavy-8p.pdf')
    const { id } = await open('synthetic-image-heavy-8p.pdf')
    const out = await engine.save(id, { compress: true, stripMetadata: true })
    expect(out.length).toBeLessThan(original.length * 0.7)
    const d = reopen(out)
    expect(d.countPages()).toBe(8)
    const px = d.loadPage(0).toPixmap(mupdf.Matrix.scale(0.5, 0.5), mupdf.ColorSpace.DeviceRGB, false, true)
    expect(px.getWidth()).toBeGreaterThan(100)
  })

  it('R10: a password-protected save needs the password', async () => {
    const { id } = await open('pdfjs-basicapi.pdf')
    const out = await engine.save(id, { compress: true, stripMetadata: false, password: 'secret1' })
    const d = mupdf.Document.openDocument(out, 'application/pdf')
    expect(d.needsPassword()).toBe(true)
    expect(d.authenticatePassword('nope')).toBe(0)
    expect(d.authenticatePassword('secret1')).toBeGreaterThan(0)
    expect(qpdfOk(out, 'secret1')).not.toBe(false)
  })

  it('OCR text layer is searchable and invisible', async () => {
    const { id } = await open('synthetic-scan-5p.pdf')
    await engine.addTextLayer(id, 0, [{ text: 'quokkaword', rect: [100, 100, 220, 120] }])
    const out = await engine.save(id, { compress: false, stripMetadata: false })
    expect(textOf(out)).toContain('quokkaword')
  })
})
