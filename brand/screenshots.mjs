// SPDX-License-Identifier: AGPL-3.0-or-later
// Install-prompt screenshots for the manifest. Run after `npm run build`: node brand/screenshots.mjs (serves dist/ itself).
import { chromium } from '@playwright/test'
import { spawn } from 'child_process'
import { resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const server = spawn('node', ['scripts/serve-dist.mjs'], { cwd: root, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 800))
const browser = await chromium.launch()
const shot = async (vp, file, fn) => {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: 'light' })
  const page = await ctx.newPage(); await page.addInitScript(() => { delete window.showOpenFilePicker })
  await page.goto('http://127.0.0.1:4173/'); await fn(page)
  await page.screenshot({ path: resolve(root, 'public/screenshots', file) }); await ctx.close(); console.log('wrote', file)
}
const open = async (page) => { await page.getByTestId('file-input').setInputFiles(resolve(root, 'tests/corpus/pdfjs-tracemonkey-text.pdf')); await page.getByTestId('grid').waitFor() }
await shot({ width: 390, height: 844 }, 'home-narrow.png', async (p) => { await p.getByTestId('open-pdf').waitFor() })
await shot({ width: 390, height: 844 }, 'pages-narrow.png', async (p) => { await open(p); await p.waitForTimeout(1500); await p.locator('[data-testid="page-1"] button').click() })
await shot({ width: 1280, height: 800 }, 'page-wide.png', async (p) => {
  await open(p); await p.locator('[data-testid="page-0"] button').click(); await p.getByTestId('dock-edit').click()
  await p.getByTestId('page-canvas').waitFor(); await p.waitForTimeout(1200)
})

// Pictures for the launch page on gachichio.org (03-10-2026): the script-font signature sheet, the page grid, and a signed file with its notice.
import { mkdirSync } from 'fs'
mkdirSync(resolve(root, 'brand/site'), { recursive: true })
const site = async (vp, file, fn) => {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, colorScheme: 'light', acceptDownloads: true })
  const page = await ctx.newPage(); await page.addInitScript(() => { delete window.showOpenFilePicker; delete window.showSaveFilePicker })
  await page.goto('http://127.0.0.1:4173/'); await fn(page)
  await page.screenshot({ path: resolve(root, 'brand/site', file) }); await ctx.close(); console.log('wrote', file)
}
await site({ width: 1280, height: 800 }, 'mypdf-sign.png', async (p) => {
  await open(p); await p.locator('[data-testid="page-0"] button').click(); await p.getByTestId('dock-edit').click()
  await p.getByTestId('page-canvas').waitFor(); await p.waitForTimeout(800)
  await p.getByTestId('tool-sign').click(); await p.getByTestId('sign-tab-type').click()
  await p.getByTestId('sign-typed').fill('Brian Gachichio'); await p.getByTestId('sign-font-great-vibes').click()
  await p.getByTestId('sign-preview').waitFor(); await p.waitForTimeout(400)
})
await site({ width: 390, height: 844 }, 'mypdf-pages.png', async (p) => { await open(p); await p.waitForTimeout(2500); await p.locator('[data-testid="page-1"] button').click(); await p.locator('[data-testid="page-2"] button').click() })
await site({ width: 390, height: 844 }, 'mypdf-signed.png', async (p) => {
  await open(p); await p.getByTestId('export').click(); await p.getByTestId('sign-panel').locator('summary').click(); await p.getByTestId('sign-id-new').click()
  await p.getByTestId('new-id-name').fill('Brian Gachichio'); await p.getByTestId('new-id-password').fill('correct-horse-9')
  await Promise.all([p.waitForEvent('download'), p.getByTestId('new-id-make').click()])
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByTestId('sign-save').click()])
  const file = resolve(root, 'brand/site/board-paper-signed.pdf'); await dl.saveAs(file)
  await p.keyboard.press('Escape'); await p.getByLabel('Back to home').click()
  await p.getByTestId('file-input').setInputFiles(file); await p.getByTestId('sig-chip').waitFor(); await p.waitForTimeout(5000)
})
await browser.close(); server.kill()
