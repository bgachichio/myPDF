// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, type Page, type Download } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as mupdf from 'mupdf'

export const ORIGIN = 'http://127.0.0.1:4173'
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
