// SPDX-License-Identifier: AGPL-3.0-or-later
// R10: the saved file asks for the password and opens with it.
import { test, expect } from '@playwright/test'
import { prepare, openFile, exportPdf } from './helpers'
import * as mupdf from 'mupdf'

test('R10 password protect on export', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf')
  const out = await exportPdf(page, { compress: true, password: 'open-sesame' })
  const d = mupdf.Document.openDocument(out, 'application/pdf')
  expect(d.needsPassword()).toBe(true)
  expect(d.authenticatePassword('wrong')).toBe(0)
  expect(d.authenticatePassword('open-sesame')).toBeGreaterThan(0)
  expect(d.countPages()).toBe(3)
})
