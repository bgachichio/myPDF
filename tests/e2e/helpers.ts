// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, type Page, type Download } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as mupdf from 'mupdf'

export const ORIGIN = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:4173').origin
export const corpus = (f: string) => resolve(import.meta.dirname, '../corpus', f)

/** Chromium's native save dialog would hang a headless run, so tests use the download fallback. */
export async function prepare(page: Page) {
  await page.addInitScript(() => { delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker })
}
export async function openFile(page: Page, file: string) {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(corpus(file))
  await expect(page.getByTestId('grid')).toBeVisible({ timeout: 30_000 })
}
export async function mergeFiles(page: Page, files: string[]) {
  await page.goto('/')
  await page.getByTestId('merge-input').setInputFiles(files.map(corpus))
  await expect(page.getByTestId('grid')).toBeVisible({ timeout: 30_000 })
}
export const pageCount = async (page: Page) => Number(/^(\d+)/.exec(await page.getByTestId('page-count').innerText())![1])
export async function selectPage(page: Page, i: number) { await page.getByTestId(`page-${i}`).getByRole('button').click() }

export async function exportPdf(page: Page, opts: { compress?: boolean; strip?: boolean; password?: string } = {}): Promise<Uint8Array> {
  await page.getByTestId('export').click()
  const set = async (id: string, v?: boolean) => { if (v !== undefined) await page.getByTestId(id).setChecked(v) }
  await set('opt-compress', opts.compress ?? false); await set('opt-strip', opts.strip ?? false)
  if (opts.password) await page.getByTestId('opt-password').fill(opts.password)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-save').click()])
  return readDownload(dl)
}
export async function readDownload(dl: Download): Promise<Uint8Array> {
  const path = await dl.path()
  return new Uint8Array(readFileSync(path))
}
export const docOf = (bytes: Uint8Array, pw?: string) => {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf').asPDF()!
  if (d.needsPassword() && pw) d.authenticatePassword(pw)
  return d
}
export const pageText = (d: mupdf.PDFDocument, i: number) => d.loadPage(i).toStructuredText('preserve-whitespace').asText()
export const allText = (d: mupdf.PDFDocument) => Array.from({ length: d.countPages() }, (_, i) => pageText(d, i)).join('\n')
export const fileText = (f: string, i: number) => pageText(docOf(new Uint8Array(readFileSync(corpus(f)))), i)

export async function toCanvas(page: Page, i = 0) {
  await selectPage(page, i)
  await page.getByTestId('dock-edit').click()
  await expect(page.getByTestId('page-canvas')).toHaveAttribute('data-rendered', String(i), { timeout: 15_000 })
}

const dirty = /NaN|undefined|Infinity|\[object/

export async function audit(page: Page, label: string) {
  const bad = await page.evaluate(() => {
    const out: string[] = []
    const vw = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth > vw + 1) out.push(`horizontal overflow ${document.documentElement.scrollWidth} > ${vw}`)
    document.querySelectorAll<HTMLElement>('button, input:not([type=hidden]), select, textarea, [role=button]').forEach((el) => {
      if (el.closest('[hidden]') || (el as HTMLInputElement).type === 'file') return
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) return
      if (r.width < 43.5 || r.height < 43.5) {
        const lbl = (el as HTMLInputElement).type === 'checkbox' ? el.closest('label') : null
        const lr = lbl?.getBoundingClientRect()
        if (!(lr && lr.height >= 43.5)) out.push(`${el.tagName} "${(el.getAttribute('aria-label') || el.textContent || el.getAttribute('data-testid') || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    })
    return out
  })
  expect(bad, label).toEqual([])
  expect(await page.locator('body').innerText(), label).not.toMatch(dirty)
}
