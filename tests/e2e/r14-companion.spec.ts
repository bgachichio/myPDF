// SPDX-License-Identifier: AGPL-3.0-or-later
// R14: with the companion running, a DOCX converts and opens. With it stopped, the DOCX option shows "Companion not running" and a set-up
// link, and no error. The running half drives the real gateway and real LibreOffice, and skips (loudly) where LibreOffice is not installed.
import { test, expect } from '@playwright/test'
import { spawn, execFileSync, type ChildProcess } from 'child_process'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { prepare, pageText, docOf, exportPdf } from './helpers'

const DOCX = resolve(import.meta.dirname, '../fixtures/board-note.docx')
const TOKEN = 'test-token-r14-0123456789abcdef'
const PORT = 8793
let gateway: ChildProcess | null = null
const hasOffice = (() => { try { execFileSync('soffice', ['--version'], { stdio: 'pipe' }); return true } catch { return false } })()

test.describe('R14 companion', () => {
  test('stopped: the option explains itself, links to set-up, and shows no error', async ({ page }) => {
    await prepare(page)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await expect(page.getByTestId('companion-status')).toHaveText('Not detected')
    await page.getByTestId('convert-office').click()
    await expect(page.getByTestId('companion-not-running')).toHaveText('Companion not running')
    await expect(page.getByTestId('setup-link')).toHaveAttribute('href', /github\.com\/bgachichio\/myPDF\/tree\/main\/companion/)
    await expect(page.getByTestId('toast')).toHaveCount(0)
    await page.keyboard.press('Escape')
    // dropping or choosing a Word file while it is stopped does the same, with no error toast
    await page.getByTestId('file-input').setInputFiles(DOCX)
    await expect(page.getByTestId('companion-not-running')).toBeVisible()
    await expect(page.getByTestId('toast')).toHaveCount(0)
    expect(errors).toEqual([])
    // a configured but stopped companion is reported, not thrown
    await page.getByTestId('companion-url').fill(`http://127.0.0.1:${PORT + 50}`); await page.getByTestId('companion-token').fill('x')
    await page.getByTestId('companion-connect').click()
    await expect(page.getByRole('alert')).toContainText('Still no companion')
    await expect(page.getByTestId('toast')).toHaveCount(0)
  })

  test('the address must be on this device', async ({ page }) => {
    await prepare(page); await page.goto('/')
    await page.getByTestId('convert-office').click()
    await page.getByTestId('companion-url').fill('http://192.168.1.20:8787'); await page.getByTestId('companion-token').fill('x')
    await page.getByTestId('companion-connect').click()
    await expect(page.getByRole('alert')).toContainText('on this device')
  })

  test.describe('running', () => {
    test.skip(!hasOffice, 'LibreOffice (soffice) is not installed here; install libreoffice-writer-nogui to run this half of R14')
    test.beforeAll(async () => {
      gateway = spawn('node', [resolve(import.meta.dirname, '../../companion/gateway.mjs')], { env: { ...process.env, PORT: String(PORT), MYPDF_COMPANION_TOKEN: TOKEN }, stdio: 'ignore' })
      for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/health`); break } catch { await new Promise((r) => setTimeout(r, 150)) } }
    })
    test.afterAll(() => { gateway?.kill() })

    test('a DOCX converts and opens, a wrong token is refused, and the receipt stays green', async ({ page, context }) => {
      test.setTimeout(120_000)
      await context.grantPermissions(['local-network-access']).catch(() => undefined) // Chrome asks once on the live site; tests answer Allow
      await prepare(page); await page.goto('/')
      await page.getByTestId('convert-office').click()
      await page.getByTestId('companion-url').fill(`http://127.0.0.1:${PORT}`); await page.getByTestId('companion-token').fill('wrong')
      await page.getByTestId('companion-connect').click()
      await expect(page.getByRole('alert')).toContainText('did not accept that token')
      await page.getByTestId('companion-token').fill(TOKEN)
      await page.getByTestId('companion-connect').click()
      await expect(page.getByTestId('companion-running')).toBeVisible()
      await page.getByTestId('convert-input').setInputFiles(DOCX)
      await expect(page.getByTestId('grid')).toBeVisible({ timeout: 90_000 })
      await expect(page.getByText('board-note.pdf')).toBeVisible()
      const d = docOf(await exportPdf(page))
      expect(pageText(d, 0)).toContain('QUOKKA-7731')
      expect(pageText(d, 0)).toContain('Greenfield Holdings')
      // back home: status persists across a reload, the receipt knows about the helper and nothing else
      await page.reload()
      await expect(page.getByTestId('companion-status')).toHaveText('Running', { timeout: 10_000 })
      await page.getByTestId('receipt-chip').click()
      await expect(page.getByTestId('receipt-other')).toHaveText('0')
      await expect(page.getByTestId('receipt-summary')).toContainText('Nothing you opened has left this device.')
    })

    test('choosing a Word file on Home converts it directly once paired', async ({ page, context }) => {
      test.setTimeout(120_000)
      await context.grantPermissions(['local-network-access']).catch(() => undefined)
      await prepare(page)
      await page.addInitScript(([url, token]) => { localStorage.setItem('companion.url', url); localStorage.setItem('companion.token', token) }, [`http://127.0.0.1:${PORT}`, TOKEN])
      await page.goto('/')
      await expect(page.getByTestId('companion-status')).toHaveText('Running', { timeout: 10_000 })
      await page.getByTestId('file-input').setInputFiles({ name: 'board-note.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: readFileSync(DOCX) })
      await expect(page.getByTestId('grid')).toBeVisible({ timeout: 90_000 })
    })

    test('the gateway refuses other origins and missing tokens', async () => {
      const bad = await fetch(`http://127.0.0.1:${PORT}/health`, { headers: { Origin: 'https://evil.example', Authorization: `Bearer ${TOKEN}` } })
      expect(bad.status).toBe(403)
      expect((await fetch(`http://127.0.0.1:${PORT}/health`)).status).toBe(401)
      const pre = await fetch(`http://127.0.0.1:${PORT}/convert`, { method: 'OPTIONS', headers: { Origin: 'https://mypdf.gachichio.org', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Private-Network': 'true' } })
      expect(pre.headers.get('access-control-allow-private-network')).toBe('true')
      expect(pre.headers.get('access-control-allow-origin')).toBe('https://mypdf.gachichio.org')
    })
  })
})
