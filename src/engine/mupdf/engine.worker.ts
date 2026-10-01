// SPDX-License-Identifier: AGPL-3.0-or-later
// The only file that imports "mupdf" (BUILD-BRIEF section 3). Rect and Quad are MuPDF page space: points, origin top-left, y down.
import * as Comlink from 'comlink'
import type * as M from 'mupdf'
import type { DocId, PageInfo, SearchHit, SaveOptions, AnnotationInput, FormField, Rect, Quad, OcrWord, PdfEngine } from '@/engine/PdfEngine'

// mupdf is imported lazily: its module has a top-level await, and a worker that is still evaluating drops the first messages.
let mupdf: typeof M
const ready = import('mupdf').then((m) => { mupdf = m })
type Doc = M.PDFDocument
const docs = new Map<DocId, Doc>()
let nextId = 1

function register(doc: Doc): DocId {
  const id = String(nextId++)
  docs.set(id, doc)
  return id
}
function D(id: DocId): Doc {
  const d = docs.get(id)
  if (!d) throw new Error(`No document ${id}`)
  return d
}
function pagesOf(doc: Doc): PageInfo[] {
  const out: PageInfo[] = []
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i)
    const b = page.getBounds()
    const rot = page.getObject().getInheritable('Rotate')
    const rotation = ((rot.isNull() ? 0 : rot.asNumber()) % 360 + 360) % 360
    out.push({ index: i, width: b[2] - b[0], height: b[3] - b[1], rotation: rotation as PageInfo['rotation'] })
    page.destroy()
  }
  return out
}
function hex(color: string | undefined, fallback: [number, number, number]): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(color ?? '')
  if (!m) return fallback
  const n = parseInt(m[1], 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}
function rectOfQuads(quads: Quad[]): Rect {
  const xs = quads.flatMap((q) => [q[0], q[2], q[4], q[6]])
  const ys = quads.flatMap((q) => [q[1], q[3], q[5], q[7]])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
const pdfEscape = (t: string) => t.replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\x7e]/g, (c) => (c.charCodeAt(0) < 256 ? '\\' + c.charCodeAt(0).toString(8).padStart(3, '0') : '?'))
const winAnsiOk = (t: string) => [...t].every((c) => c.charCodeAt(0) < 256)

/** Append a content stream to a page, merging fonts and XObjects into its resources. Coordinates in the stream are PDF user space. */
function appendContent(doc: Doc, pageIndex: number, stream: string, fonts: Record<string, M.PDFObject> = {}, xobjects: Record<string, M.PDFObject> = {}) {
  const pageObj = doc.findPage(pageIndex)
  let res = pageObj.get('Resources')
  if (res.isNull()) {
    const inherited = pageObj.getInheritable('Resources')
    res = inherited.isNull() ? doc.newDictionary() : doc.addObject(inherited.resolve())
    pageObj.put('Resources', res)
  }
  for (const [kind, entries] of [['Font', fonts], ['XObject', xobjects]] as const) {
    if (!Object.keys(entries).length) continue
    let sub = res.get(kind)
    if (sub.isNull()) { sub = doc.newDictionary(); res.put(kind, sub) }
    for (const [name, obj] of Object.entries(entries)) sub.put(name, obj)
  }
  const added = doc.addStream(stream, doc.newDictionary())
  const contents = pageObj.get('Contents')
  const arr = doc.newArray()
  if (contents.isArray()) contents.forEach((c) => arr.push(c))
  else if (!contents.isNull()) arr.push(contents)
  arr.push(added)
  pageObj.put('Contents', arr)
}
const baseFont = (doc: Doc, name = 'Helvetica') => doc.addSimpleFont(new mupdf.Font(name), 'Latin')
/** MuPDF page space (y down) to PDF user space for an unrotated page. */
function toPdfY(pageIndex: number, doc: Doc, y: number) {
  const b = doc.loadPage(pageIndex).getBounds()
  return b[3] - y
}

async function downscaleImages(doc: Doc) {
  const seen = new Set<number>()
  for (let i = 0; i < doc.countPages(); i++) {
    const xo = doc.findPage(i).getInheritable('Resources').get('XObject')
    if (xo.isNull() || !xo.isDictionary()) continue
    xo.forEach((ref) => {
      const num = ref.isIndirect() ? ref.asIndirect() : -1
      if (num < 0 || seen.has(num)) return
      seen.add(num)
      const obj = ref
      if (!obj.isStream() || obj.get('Subtype').asName() !== 'Image' || !obj.get('Width').isNumber()) return
      try {
        const img = doc.loadImage(ref)
        if (img.getImageMask() || img.getMask()) return
        const w = img.getWidth(), h = img.getHeight()
        const factor = Math.min(1, 1000 / Math.max(w, h))
        const nw = Math.max(1, Math.round(w * factor)), nh = Math.max(1, Math.round(h * factor))
        const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, nw, nh], false)
        out.clear(255)
        const dev = new mupdf.DrawDevice(mupdf.Matrix.identity, out)
        dev.fillImage(img, [nw, 0, 0, nh, 0, 0], 1)
        dev.close()
        const jpeg = out.asJPEG(55)
        if (jpeg.length >= obj.readRawStream().asUint8Array().length) return
        obj.writeRawStream(jpeg)
        obj.put('Filter', doc.newName('DCTDecode'))
        obj.delete('DecodeParms')
        obj.put('Width', nw); obj.put('Height', nh)
        obj.put('ColorSpace', doc.newName('DeviceRGB'))
        obj.put('BitsPerComponent', 8)
        obj.delete('SMask'); obj.delete('Decode')
      } catch { /* leave this image untouched */ }
    })
  }
}

const ANNOT = {
  highlight: 'Highlight', underline: 'Underline', strikeout: 'StrikeOut', squiggly: 'Squiggly',
  freetext: 'FreeText', ink: 'Ink', stamp: 'Stamp', square: 'Square', circle: 'Circle', note: 'Text',
}

const raw: PdfEngine = {
  async open(bytes, password) {
    const base = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
    const doc = base.asPDF()
    if (!doc) throw new Error('Not a PDF')
    if (doc.needsPassword()) {
      if (!password) return { id: '', pages: [], needsPassword: true }
      if (!doc.authenticatePassword(password)) return { id: '', pages: [], needsPassword: true }
    }
    return { id: register(doc), pages: pagesOf(doc), needsPassword: false }
  },

  async render(id, page, scale) {
    const p = D(id).loadPage(page)
    const pixmap = p.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
    const width = pixmap.getWidth(), height = pixmap.getHeight()
    const n = pixmap.getNumberOfComponents(), stride = pixmap.getStride(), src = pixmap.getPixels()
    const step = n + (pixmap.getAlpha() ? 1 : 0)
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = y * stride + x * step, di = (y * width + x) * 4
        rgba[di] = src[si]; rgba[di + 1] = src[si + 1]; rgba[di + 2] = src[si + 2]; rgba[di + 3] = 255
      }
    }
    const bitmap = await createImageBitmap(new ImageData(rgba, width, height))
    pixmap.destroy(); p.destroy()
    return Comlink.transfer(bitmap, [bitmap])
  },

  async text(id, page) {
    const p = D(id).loadPage(page)
    const t = p.toStructuredText('preserve-whitespace').asText()
    p.destroy()
    return t
  },

  async pages(id) { return pagesOf(D(id)) },

  async textIn(id, page, rect) {
    const p = D(id).loadPage(page)
    const t = p.toStructuredText('preserve-whitespace').copy([rect[0], rect[1]], [rect[2], rect[3]]).trim()
    p.destroy()
    return t
  },

  async search(id, needle) {
    const doc = D(id)
    const hits: SearchHit[] = []
    if (!needle.trim()) return hits
    for (let i = 0; i < doc.countPages(); i++) {
      const p = doc.loadPage(i)
      const found = p.search(needle, {})
      p.destroy()
      if (found.length) hits.push({ page: i, quads: found.flat() as Quad[] })
    }
    return hits
  },

  async rearrange(id, order) { D(id).rearrangePages(order) },

  async rotate(id, pages, degrees) {
    const doc = D(id)
    for (const i of pages) {
      const obj = doc.findPage(i)
      const cur = obj.getInheritable('Rotate')
      obj.put('Rotate', (((cur.isNull() ? 0 : cur.asNumber()) + degrees) % 360 + 360) % 360)
    }
  },

  async insertBlank(id, at) {
    const doc = D(id)
    const n = doc.countPages()
    let box: Rect = [0, 0, 595, 842]
    if (n > 0) { const b = doc.loadPage(Math.min(Math.max(at - 1, 0), n - 1)).getBounds(); box = [0, 0, b[2] - b[0], b[3] - b[1]] }
    doc.insertPage(at, doc.addPage(box, 0, doc.newDictionary(), ''))
  },

  async merge(target, source, at) {
    const t = D(target), s = D(source)
    const n = s.countPages()
    for (let i = 0; i < n; i++) t.graftPage(at + i, s, i)
  },

  async extract(id, pages) {
    const src = D(id), out = new mupdf.PDFDocument()
    for (const p of pages) out.graftPage(out.countPages(), src, p)
    return register(out)
  },

  async imagesToPdf(images) {
    const doc = new mupdf.PDFDocument()
    for (const blob of images) {
      const img = new mupdf.Image(new Uint8Array(await blob.arrayBuffer()))
      const w = img.getWidth() * 0.75, h = img.getHeight() * 0.75
      const scale = Math.min(1, 595 / w, 842 / h)
      const W = Math.round(w * scale), H = Math.round(h * scale)
      const ref = doc.addImage(img)
      const res = doc.newDictionary(); const xo = doc.newDictionary(); xo.put('Im0', ref); res.put('XObject', xo)
      doc.insertPage(doc.countPages(), doc.addPage([0, 0, W, H], 0, res, `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`))
    }
    return register(doc)
  },

  async annotate(id, pageIndex, a: AnnotationInput) {
    const page = D(id).loadPage(pageIndex)
    const annot = page.createAnnotation((ANNOT as Record<string, M.PDFAnnotationType>)[a.type])
    const color = hex(a.color, a.type === 'highlight' ? [1, 0.92, 0.2] : [0.1, 0.1, 0.1])
    annot.setColor(color)
    if (a.opacity !== undefined) annot.setOpacity(a.opacity)
    if (a.quads?.length) annot.setQuadPoints(a.quads)
    if (a.inkList) annot.setInkList(a.inkList)
    if (a.rect) annot.setRect(a.rect)
    if (a.type === 'freetext') annot.setDefaultAppearance('Helv', 12, [0, 0, 0])
    if (a.contents !== undefined) annot.setContents(a.contents)
    if (a.type === 'square' || a.type === 'circle') annot.setBorderWidth(1.5)
    annot.update()
    page.update()
    return String(annot.getObject().asIndirect())
  },

  async replaceText(id, pageIndex, span, text) {
    const doc = D(id)
    const page = doc.loadPage(pageIndex)
    const r = rectOfQuads(span)
    // Font and size of the first glyph in the span, for baseline, size and substitution.
    let fontName = '', size = 11, baseline = r[3]
    let isBold = false, isItalic = false, isMono = false, isSerif = false
    page.toStructuredText('preserve-whitespace').walk({
      onChar(_c, origin, font, sz, quad) {
        if (fontName || quad[0] < r[0] - 1 || quad[0] > r[2] || quad[1] < r[1] - 1 || quad[5] > r[3] + 1) return
        fontName = font.getName(); size = sz; baseline = origin[1]
        isBold = font.isBold(); isItalic = font.isItalic(); isMono = font.isMono(); isSerif = font.isSerif()
      },
    })
    const annot = page.createAnnotation('Redact')
    annot.setQuadPoints(span)
    annot.update()
    page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE)
    const family = isMono ? 'Courier' : isSerif ? 'Times' : 'Helvetica'
    const face = isMono ? `Courier${isBold ? '-Bold' : ''}${isItalic ? '-Oblique' : ''}`
      : isSerif ? `Times-${isBold && isItalic ? 'BoldItalic' : isBold ? 'Bold' : isItalic ? 'Italic' : 'Roman'}`
      : `Helvetica${isBold || isItalic ? '-' : ''}${isBold ? 'Bold' : ''}${isItalic ? 'Oblique' : ''}`
    const original = new RegExp(`^(?:[A-Z]{6}\\+)?(${family}|Arial|ArialMT)`, 'i').test(fontName)
    const stream = `q 0 g BT /FRepl ${size.toFixed(2)} Tf ${r[0].toFixed(2)} ${toPdfY(pageIndex, doc, baseline).toFixed(2)} Td (${pdfEscape(text)}) Tj ET Q`
    appendContent(doc, pageIndex, stream, { FRepl: baseFont(doc, face) })
    page.update()
    return { usedFallbackFont: !original || !winAnsiOk(text) }
  },

  async fields(id) {
    const doc = D(id), out: FormField[] = []
    for (let i = 0; i < doc.countPages(); i++) {
      for (const w of doc.loadPage(i).getWidgets()) {
        const type = w.isText() ? 'text' : w.isCheckbox() ? 'checkbox' : w.isRadioButton() ? 'radio' : w.isChoice() ? 'choice' : 'signature'
        const raw = w.getValue()
        out.push({ name: w.getName() || w.getLabel(), type, value: type === 'checkbox' || type === 'radio' ? raw !== '' && raw !== 'Off' : raw,
          rect: w.getRect() as Rect, page: i, options: w.isChoice() ? w.getOptions() : undefined })
      }
    }
    return out
  },

  async setField(id, name, value) {
    const doc = D(id)
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i)
      for (const w of page.getWidgets()) {
        if ((w.getName() || w.getLabel()) !== name) continue
        if (w.isText()) w.setTextValue(String(value))
        else if (w.isChoice()) w.setChoiceValue(String(value))
        else if (w.isCheckbox() || w.isRadioButton()) { const on = w.getValue() !== '' && w.getValue() !== 'Off'; if (on !== Boolean(value)) w.toggle() }
        w.update(); page.update()
        return
      }
    }
    throw new Error(`No field ${name}`)
  },

  async flatten(id) {
    const doc = D(id)
    doc.bake(false, true)
    const root = doc.getTrailer().get('Root')
    root.delete('AcroForm')
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i)
      for (const w of page.getWidgets()) page.deleteAnnotation(w)
      page.update()
    }
  },

  async placeImage(id, pageIndex, rect, png) {
    const doc = D(id)
    const ref = doc.addImage(new mupdf.Image(new Uint8Array(await png.arrayBuffer())))
    const [x0, y0, x1, y1] = rect
    const w = x1 - x0, h = y1 - y0, y = toPdfY(pageIndex, doc, y1)
    appendContent(doc, pageIndex, `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x0.toFixed(2)} ${y.toFixed(2)} cm /ImPlaced Do Q`, {}, { ImPlaced: ref })
  },

  async markRedaction(id, pageIndex, quads) {
    const page = D(id).loadPage(pageIndex)
    const annot = page.createAnnotation('Redact')
    annot.setQuadPoints(quads)
    annot.update(); page.update()
    return String(annot.getObject().asIndirect())
  },

  async applyRedactions(id) {
    const doc = D(id)
    const regions: { page: number; rect: Rect }[] = []
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i)
      const marks = page.getAnnotations().filter((a) => a.getType() === 'Redact')
      if (!marks.length) continue
      for (const m of marks) {
        const q = m.hasQuadPoints() ? m.getQuadPoints() : []
        regions.push({ page: i, rect: q.length ? rectOfQuads(q as Quad[]) : (m.getRect() as Rect) })
      }
      page.applyRedactions(true, mupdf.PDFPage.REDACT_IMAGE_PIXELS, mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED, mupdf.PDFPage.REDACT_TEXT_REMOVE)
      page.update()
    }
    // Verify on the document as it now stands: re-extract the text under every marked region.
    let residualMatches = 0
    for (const { page: i, rect } of regions) {
      const st = doc.loadPage(i).toStructuredText('preserve-whitespace')
      const inset = 1
      const got = st.copy([rect[0] + inset, rect[1] + inset], [rect[2] - inset, rect[3] - inset]).trim()
      if (got.length) residualMatches++
    }
    return { verified: residualMatches === 0, residualMatches }
  },

  async stamp(id, kind, text) {
    const doc = D(id)
    const font = baseFont(doc)
    for (let i = 0; i < doc.countPages(); i++) {
      const b = doc.loadPage(i).getBounds()
      const w = b[2] - b[0], h = b[3] - b[1]
      if (kind === 'pageNumbers') {
        const label = String(i + 1)
        appendContent(doc, i, `q 0.25 g BT /FStamp 10 Tf ${(w / 2 - label.length * 2.8).toFixed(2)} 20 Td (${label}) Tj ET Q`, { FStamp: font })
      } else {
        const t = (text || 'DRAFT').slice(0, 40)
        const size = Math.min(80, (w * 0.9) / Math.max(1, t.length * 0.62))
        const c = Math.SQRT1_2
        appendContent(doc, i, `q 0.8 g BT /FStamp ${size.toFixed(1)} Tf ${c.toFixed(4)} ${c.toFixed(4)} ${(-c).toFixed(4)} ${c.toFixed(4)} ${(w * 0.12).toFixed(1)} ${(h * 0.3).toFixed(1)} Tm (${pdfEscape(t)}) Tj ET Q`, { FStamp: font })
      }
    }
  },

  async addTextLayer(id, pageIndex, words: OcrWord[]) {
    const doc = D(id)
    const font = baseFont(doc)
    const ops = words.filter((w) => w.text.trim()).map((w) => {
      const [x0, , x1, y1] = w.rect
      const size = Math.max(4, w.rect[3] - w.rect[1])
      const natural = w.text.length * size * 0.5 || 1
      const tz = Math.max(10, Math.min(400, ((x1 - x0) / natural) * 100))
      return `BT 3 Tr /FOcr ${size.toFixed(1)} Tf ${tz.toFixed(0)} Tz ${x0.toFixed(2)} ${toPdfY(pageIndex, doc, y1).toFixed(2)} Td (${pdfEscape(w.text)}) Tj ET`
    })
    appendContent(doc, pageIndex, `q ${ops.join('\n')} Q`, { FOcr: font })
  },

  async save(id, opts: SaveOptions) {
    const doc = D(id)
    if (opts.stripMetadata) {
      const trailer = doc.getTrailer()
      trailer.delete('Info')
      trailer.get('Root').delete('Metadata')
    }
    if (opts.compress) await downscaleImages(doc)
    const parts: string[] = []
    if (opts.compress) parts.push('garbage=compact', 'compress')
    if (opts.password) parts.push('encrypt=aes-256', `user-password=${opts.password}`, `owner-password=${opts.password}`)
    return doc.saveToBuffer(parts.join(',')).asUint8Array().slice()
  },

  async setMetadata(id, meta) {
    const doc = D(id)
    for (const [k, v] of Object.entries(meta)) doc.setMetaData(k.includes(':') ? k : `info:${k}`, v)
  },

  async close(id) { docs.get(id)?.destroy(); docs.delete(id) },
}

// Every call waits for the MuPDF module, so messages that arrive during start-up are queued, not lost.
export const engine = Object.fromEntries(
  Object.entries(raw).map(([name, fn]) => [name, async (...args: unknown[]) => { await ready; return (fn as (...a: unknown[]) => unknown)(...args) }]),
) as unknown as PdfEngine

Comlink.expose(engine)
