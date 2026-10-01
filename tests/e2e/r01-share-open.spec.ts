// SPDX-License-Identifier: AGPL-3.0-or-later
// R01 (automated half): a PDF POSTed to /share, as the Android share sheet does, is parked by the service worker and opens in the app.
// The real check, sharing from Gmail on a Pixel 9 Pro, is manual and is recorded in DEPLOY.md section 7.
import { test, expect } from '@playwright/test'
import { corpus, prepare } from './helpers'

test.use({ serviceWorkers: 'allow' })

test('R01 share target opens the shared PDF with its pages shown', async ({ page }) => {
  await prepare(page)
  await page.goto('/')
  await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise((r) => { navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }); void reg.active })})
  await page.evaluate(() => {
    const form = document.createElement('form'); form.method = 'POST'; form.action = '/share'; form.enctype = 'multipart/form-data'
    const input = document.createElement('input'); input.type = 'file'; input.name = 'file'; input.id = 'share-file'; form.appendChild(input)
    document.body.appendChild(form)
  })
  await page.locator('#share-file').setInputFiles(corpus('pdfjs-tracemonkey-text.pdf'))
  await Promise.all([page.waitForURL(/\/\?open=inbox\//), page.evaluate(() => (document.querySelector('form') as HTMLFormElement).submit())])
  await expect(page.getByTestId('grid')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('page-count')).toContainText('14 pages')
  await expect(page.getByTestId('page-0').locator('canvas')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 })
  expect(new URL(page.url()).search).toBe('')
})
