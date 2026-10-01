// SPDX-License-Identifier: AGPL-3.0-or-later
// R08: compressing the image-heavy corpus file shrinks it by at least 30% and it stays viewable.
import { test, expect } from '@playwright/test'
import { statSync } from 'fs'
import { prepare, openFile, exportPdf, docOf, corpus } from './helpers'

test('R08 compress the image-heavy file', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'synthetic-image-heavy-8p.pdf')
  const out = await exportPdf(page, { compress: true, strip: true })
  expect(out.length).toBeLessThan(statSync(corpus('synthetic-image-heavy-8p.pdf')).size * 0.7)
  expect(docOf(out).countPages()).toBe(8)
})
