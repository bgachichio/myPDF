// SPDX-License-Identifier: AGPL-3.0-or-later
// frontend-verification stage 4: type character by character into every kind of field and assert focus is kept and the stored value equals the typed value;
// click every tab, toggle and action and assert persistence.
import { test, expect, type Locator, type Page } from '@playwright/test'
import { prepare, openFile, selectPage } from './helpers'

async function typeKeepingFocus(_page: Page, field: Locator, text: string) {
  await field.click(); await field.fill('')
  let typed = ''
  for (const ch of text) {
    await field.pressSequentially(ch)
    typed += ch
    expect(await field.evaluate((el) => el === document.activeElement), `focus lost after "${typed}"`).toBe(true)
    await expect(field).toHaveValue(typed)
  }
}

test('typing keeps focus and value in every field', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-tracemonkey-text.pdf')
  // watermark text (free text with spaces and punctuation)
  await page.getByTestId('dock-watermark').click()
  await typeKeepingFocus(page, page.locator('#wm'), 'Draft v2.1, 21.36%')
  await page.keyboard.press('Escape')
  // extract ranges (separators), move-to (number)
  await selectPage(page, 2); await selectPage(page, 3)
  await page.getByTestId('dock-extract').click()
  await typeKeepingFocus(page, page.locator('#ranges'), '1-3, 5, 8-')
  await page.keyboard.press('Escape')
  await page.getByTestId('dock-move').click()
  await typeKeepingFocus(page, page.locator('#move-to'), '12')
  await page.keyboard.press('Escape')
  // export password and title
  await page.getByTestId('export').click()
  await typeKeepingFocus(page, page.getByTestId('opt-password'), 'p@ss 1,234.5')
  await page.getByTestId('opt-strip').setChecked(false)
  await typeKeepingFocus(page, page.getByTestId('meta-title'), 'Board paper, 2026-10-01')
  await page.keyboard.press('Escape')
  // canvas: search and the redact term
  await page.getByTestId('dock-edit').click()
  await typeKeepingFocus(page, page.getByTestId('search'), 'Trace-based 21.36')
  await page.getByTestId('tool-redact').click()
  await typeKeepingFocus(page, page.getByTestId('redact-term'), 'Name, Surname')
})

test('settings and export defaults persist across a reload', async ({ page }) => {
  await prepare(page)
  await page.goto('/')
  await page.getByLabel('Settings').click()
  await page.getByTestId('theme-dark').click()
  await page.getByTestId('scale-xlarge').click()
  await page.getByTestId('default-compress').setChecked(false)
  await page.getByTestId('default-strip').setChecked(false)
  expect(await page.evaluate(() => [localStorage.getItem('ui.theme'), localStorage.getItem('ui.fontScale'), localStorage.getItem('export.compress'), localStorage.getItem('export.stripMetadata')])).toEqual(['dark', 'xlarge', 'false', 'false'])
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('html')).toHaveAttribute('data-font-scale', 'xlarge')
  await page.getByLabel('Settings').click()
  await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('default-compress')).not.toBeChecked()
  await openFile(page, 'pdfjs-basicapi.pdf')
  await page.getByTestId('export').click()
  await expect(page.getByTestId('opt-compress')).not.toBeChecked()
  await expect(page.getByTestId('opt-strip')).not.toBeChecked()
})

test('every dock action, tab and toggle responds and the grid survives it', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-basicapi.pdf')
  await page.getByTestId('dock-blank').click(); await expect(page.getByTestId('page-count')).toContainText('4 pages')
  await selectPage(page, 0)
  await page.getByTestId('dock-duplicate').click(); await expect(page.getByTestId('page-count')).toContainText('5 pages')
  await page.getByTestId('dock-rotate').click()
  await page.getByTestId('dock-delete').click(); await expect(page.getByTestId('page-count')).toContainText('4 pages')
  for (const t of ['dock-blank', 'dock-numbers']) await page.getByTestId(t).click()
  await page.getByTestId('undo').click(); await page.getByTestId('undo').click()
  await page.getByTestId('redo').click()
  await selectPage(page, 0)
  await page.getByTestId('dock-edit').click()
  for (const t of ['tool-edit', 'tool-markup', 'tool-draw', 'tool-redact', 'tool-fields', 'tool-select']) { await page.getByTestId(t).click(); await expect(page.getByTestId(t)).toHaveAttribute('aria-pressed', 'true') }
  await page.getByTestId('tool-markup').click()
  for (const m of ['highlight', 'underline', 'strikeout', 'freetext', 'square', 'circle', 'note']) { await page.getByTestId(`markup-${m}`).click(); await expect(page.getByTestId(`markup-${m}`)).toHaveAttribute('aria-pressed', 'true') }
  await page.getByLabel('Zoom in').click(); await page.getByLabel('Zoom out').click()
  await page.getByTestId('next').click(); await expect(page.getByTestId('page-indicator')).toContainText('2 /')
})
