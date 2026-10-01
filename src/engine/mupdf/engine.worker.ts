// SPDX-License-Identifier: AGPL-3.0-or-later
import * as Comlink from 'comlink'
import type { DocId, PageInfo, SearchHit, SaveOptions, AnnotationInput, FormField, Rect, Quad } from '@/engine/PdfEngine'

// Dynamic import to avoid blocking the worker initialisation
let mupdf: typeof import('mupdf') | null = null
async function getMupdf() {
  if (!mupdf) mupdf = await import('mupdf')
  return mupdf
}

interface DocEntry { doc: InstanceType<(typeof import('mupdf'))['PDFDocument']> }
const docs = new Map<DocId, DocEntry>()
let nextId = 1

function stub(name: string): never {
  throw new Error(`PdfEngine.${name} not implemented in M0`)
}

const engine = {
  async open(bytes: ArrayBuffer, password?: string) {
    const mu = await getMupdf()
    const doc = mu.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf') as InstanceType<(typeof import('mupdf'))['PDFDocument']>
    const needsPassword = doc.needsPassword()
    if (needsPassword) {
      if (!password) return { id: '', pages: [], needsPassword: true }
      doc.authenticatePassword(password)
    }
    const id: DocId = String(nextId++)
    docs.set(id, { doc })
    const count = doc.countPages()
    const pages: PageInfo[] = []
    for (let i = 0; i < count; i++) {
      const page = doc.loadPage(i)
      const bounds = page.getBounds()
      pages.push({ index: i, width: bounds[2] - bounds[0], height: bounds[3] - bounds[1], rotation: 0 })
      page.destroy()
    }
    return { id, pages, needsPassword: false }
  },

  async render(id: DocId, page: number, scale: number) {
    const mu = await getMupdf()
    const entry = docs.get(id)
    if (!entry) throw new Error(`No document ${id}`)
    const p = entry.doc.loadPage(page)
    const matrix = mu.Matrix.scale(scale, scale)
    const pixmap = p.toPixmap(matrix, mu.ColorSpace.DeviceRGB, false, true)
    const width = pixmap.getWidth()
    const height = pixmap.getHeight()
    const n = pixmap.getNumberOfComponents()
    const stride = pixmap.getStride()
    const src = pixmap.getPixels()
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = y * stride + x * (n + (pixmap.getAlpha() ? 1 : 0))
        const di = (y * width + x) * 4
        rgba[di] = src[si]; rgba[di + 1] = src[si + 1]; rgba[di + 2] = src[si + 2]; rgba[di + 3] = 255
      }
    }
    const bitmap = await createImageBitmap(new ImageData(rgba, width, height))
    pixmap.destroy()
    p.destroy()
    return bitmap
  },

  text: (_id: DocId, _page: number) => stub('text') as Promise<string>,
  search: (_id: DocId, _needle: string) => stub('search') as Promise<SearchHit[]>,
  rearrange: (_id: DocId, _order: number[]) => stub('rearrange') as Promise<void>,
  rotate: (_id: DocId, _pages: number[], _degrees: 90 | 180 | 270) => stub('rotate') as Promise<void>,
  insertBlank: (_id: DocId, _at: number) => stub('insertBlank') as Promise<void>,
  merge: (_target: DocId, _source: DocId, _at: number) => stub('merge') as Promise<void>,
  extract: (_id: DocId, _pages: number[]) => stub('extract') as Promise<DocId>,
  imagesToPdf: (_images: Blob[]) => stub('imagesToPdf') as Promise<DocId>,
  annotate: (_id: DocId, _page: number, _a: AnnotationInput) => stub('annotate') as Promise<string>,
  replaceText: (_id: DocId, _page: number, _span: Quad[], _text: string) => stub('replaceText') as Promise<{ usedFallbackFont: boolean }>,
  fields: (_id: DocId) => stub('fields') as Promise<FormField[]>,
  setField: (_id: DocId, _name: string, _value: string | boolean) => stub('setField') as Promise<void>,
  flatten: (_id: DocId) => stub('flatten') as Promise<void>,
  placeImage: (_id: DocId, _page: number, _rect: Rect, _png: Blob) => stub('placeImage') as Promise<void>,
  markRedaction: (_id: DocId, _page: number, _quads: Quad[]) => stub('markRedaction') as Promise<string>,
  applyRedactions: (_id: DocId) => stub('applyRedactions') as Promise<{ verified: boolean; residualMatches: number }>,
  stamp: (_id: DocId, _kind: 'pageNumbers' | 'watermark', _text?: string) => stub('stamp') as Promise<void>,
  save: (_id: DocId, _opts: SaveOptions) => stub('save') as Promise<Uint8Array>,
  setMetadata: (_id: DocId, _meta: Record<string, string>) => stub('setMetadata') as Promise<void>,
  close: async (id: DocId) => { docs.delete(id) },
}

Comlink.expose(engine)
