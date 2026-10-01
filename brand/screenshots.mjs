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
await browser.close(); server.kill()
