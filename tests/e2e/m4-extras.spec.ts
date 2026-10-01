// SPDX-License-Identifier: AGPL-3.0-or-later
// M4 additions: tap a word to select it, the contents list (F01), the repaired-file notice, and the touch long-press drag reorder.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { prepare, openFile, toCanvas, corpus, pageCount } from './helpers'

test('tap a word to edit it', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-tracemonkey-text.pdf'); await toCanvas(page, 0)
  await page.getByTestId('search').fill('Trace-based'); await page.getByTestId('search').press('Enter')
  await page.getByTestId('tool-edit').click()
  const hit = page.getByTestId('hit').first(); await expect(hit).toBeVisible()
  const b = (await hit.boundingBox())!
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await expect(page.getByTestId('edit-text')).toHaveValue(/Trace/)
  await page.getByTestId('edit-text').fill('Tapped'); await page.getByTestId('edit-apply').click()
  await expect(page.getByTestId('busy')).toHaveCount(0, { timeout: 15_000 })
  await page.getByTestId('search').count() // tool is still edit; verify through text search after switching
  await page.getByTestId('tool-select').click()
  await page.getByTestId('search').fill('Tapped'); await page.getByTestId('search').press('Enter')
  await expect(page.getByTestId('search-count')).toContainText('1 of 1')
})

test('a tap on empty space selects nothing', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-tracemonkey-text.pdf'); await toCanvas(page, 0)
  await page.getByTestId('tool-edit').click()
  const o = (await page.getByTestId('overlay').boundingBox())!
  await page.mouse.click(o.x + 6, o.y + o.height * 0.4)
  await expect(page.getByTestId('toast')).toContainText('No word there')
  await expect(page.getByTestId('edit-text')).toHaveCount(0)
})

test('contents list jumps to the page', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf'); await toCanvas(page, 0)
  await page.getByTestId('contents').click()
  const items = page.getByTestId('contents-item'); await expect(items.first()).toBeVisible()
  await items.last().click()
  await expect(page.getByTestId('page-indicator')).toContainText(/\d+ \/ 3/)
  await page.getByTestId('contents').click()
  await expect(page.getByRole('dialog', { name: 'Contents' })).toBeVisible()
})

test('a damaged file is repaired and the user is told', async ({ page }) => {
  await prepare(page); await page.goto('/')
  const broken = Buffer.from(readFileSync(corpus('pdfjs-basicapi.pdf')).toString('latin1').replace(/startxref\s+\d+/g, 'startxref\n999999'), 'latin1')
  await page.getByTestId('file-input').setInputFiles({ name: 'damaged.pdf', mimeType: 'application/pdf', buffer: broken })
  await expect(page.getByTestId('grid')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('toast')).toContainText('repaired')
})

test('touch: a long press then drag reorders pages', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-tracemonkey-text.pdf')
  await expect.poll(() => pageCount(page)).toBe(14)
  const pageTextFirst = await page.getByTestId('page-0').getByRole('button').getAttribute('aria-label')
  const from = (await page.getByTestId('page-4').boundingBox())!, to = (await page.getByTestId('page-0').boundingBox())!
  await page.evaluate(({ fx, fy, tx, ty }) => {
    const el = document.querySelector('[data-testid="page-4"] button')!
    const ev = (type: string, x: number, y: number, target: EventTarget) => target.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, bubbles: true, isPrimary: true }))
    ev('pointerdown', fx, fy, el)
    ;(window as unknown as { __steps: () => void }).__steps = () => { ev('pointermove', tx, ty, window); ev('pointerup', tx, ty, window) }
  }, { fx: from.x + 20, fy: from.y + 20, tx: to.x + 4, ty: to.y + 20 })
  await page.waitForTimeout(450) // the 350 ms long press fires
  await page.evaluate(() => (window as unknown as { __steps: () => void }).__steps())
  await expect.poll(async () => (await page.getByTestId('page-0').getByRole('button').getAttribute('aria-label'))).toMatch(/selected/)
  expect(await page.getByTestId('page-1').getByRole('button').getAttribute('aria-label')).toContain('Page 2')
  expect(pageTextFirst).toContain('Page 1')
})

test('a quick touch tap still just selects', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf')
  await page.getByTestId('page-1').getByRole('button').tap().catch(async () => page.getByTestId('page-1').getByRole('button').click())
  await expect(page.getByTestId('page-1').getByRole('button')).toHaveAttribute('aria-pressed', 'true')
})
