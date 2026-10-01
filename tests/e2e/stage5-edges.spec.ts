// SPDX-License-Identifier: AGPL-3.0-or-later
// frontend-verification stage 5: the edge matrix. Empty, corrupt storage, a single page, both themes, every text size,
// a phone width, and the 44 px touch target rule (BUILD-BRIEF section 8).
import { test, expect, type Page } from '@playwright/test'
import { prepare, openFile } from './helpers'

const dirty = /NaN|undefined|Infinity|\[object/

async function audit(page: Page, label: string) {
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

test('empty state, corrupt storage, both themes, every text size, phone width', async ({ page }) => {
  await prepare(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ui.theme', '{broken'); localStorage.setItem('ui.fontScale', '99'); sessionStorage.setItem('seeded', '1') } } catch { /* ignore */ } })
  await page.goto('/')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await audit(page, 'home defaults after corrupt storage')
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    for (const scale of ['compact', 'default', 'large', 'xlarge']) {
      await page.evaluate((s) => { localStorage.setItem('ui.theme', 'system'); localStorage.setItem('ui.fontScale', s) }, scale)
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('data-font-scale', scale)
      await audit(page, `home ${colorScheme} ${scale}`)
    }
  }
  const bgNow = () => page.evaluate(() => getComputedStyle(document.querySelector('#root > div')!).backgroundColor)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(bgNow).toBe('rgb(15, 21, 18)')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(bgNow).toBe('rgb(247, 250, 248)') // follows the device live while on Auto
  // the chosen theme beats the device: Light while the device is dark
  await page.evaluate(() => localStorage.setItem('ui.theme', 'light')); await page.emulateMedia({ colorScheme: 'dark' }); await page.reload()
  expect(await bgNow()).toBe('rgb(247, 250, 248)')
})

test('workbench, canvas and sheets at phone width and the largest text', async ({ page }) => {
  await prepare(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => { localStorage.setItem('ui.fontScale', 'xlarge') })
  await openFile(page, 'pdfjs-basicapi.pdf')
  await audit(page, 'workbench')
  await page.locator('[data-testid="page-0"] button').click()
  await audit(page, 'workbench with selection')
  await page.getByTestId('export').click(); await audit(page, 'export sheet'); await page.keyboard.press('Escape')
  await page.getByTestId('dock-edit').click()
  await expect(page.getByTestId('page-canvas')).toHaveAttribute('data-rendered', '0')
  for (const t of ['select', 'markup', 'redact', 'fields']) { await page.getByTestId(`tool-${t}`).click(); await audit(page, `canvas ${t}`) }
  await page.getByTestId('tool-sign').click(); await audit(page, 'sign sheet')
})

test('a single-page document cannot lose its last page', async ({ page }) => {
  await prepare(page)
  await openFile(page, 'pdfjs-stamp.pdf')
  await expect(page.getByTestId('page-count')).toContainText('1 page')
  await page.locator('[data-testid="page-0"] button').click()
  await page.getByTestId('dock-delete').click()
  await expect(page.getByTestId('toast')).toContainText('at least one page')
  await expect(page.getByTestId('page-count')).toContainText('1 page')
  await page.getByTestId('dock-rotate').click(); await expect(page.getByTestId('busy')).toHaveCount(0)
  await page.getByTestId('undo').click(); await expect(page.getByTestId('page-count')).toContainText('1 page')
})

test('a corrupt file reports an error and leaves the app usable', async ({ page }) => {
  await prepare(page); await page.goto('/')
  await page.getByTestId('file-input').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nnot really a pdf') })
  await expect(page.getByTestId('toast')).toContainText(/failed|not a PDF/i, { timeout: 15_000 })
  await expect(page.getByTestId('open-pdf')).toBeVisible()
})

test('a wrong password then the right one', async ({ page }) => {
  await prepare(page); await page.goto('/')
  await page.getByTestId('file-input').setInputFiles({ name: 'enc.pdf', mimeType: 'application/pdf', buffer: (await import('fs')).readFileSync((await import('./helpers')).corpus('synthetic-encrypted-aes256.pdf')) })
  const field = page.getByLabel(/is password protected/)
  await field.fill('nope'); await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('alert')).toContainText('did not work')
  await field.fill('testpass'); await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByTestId('grid')).toBeVisible({ timeout: 30_000 })
})
