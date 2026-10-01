// SPDX-License-Identifier: AGPL-3.0-or-later
// M0 exit: a deployed shell that opens and renders a PDF, with nothing leaving the device (R13 precursor).
import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const corpus = (f: string) => resolve(import.meta.dirname, '../corpus', f)

test('opens a corpus PDF, renders page 1, and makes no cross-origin request', async ({ page }) => {
  const foreign: string[] = []
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (!['http:', 'https:'].includes(u.protocol)) return
    if (u.origin !== 'http://127.0.0.1:4173') foreign.push(r.url())
  })
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(corpus('pdfjs-tracemonkey-text.pdf'))
  const canvas = page.locator('canvas[data-rendered="0"]')
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(300)
  await page.getByLabel('Next page').click()
  await expect(page.locator('canvas[data-rendered="1"]')).toBeVisible()
  expect(foreign).toEqual([])
  expect(errors).toEqual([]) // includes any Content-Security-Policy violation under the production headers
})

test('asks for a password on an encrypted file and opens with the right one', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(corpus('synthetic-encrypted-aes256.pdf'))
  await page.getByLabel('This file is password protected').fill('testpass')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.locator('canvas[data-rendered="0"]')).toBeVisible({ timeout: 30_000 })
})
