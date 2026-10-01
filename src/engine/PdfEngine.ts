// SPDX-License-Identifier: AGPL-3.0-or-later
export type DocId = string;
export type Rect = [number, number, number, number];
export type Quad = [number, number, number, number, number, number, number, number];

export interface PageInfo { index: number; width: number; height: number; rotation: 0 | 90 | 180 | 270 }
export interface SearchHit { page: number; quads: Quad[] }
export interface SaveOptions { compress: boolean; stripMetadata: boolean; password?: string }

export type AnnotationType = 'highlight' | 'underline' | 'strikeout' | 'squiggly' | 'freetext' | 'ink' | 'stamp' | 'square' | 'circle' | 'note'
export interface AnnotationInput {
  type: AnnotationType
  page: number
  quads?: Quad[]
  rect?: Rect
  color?: string
  opacity?: number
  contents?: string
  inkList?: Array<Array<[number, number]>>
}

export type FormFieldType = 'text' | 'checkbox' | 'radio' | 'choice' | 'signature'
export interface FormField {
  name: string
  type: FormFieldType
  value: string | boolean
  rect: Rect
  page: number
  options?: string[]
}

export interface OutlineEntry { title: string; page: number; depth: number }
export interface OcrWord { text: string; rect: Rect }

// Coordinate frame for every Rect and Quad: MuPDF page space in points, origin top-left, y down, unrotated page.
export interface PdfEngine {
  open(bytes: ArrayBuffer, password?: string): Promise<{ id: DocId; pages: PageInfo[]; needsPassword: boolean; repaired?: boolean }>
  render(id: DocId, page: number, scale: number): Promise<ImageBitmap>
  text(id: DocId, page: number): Promise<string>
  search(id: DocId, needle: string): Promise<SearchHit[]>
  rearrange(id: DocId, order: number[]): Promise<void>
  rotate(id: DocId, pages: number[], degrees: 90 | 180 | 270): Promise<void>
  insertBlank(id: DocId, at: number): Promise<void>
  merge(target: DocId, source: DocId, at: number): Promise<void>
  extract(id: DocId, pages: number[]): Promise<DocId>
  imagesToPdf(images: Blob[]): Promise<DocId>
  annotate(id: DocId, page: number, a: AnnotationInput): Promise<string>
  replaceText(id: DocId, page: number, span: Quad[], text: string): Promise<{ usedFallbackFont: boolean }>
  fields(id: DocId): Promise<FormField[]>
  setField(id: DocId, name: string, value: string | boolean): Promise<void>
  flatten(id: DocId): Promise<void>
  placeImage(id: DocId, page: number, rect: Rect, png: Blob): Promise<void>
  markRedaction(id: DocId, page: number, quads: Quad[]): Promise<string>
  applyRedactions(id: DocId): Promise<{ verified: boolean; residualMatches: number }>
  stamp(id: DocId, kind: 'pageNumbers' | 'watermark', text?: string): Promise<void>
  save(id: DocId, opts: SaveOptions): Promise<Uint8Array>
  setMetadata(id: DocId, meta: Record<string, string>): Promise<void>
  /** Added at M4 (decision log 01-10-2026): document outline (F01), flattened with nesting depth. */
  outline(id: DocId): Promise<OutlineEntry[]>
  /** Added at M4: the word under a point, so a tap can select text. Null when the point is not on a word. */
  wordAt(id: DocId, page: number, point: [number, number]): Promise<Quad | null>
  /** Added at M1 (decision log 01-10-2026): current page list after edits. */
  pages(id: DocId): Promise<PageInfo[]>
  /** Added at M2 (decision log 01-10-2026): text under a rectangle, used to prefill text replacement and to preview redactions. */
  textIn(id: DocId, page: number, rect: Rect): Promise<string>
  /** Added at M3 (decision log 01-10-2026): invisible OCR text layer, one entry per recognised word. Rect is in page space. */
  addTextLayer(id: DocId, page: number, words: OcrWord[]): Promise<void>
  close(id: DocId): Promise<void>
}
