// SPDX-License-Identifier: AGPL-3.0-or-later
export type DocId = string;
export type Rect = [number, number, number, number];
export type Quad = [number, number, number, number, number, number, number, number];

export interface PageInfo { index: number; width: number; height: number; rotation: 0 | 90 | 180 | 270 }
export interface SearchHit { page: number; quads: Quad[] }
/** Added 03-10-2026 (decision log): what a reader may do with a protected file. Needs an owner password to take effect. */
export interface Restrict { print: boolean; copy: boolean; edit: boolean }
export interface SaveOptions {
  compress: boolean; stripMetadata: boolean; password?: string
  /** Export only: drop the opened file's old password (F10). Snapshots and recents keep it. */
  decrypt?: boolean
  /** Added 03-10-2026: owner password plus the actions the file still allows (F20). The open password is `password`, and may be empty. */
  ownerPassword?: string; restrict?: Restrict
}

export type AnnotationType = 'highlight' | 'underline' | 'strikeout' | 'squiggly' | 'freetext' | 'ink' | 'stamp' | 'square' | 'circle' | 'note'
export interface AnnotationInput {
  /** `borderWidth` is the pen width of an ink stroke or the outline of a box or circle, in points. */
  borderWidth?: number
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

/** Added 03-10-2026 (decision log): typed text placed on a page (F17). Colour is #rrggbb. */
export interface TextStyle { font: 'sans' | 'serif' | 'mono'; size: number; bold: boolean; italic: boolean; color: string }
export interface Margins { top: number; right: number; bottom: number; left: number }
export type StampPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
export interface StampOptions { position?: StampPosition; format?: 'n' | 'n-of-total' | 'page-n'; start?: number; size?: number; color?: string; opacity?: number }
/** Added 03-10-2026 (F19). `rect` is in page space; null makes an invisible signature. Everything is plain text; the caller finishes the cryptography. */
export interface SignPrepare {
  page: number; rect: Rect | null; signer: string; reason: string; location: string; contact: string
  /** PDF date string, for example D:20261003120000Z */
  date: string
  /** Bytes reserved for the signature container. */
  reserve: number
  compress: boolean; stripMetadata: boolean
}

export interface WordRun { text: string; bold: boolean; italic: boolean }
export interface WordPara { page: number; size: number; runs: WordRun[] }
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
  /** `annotations` (added 03-10-2026, F24) also makes highlights, ink, shapes and notes permanent, so they cannot be moved or removed in another reader. */
  flatten(id: DocId, annotations?: boolean): Promise<void>
  placeImage(id: DocId, page: number, rect: Rect, png: Blob): Promise<void>
  markRedaction(id: DocId, page: number, quads: Quad[]): Promise<string>
  applyRedactions(id: DocId): Promise<{ verified: boolean; residualMatches: number }>
  stamp(id: DocId, kind: 'pageNumbers' | 'watermark', text?: string, opts?: StampOptions): Promise<void>
  save(id: DocId, opts: SaveOptions): Promise<Uint8Array>
  setMetadata(id: DocId, meta: Record<string, string>): Promise<void>
  /** Added at M4 (decision log 01-10-2026): document outline (F01), flattened with nesting depth. */
  outline(id: DocId): Promise<OutlineEntry[]>
  /** Added 01-10-2026 (decision log): the document's text as paragraphs with bold and italic runs and the largest type size, for PDF to Word export. */
  structure(id: DocId): Promise<{ paragraphs: WordPara[]; bodySize: number }>
  /** Added at M5 (decision log 01-10-2026): Title, Author, Subject and Keywords, so the export sheet can prefill them (F10). */
  getMetadata(id: DocId): Promise<Record<string, string>>
  /** Added at M4: the word under a point, so a tap can select text. Null when the point is not on a word. */
  wordAt(id: DocId, page: number, point: [number, number]): Promise<Quad | null>
  /** Added at M1 (decision log 01-10-2026): current page list after edits. */
  pages(id: DocId): Promise<PageInfo[]>
  /** Added at M2 (decision log 01-10-2026): text under a rectangle, used to prefill text replacement and to preview redactions. */
  textIn(id: DocId, page: number, rect: Rect): Promise<string>
  /** Added at M3 (decision log 01-10-2026): invisible OCR text layer, one entry per recognised word. Rect is in page space. */
  addTextLayer(id: DocId, page: number, words: OcrWord[]): Promise<void>
  /** Added 03-10-2026 (F17): typed text with a chosen face, size and colour, wrapped inside `rect`. Returns false when a character had to be replaced because the face cannot draw it. */
  addText(id: DocId, page: number, rect: Rect, text: string, style: TextStyle): Promise<boolean>
  /** Added 03-10-2026 (F18): removes every ink stroke within `radius` points of `point`. Returns how many were removed. */
  eraseInk(id: DocId, page: number, point: [number, number], radius: number): Promise<number>
  /** Added 03-10-2026 (F21): trims the visible page by the given margins (points, as seen on screen). */
  crop(id: DocId, pages: number[], margins: Margins): Promise<void>
  /** Added 03-10-2026 (F19): saves the file with an empty signature field and a reserved, marked signature container. Not for the editing session. */
  saveForSigning(id: DocId, o: SignPrepare): Promise<Uint8Array>
  /** Added 03-10-2026 (F25): a clickable area that opens a web address or jumps to a page (0-based). */
  addLink(id: DocId, page: number, rect: Rect, target: { uri: string } | { page: number }): Promise<void>
  close(id: DocId): Promise<void>
}
