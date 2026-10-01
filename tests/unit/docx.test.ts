// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { buildDocx, zipStored } from '@/features/export/docx'
import type { WordPara } from '@/engine/PdfEngine'

/** Read a stored-entry zip back through its central directory, the way Word does. */
function unzip(b: Uint8Array): Record<string, string> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let eocd = b.length - 22; while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true)
  const out: Record<string, string> = {}
  for (let i = 0; i < n; i++) {
    expect(dv.getUint32(p, true)).toBe(0x02014b50)
    const size = dv.getUint32(p + 24, true), nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), cmt = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true)
    const name = new TextDecoder().decode(b.slice(p + 46, p + 46 + nameLen))
    const lname = dv.getUint16(off + 26, true), lextra = dv.getUint16(off + 28, true)
    out[name] = new TextDecoder().decode(b.slice(off + 30 + lname + lextra, off + 30 + lname + lextra + size))
    p += 46 + nameLen + extra + cmt
  }
  return out
}
const xmlOk = (s: string) => { const { DOMParser } = new JSDOM('').window; return !new DOMParser().parseFromString(s, 'text/xml').querySelector('parsererror') }

describe('PDF to Word', () => {
  const paras: WordPara[] = [
    { page: 0, size: 24, runs: [{ text: 'Board paper & <notes>', bold: true, italic: false }] },
    { page: 0, size: 11, runs: [{ text: 'Normal ', bold: false, italic: false }, { text: 'bold', bold: true, italic: false }, { text: ' and ', bold: false, italic: false }, { text: 'italic', bold: false, italic: true }] },
    { page: 0, size: 15, runs: [{ text: 'Sub heading', bold: true, italic: false }] },
    { page: 1, size: 11, runs: [{ text: 'Second page', bold: false, italic: false }] },
  ]
  it('writes a valid zip with every part Word needs', () => {
    const z = unzip(buildDocx(paras, 11, 'Board'))
    expect(Object.keys(z).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml'])
    for (const [name, xml] of Object.entries(z)) expect(xmlOk(xml), name).toBe(true)
  })
  it('maps size to headings, keeps bold and italic, escapes text and breaks pages', () => {
    const doc = unzip(buildDocx(paras, 11, 'Board'))['word/document.xml']
    expect(doc).toContain('<w:pStyle w:val="Heading1"/>'); expect(doc).toContain('<w:pStyle w:val="Heading2"/>')
    expect(doc).toContain('Board paper &amp; &lt;notes&gt;')
    expect(doc).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">bold'); expect(doc).toContain('<w:rPr><w:i/></w:rPr><w:t xml:space="preserve">italic')
    expect((doc.match(/<w:pageBreakBefore\/>/g) ?? []).length).toBe(1)
  })
  it('an empty document still opens', () => { expect(xmlOk(unzip(buildDocx([], 11, 'x'))['word/document.xml'])).toBe(true) })
  it('zip entries carry correct CRC and sizes', () => {
    const z = zipStored([{ name: 'a.txt', data: new TextEncoder().encode('hello') }])
    expect(new DataView(z.buffer).getUint32(14, true)).toBe(0x3610a686) // crc32("hello")
  })
})
