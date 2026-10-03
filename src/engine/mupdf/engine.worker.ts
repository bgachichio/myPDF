// SPDX-License-Identifier: AGPL-3.0-or-later
// The only file that imports "mupdf" (BUILD-BRIEF section 3). Rect and Quad are MuPDF page space: points, origin top-left, y down.
import * as Comlink from 'comlink'
import type * as M from 'mupdf'
import type { DocId, OutlineEntry, WordPara, PageInfo, SearchHit, SaveOptions, AnnotationInput, FormField, Rect, Quad, OcrWord, PdfEngine, TextStyle, Margins, StampPosition, SignPrepare } from '@/engine/PdfEngine'

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
function appendContent(doc: Doc, pageIndex: number, stream: string, fonts: Record<string, M.PDFObject> = {}, xobjects: Record<string, M.PDFObject> = {}, gstates: Record<string, M.PDFObject> = {}) {
  const pageObj = doc.findPage(pageIndex)
  let res = pageObj.get('Resources')
  if (res.isNull()) {
    const inherited = pageObj.getInheritable('Resources')
    res = inherited.isNull() ? doc.newDictionary() : doc.addObject(inherited.resolve())
    pageObj.put('Resources', res)
  }
  for (const [kind, entries] of [['Font', fonts], ['XObject', xobjects], ['ExtGState', gstates]] as const) {
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
/** PDF user space to page space for one page (rotation, crop box and the y flip included). */
function pageTransform(doc: Doc, i: number): M.Matrix {
  const p = doc.loadPage(i); const m = p.getTransform(); p.destroy(); return m
}
/** A matrix that draws a unit square, or text, upright and at (x, y) of the page as seen on screen (y down). `w` and `h` scale it. */
function onPage(doc: Doc, i: number, x: number, y: number, w = 1, h = 1): M.Matrix {
  return mupdf.Matrix.concat([w, 0, 0, -h, x, y], mupdf.Matrix.invert(pageTransform(doc, i)))
}
const mtx = (m: M.Matrix) => m.map((v) => (+v.toFixed(4)).toString()).join(' ')
const rgb = (hexColor: string | undefined, fallback: [number, number, number] = [0, 0, 0]) => hex(hexColor, fallback).map((v) => v.toFixed(3)).join(' ')

/** Width of a line of text in points, from the font's own advances. */
function measure(font: M.Font, text: string, size: number): number {
  let w = 0
  for (const ch of text) { try { w += font.advanceGlyph(font.encodeCharacter(ch.codePointAt(0)!)) * size } catch { w += size * 0.5 } }
  return w
}

const FACES: Record<TextStyle['font'], [string, string, string, string]> = {
  sans: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  serif: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  mono: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
}
const faceOf = (s: Pick<TextStyle, 'font' | 'bold' | 'italic'>) => FACES[s.font][(s.bold ? 1 : 0) + (s.italic ? 2 : 0) === 3 ? 3 : s.italic ? 2 : s.bold ? 1 : 0]

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
    return { id: register(doc), pages: pagesOf(doc), needsPassword: false, repaired: doc.wasRepaired() }
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

  async structure(id) {
    const doc = D(id), paragraphs: WordPara[] = []
    const sizes = new Map<number, number>()
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i)
      let cur: WordPara | null = null
      let lineStart = false
      page.toStructuredText('preserve-whitespace').walk({
        beginTextBlock() { cur = { page: i, size: 0, runs: [] } },
        beginLine() { lineStart = true },
        onChar(c, _origin, font, size) {
          if (!cur) return
          const bold = font.isBold() || /bold|black|heavy/i.test(font.getName()), italic = font.isItalic() || /italic|oblique/i.test(font.getName())
          const last = cur.runs[cur.runs.length - 1]
          let ch = c
          if (lineStart) {
            lineStart = false
            if (last) {
              // a hyphen at the end of the previous line joins the word; otherwise a line break is a space
              if (/[a-z]-$/.test(last.text) && /[a-z]/.test(c)) last.text = last.text.slice(0, -1)
              else if (!/\s$/.test(last.text)) ch = ' ' + c
            }
          }
          if (last && last.bold === bold && last.italic === italic) last.text += ch
          else cur.runs.push({ text: ch, bold, italic })
          if (c.trim()) { cur.size = Math.max(cur.size, size); const k = Math.round(size * 2) / 2; sizes.set(k, (sizes.get(k) ?? 0) + 1) }
        },
        endTextBlock() {
          if (cur && cur.runs.some((r) => r.text.trim())) paragraphs.push(cur)
          cur = null
        },
      })
      page.destroy()
    }
    let bodySize = 11, most = 0
    for (const [k, n] of sizes) if (n > most) { most = n; bodySize = k }
    return { paragraphs, bodySize }
  },

  async outline(id) {
    const doc = D(id), out: OutlineEntry[] = []
    interface Item { title?: string; uri?: string; page?: number; down?: Item[] }
    const walk = (items: Item[] | null | undefined, depth: number) => {
      for (const it of items ?? []) {
        let page = it.page ?? -1
        if (page < 0 && it.uri) { try { page = doc.resolveLink(it.uri) } catch { page = -1 } }
        if (page >= 0) out.push({ title: (it.title ?? '').trim() || `Page ${page + 1}`, page, depth })
        walk(it.down, depth + 1)
      }
    }
    walk(doc.loadOutline(), 0)
    return out
  },

  async wordAt(id, pageIndex, point) {
    const p = D(id).loadPage(pageIndex)
    let q: Quad | null = null
    try { q = p.toStructuredText('preserve-whitespace').snap(point, point, 'words') as Quad | null } catch { q = null }
    p.destroy()
    if (!q || q.length < 8) return null
    const b = [Math.min(q[0], q[2], q[4], q[6]), Math.min(q[1], q[3], q[5], q[7]), Math.max(q[0], q[2], q[4], q[6]), Math.max(q[1], q[3], q[5], q[7])]
    const pad = 3 // snap() returns the nearest word even for empty space, so the point must actually sit on it
    return point[0] >= b[0] - pad && point[0] <= b[2] + pad && point[1] >= b[1] - pad && point[1] <= b[3] + pad && b[2] > b[0] ? q : null
  },

  async textIn(id, page, rect) {
    const p = D(id).loadPage(page)
    // copy() selects in reading order between two points; for a one-line drag the mid-line is the reliable path through the glyphs.
    const oneLine = rect[3] - rect[1] < 30, midY = (rect[1] + rect[3]) / 2
    const t = p.toStructuredText('preserve-whitespace').copy([rect[0], oneLine ? midY : rect[1]], [rect[2], oneLine ? midY : rect[3]]).trim()
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
    if (a.type === 'square' || a.type === 'circle') annot.setBorderWidth(a.borderWidth ?? 1.5)
    if (a.type === 'ink') annot.setBorderWidth(a.borderWidth ?? 2)
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
    const stream = `q 0 g BT /FRepl ${size.toFixed(2)} Tf ${mtx(onPage(doc, pageIndex, r[0], baseline))} Tm (${pdfEscape(text)}) Tj ET Q`
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

  async flatten(id, annotations = false) {
    const doc = D(id)
    doc.bake(annotations, true)
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
    appendContent(doc, pageIndex, `q ${mtx(onPage(doc, pageIndex, x0, y1, x1 - x0, y1 - y0))} cm /ImPlaced Do Q`, {}, { ImPlaced: ref })
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
    // Verify on the document as it now stands: no glyph may remain whose box overlaps the inside of a marked region.
    // (Reading text back with a selection would also pick up the words beside the region, which are meant to stay.)
    let residualMatches = 0
    const byPage = new Map<number, Rect[]>()
    for (const { page: i, rect } of regions) byPage.set(i, [...(byPage.get(i) ?? []), rect])
    for (const [i, rects] of byPage) {
      const glyphs: Rect[] = []
      const p = doc.loadPage(i)
      p.toStructuredText('preserve-whitespace').walk({ onChar(c, _o, _f, _s, q) {
        if (c.trim()) glyphs.push([Math.min(q[0], q[2], q[4], q[6]), Math.min(q[1], q[3], q[5], q[7]), Math.max(q[0], q[2], q[4], q[6]), Math.max(q[1], q[3], q[5], q[7])])
      } })
      p.destroy()
      const inset = 1
      for (const r of rects) if (glyphs.some((g) => g[0] < r[2] - inset && g[2] > r[0] + inset && g[1] < r[3] - inset && g[3] > r[1] + inset)) residualMatches++
    }
    return { verified: residualMatches === 0, residualMatches }
  },

  async stamp(id, kind, text, opts = {}) {
    const doc = D(id)
    const font = baseFont(doc), metric = new mupdf.Font('Helvetica')
    const n = doc.countPages()
    const gs = doc.addObject({ Type: 'ExtGState', ca: opts.opacity ?? 1, CA: opts.opacity ?? 1 })
    for (let i = 0; i < n; i++) {
      const b = doc.loadPage(i).getBounds()
      const w = b[2] - b[0], h = b[3] - b[1]
      if (kind === 'pageNumbers') {
        const first = opts.start ?? 1, num = first + i, total = first + n - 1
        const label = opts.format === 'n-of-total' ? `${num} of ${total}` : opts.format === 'page-n' ? `Page ${num}` : String(num)
        const size = opts.size ?? 10, tw = measure(metric, label, size)
        const pos: StampPosition = opts.position ?? 'bottom-center'
        const x = pos.endsWith('left') ? 28 : pos.endsWith('right') ? w - 28 - tw : (w - tw) / 2
        const y = pos.startsWith('top') ? 28 + size : h - 22
        appendContent(doc, i, `q /GSn gs ${rgb(opts.color, [0.25, 0.25, 0.25])} rg BT /FStamp ${size} Tf ${mtx(onPage(doc, i, x, y))} Tm (${pdfEscape(label)}) Tj ET Q`, { FStamp: font }, {}, { GSn: gs })
      } else {
        const t = (text || 'DRAFT').slice(0, 40)
        const size = Math.min(80, (w * 0.9) / Math.max(1, t.length * 0.62))
        const tw = measure(metric, t, size), c = Math.SQRT1_2
        // Centred on the page and tilted 45 degrees, rising to the right as seen on screen (page space, y down).
        const onScreen: M.Matrix = [c, -c, -c, -c, w / 2 - (tw / 2) * c - 0.35 * size * c, h / 2 + (tw / 2) * c - 0.35 * size * c]
        const tm = mupdf.Matrix.concat(onScreen, mupdf.Matrix.invert(pageTransform(doc, i)))
        appendContent(doc, i, `q /GSn gs ${rgb(opts.color, [0.8, 0.8, 0.8])} rg BT /FStamp ${size.toFixed(1)} Tf ${mtx(tm)} Tm (${pdfEscape(t)}) Tj ET Q`, { FStamp: font }, {}, { GSn: gs })
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
      return `BT 3 Tr /FOcr ${size.toFixed(1)} Tf ${tz.toFixed(0)} Tz ${mtx(onPage(doc, pageIndex, x0, y1))} Tm (${pdfEscape(w.text)}) Tj ET`
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
    // MuPDF keeps an opened file's old encryption unless told otherwise, so an export without a password decrypts (F10).
    if (opts.restrict && opts.ownerPassword) {
      // Bits of the PDF permission word: 4 print, 8 edit, 16 copy, 32 annotate, 256 forms, 512 accessibility, 1024 assemble, 2048 print in high quality.
      const allowed = (opts.restrict.print ? 4 | 2048 : 0) | (opts.restrict.edit ? 8 | 32 | 256 | 1024 : 0) | (opts.restrict.copy ? 16 : 0) | 512
      parts.push('encrypt=aes-256', `user-password=${opts.password ?? ''}`, `owner-password=${opts.ownerPassword}`, `permissions=${(0xfffff0c0 | allowed) | 0}`)
    } else if (opts.password) parts.push('encrypt=aes-256', `user-password=${opts.password}`, `owner-password=${opts.ownerPassword || opts.password}`)
    else if (opts.decrypt) parts.push('encrypt=none')
    return doc.saveToBuffer(parts.join(',')).asUint8Array().slice()
  },

  async getMetadata(id) {
    const doc = D(id), out: Record<string, string> = {}
    for (const k of ['Title', 'Author', 'Subject', 'Keywords']) out[k] = doc.getMetaData(`info:${k}`) ?? ''
    return out
  },

  async setMetadata(id, meta) {
    const doc = D(id)
    for (const [k, v] of Object.entries(meta)) doc.setMetaData(k.includes(':') ? k : `info:${k}`, v)
  },

  async addText(id, pageIndex, rect, text, style) {
    const doc = D(id)
    const face = faceOf(style), font = new mupdf.Font(face)
    const size = Math.max(4, Math.min(200, style.size)), lead = size * 1.2, maxW = Math.max(rect[2] - rect[0], size)
    let replaced = false
    const clean = [...text].map((c) => (c.charCodeAt(0) < 256 && (c.charCodeAt(0) >= 32 || c === '\n') ? c : c === '\t' ? ' ' : (replaced = true, '?'))).join('')
    const lines: string[] = []
    for (const para of clean.split('\n')) {
      let cur = ''
      for (const word of para.split(' ')) {
        const tryLine = cur ? `${cur} ${word}` : word
        if (cur && measure(font, tryLine, size) > maxW) { lines.push(cur); cur = word } else cur = tryLine
      }
      lines.push(cur)
    }
    const ops = lines.map((l, k) => `BT /FTxt ${size} Tf ${mtx(onPage(doc, pageIndex, rect[0], rect[1] + size * 0.95 + k * lead))} Tm (${pdfEscape(l)}) Tj ET`)
    appendContent(doc, pageIndex, `q ${rgb(style.color)} rg\n${ops.join('\n')}\nQ`, { FTxt: doc.addSimpleFont(font, 'Latin') })
    return !replaced
  },

  async eraseInk(id, pageIndex, point, radius) {
    const page = D(id).loadPage(pageIndex)
    let removed = 0
    for (const a of page.getAnnotations()) {
      if (a.getType() !== 'Ink') continue
      const reach = radius + a.getBorderWidth() / 2
      const hit = a.getInkList().some((stroke) => stroke.some((pt, k) => {
        const [x0, y0] = pt, [x1, y1] = stroke[k + 1] ?? pt
        const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy
        const t = len2 ? Math.max(0, Math.min(1, ((point[0] - x0) * dx + (point[1] - y0) * dy) / len2)) : 0
        return Math.hypot(point[0] - (x0 + t * dx), point[1] - (y0 + t * dy)) <= reach
      }))
      if (hit) { page.deleteAnnotation(a); removed++ }
    }
    if (removed) page.update()
    return removed
  },

  async crop(id, pages, m: Margins) {
    const doc = D(id)
    for (const i of pages) {
      const t = pageTransform(doc, i), p = doc.loadPage(i), b = p.getBounds(); p.destroy()
      const W = b[2] - b[0], H = b[3] - b[1]
      if (m.left + m.right >= W - 10 || m.top + m.bottom >= H - 10) throw new Error('The margins leave no page')
      // The trim is drawn on screen, so map the kept rectangle back to the page's own coordinates.
      const box = mupdf.Rect.transform([m.left, m.top, W - m.right, H - m.bottom], mupdf.Matrix.invert(t))
      doc.findPage(i).put('CropBox', [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])].map((v) => +v.toFixed(3)))
    }
  },

  async saveForSigning(id, o: SignPrepare) {
    const doc = D(id)
    const sig = doc.addObject({
      Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached',
      ByteRange: [0, 1111111111, 2222222222, 3333333333],
      Name: `(${o.signer})`, M: `(${o.date})`,
    })
    if (o.reason) sig.put('Reason', `(${o.reason})`)
    if (o.location) sig.put('Location', `(${o.location})`)
    if (o.contact) sig.put('ContactInfo', `(${o.contact})`)
    sig.put('Contents', doc.newByteString(new Uint8Array(o.reserve).fill(0xab)))
    const pageObj = doc.findPage(o.page)
    const pageNum = pageObj.asIndirect()
    const t = pageTransform(doc, o.page)
    const user = o.rect ? mupdf.Rect.transform(o.rect, mupdf.Matrix.invert(t)) : [0, 0, 0, 0]
    const rectU: Rect = [Math.min(user[0], user[2]), Math.min(user[1], user[3]), Math.max(user[0], user[2]), Math.max(user[1], user[3])]
    const widget = doc.addObject({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: '(Signature1)', F: 132, Rect: rectU, V: sig })
    if (pageNum > 0) widget.put('P', doc.newIndirect(pageNum))
    if (o.rect) {
      const w = rectU[2] - rectU[0], h = rectU[3] - rectU[1], size = Math.max(5, Math.min(9, h / 5))
      const font = new mupdf.Font('Helvetica')
      const fit = (str: string) => { let r = str; while (r.length > 1 && measure(font, r, size) > w - 8) r = r.slice(0, -2); return r }
      const lines = [`Digitally signed by ${o.signer}`, `Date: ${o.date.replace(/^D:(\d{4})(\d{2})(\d{2}).*$/, '$3-$2-$1')}`, o.reason && `Reason: ${o.reason}`, o.location && `Location: ${o.location}`].filter(Boolean) as string[]
      const ops = lines.slice(0, Math.max(1, Math.floor((h - 6) / (size * 1.25)))).map((l, k) => `BT /Helv ${size} Tf 4 ${(h - 4 - size - k * size * 1.25).toFixed(2)} Td (${pdfEscape(fit(l))}) Tj ET`)
      const ap = doc.addStream(`q 0.95 0.98 0.96 rg 0 0 ${w.toFixed(2)} ${h.toFixed(2)} re f 0.14 0.45 0.32 RG 0.75 w 0.4 0.4 ${(w - 0.8).toFixed(2)} ${(h - 0.8).toFixed(2)} re S 0.1 g\n${ops.join('\n')}\nQ`,
        { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, +w.toFixed(2), +h.toFixed(2)], Resources: { Font: { Helv: baseFont(doc) } } })
      widget.put('AP', { N: ap })
    }
    // Attach the widget to the page and to the form, and declare that the file holds signatures.
    let annots = pageObj.get('Annots')
    if (annots.isNull()) { annots = doc.newArray(); pageObj.put('Annots', annots) }
    annots.push(widget)
    const root = doc.getTrailer().get('Root')
    let form = root.get('AcroForm')
    if (form.isNull()) { form = doc.newDictionary(); root.put('AcroForm', form) }
    let fields = form.get('Fields')
    if (fields.isNull()) { fields = doc.newArray(); form.put('Fields', fields) }
    fields.push(widget)
    form.put('SigFlags', 3)
    if (o.stripMetadata) { const tr = doc.getTrailer(); tr.delete('Info'); root.delete('Metadata') }
    const parts = o.compress ? ['garbage=compact', 'compress'] : []
    if (o.compress) await downscaleImages(doc)
    return doc.saveToBuffer(parts.join(',')).asUint8Array().slice()
  },

  async addLink(id, pageIndex, rect, target) {
    const doc = D(id), page = doc.loadPage(pageIndex)
    const uri = 'uri' in target
      ? target.uri.trim()
      : doc.formatLinkURI({ chapter: 0, page: target.page, type: 'Fit', x: 0, y: 0, width: 0, height: 0, zoom: 0 })
    if (!uri) throw new Error('A link needs an address')
    page.createLink(rect, uri)
    page.update()
  },

  async close(id) { docs.get(id)?.destroy(); docs.delete(id) },
}

// Every call waits for the MuPDF module, so messages that arrive during start-up are queued, not lost.
export const engine = Object.fromEntries(
  Object.entries(raw).map(([name, fn]) => [name, async (...args: unknown[]) => { await ready; return (fn as (...a: unknown[]) => unknown)(...args) }]),
) as unknown as PdfEngine

Comlink.expose(engine)
