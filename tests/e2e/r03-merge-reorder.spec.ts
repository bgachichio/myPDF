// SPDX-License-Identifier: AGPL-3.0-or-later
// R03: merging three corpus files and moving page 5 to position 1 gives a file in the organiser's order that passes qpdf --check.
import { test, expect } from '@playwright/test'
import { execFileSync } from 'child_process'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { prepare, mergeFiles, pageCount, selectPage, exportPdf, docOf, pageText, fileText } from './helpers'

test('R03 merge three files, move page 5 to position 1, export', async ({ page }) => {
  await prepare(page)
  await mergeFiles(page, ['pdfjs-tracemonkey-text.pdf', 'pdfjs-basicapi.pdf', 'synthetic-scan-5p.pdf'])
  await expect.poll(() => pageCount(page)).toBe(14 + 3 + 5)
  await selectPage(page, 4)
  await page.getByTestId('dock-move').click()
  await page.locator('#move-to').fill('1')
  await page.getByTestId('move-apply').click()
  await expect(page.getByTestId('page-0').getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  const bytes = await exportPdf(page)
  const d = docOf(bytes)
  expect(d.countPages()).toBe(22)
  expect(pageText(d, 0)).toBe(fileText('pdfjs-tracemonkey-text.pdf', 4))
  expect(pageText(d, 1)).toBe(fileText('pdfjs-tracemonkey-text.pdf', 0))
  try { execFileSync('qpdf', ['--version'], { stdio: 'pipe' }) } catch { return }
  const p = join(tmpdir(), `r03-${process.pid}.pdf`); writeFileSync(p, bytes)
  expect(() => { try { execFileSync('qpdf', ['--check', p], { stdio: 'pipe' }) } catch (e) { if ((e as { status?: number }).status !== 3) throw e } }).not.toThrow()
})
