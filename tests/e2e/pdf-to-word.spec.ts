// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF to Word export: the file downloads, opens as a Word package, and carries the text. Where LibreOffice is installed it is also opened for real.
import { test, expect } from '@playwright/test'
import { execFileSync } from 'child_process'
import { readFileSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { inflateRawSync } from 'zlib'
import { prepare, openFile } from './helpers'

function entries(b: Buffer): Record<string, string> {
  let eocd = b.length - 22; while (b.readUInt32LE(eocd) !== 0x06054b50) eocd--
  const n = b.readUInt16LE(eocd + 10); let p = b.readUInt32LE(eocd + 16); const out: Record<string, string> = {}
  for (let i = 0; i < n; i++) {
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42)
    const name = b.toString('utf8', p + 46, p + 46 + nl)
    const start = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28)
    const raw = b.subarray(start, start + csize); out[name] = (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'); p += 46 + nl + el + cl
  }
  return out
}
const hasOffice = (() => { try { execFileSync('soffice', ['--version'], { stdio: 'pipe' }); return true } catch { return false } })()

test('save a PDF as a Word document', async ({ page }) => {
  test.setTimeout(120_000)
  await prepare(page)
  await openFile(page, 'pdfjs-tracemonkey-text.pdf')
  await page.getByTestId('export').click()
  await expect(page.getByText('Tables, columns, images and exact layout are not kept.')).toBeVisible()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-word').click()])
  expect(dl.suggestedFilename()).toBe('pdfjs-tracemonkey-text.docx')
  const buf = readFileSync((await dl.path())!)
  const parts = entries(buf)
  expect(Object.keys(parts)).toContain('word/document.xml')
  expect(parts['word/document.xml']).toContain('Trace-based'); expect(parts['word/document.xml']).toContain('Heading')
  expect((parts['word/document.xml'].match(/<w:pageBreakBefore\/>/g) ?? []).length).toBeGreaterThan(5)
  if (!hasOffice) return
  const dir = mkdtempSync(join(tmpdir(), 'p2w-')); writeFileSync(join(dir, 'out.docx'), buf)
  execFileSync('soffice', ['--headless', '--norestore', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', 'txt:Text', '--outdir', dir, join(dir, 'out.docx')], { stdio: 'ignore', timeout: 90_000 })
  const txt = readFileSync(join(dir, 'out.txt'), 'utf8')
  expect(txt).toContain('Trace-based'); expect(txt.length).toBeGreaterThan(20_000)
})

test('a scanned PDF says to run OCR first', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'synthetic-scan-5p.pdf')
  await page.getByTestId('export').click(); await page.getByTestId('export-word').click()
  await expect(page.getByTestId('toast')).toContainText('run OCR first')
})
