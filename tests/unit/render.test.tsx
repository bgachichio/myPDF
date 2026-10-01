// SPDX-License-Identifier: AGPL-3.0-or-later
// frontend-verification stage 3: render the real components, dump the text, and look for the defect classes (NaN, undefined, Infinity, gift-size copy).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionProvider } from '@/app/session'
import Home from '@/features/home/Home'
import SettingsSheet from '@/features/settings/SettingsSheet'
import SupportSheet from '@/features/support/SupportSheet'
import PrivacyReceipt from '@/features/privacy-receipt/PrivacyReceipt'
import { BTC_ADDRESS, LIGHTNING_ADDRESS } from '@/config/support'

vi.mock('@/engine/mupdf/client', () => ({ getEngine: () => ({}), terminateEngine: () => undefined }))
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function mount(node: React.ReactElement) {
  const host = document.createElement('div'); document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => { root.render(createElement(SessionProvider, null, node)) })
  return { host, text: () => host.textContent ?? '', unmount: () => act(async () => root.unmount()) }
}
const dirty = /NaN|undefined|Infinity|\[object/
const giftSize = /small amounts?|larger amounts?|\$\s?\d|KES\s?\d|suggested|minimum|at least \d/i

beforeEach(() => {
  document.body.innerHTML = ''; localStorage.clear()
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

describe('stage 3: rendered output', () => {
  it('Home, empty state', async () => {
    const m = await mount(createElement(Home, { onSettings: () => undefined }))
    const t = m.text(); console.log('HOME DUMP:', t)
    expect(t).toContain('Edit any PDF. It never leaves your device.')
    expect(t).toContain('Your file stays on this device')
    expect(t).toContain('Open PDF'); expect(t).toContain('Merge files'); expect(t).toContain('0 bytes sent'); expect(t).toContain('Support myPDF')
    expect(t).toContain('Made with ❤️ by Brian Gachichio')
    expect(t).not.toMatch(dirty); expect(t).not.toContain('—')
    expect(m.host.querySelector('a[href="https://x.com/b_gachichio"]')?.getAttribute('rel')).toBe('noopener noreferrer')
    await m.unmount()
  })
  it('Settings sheet lists every control and the About group', async () => {
    const m = await mount(createElement(SettingsSheet, { open: true, onClose: () => undefined }))
    const t = m.text(); console.log('SETTINGS DUMP:', t)
    for (const s of ['Theme', 'Auto', 'Light', 'Dark', 'Text size', 'Compact', 'Default', 'Large', 'Extra large', 'Export defaults', 'About', 'Support myPDF', 'AGPL-3.0-or-later', 'mypdf.gachichio.org', 'Made with ❤️ by']) expect(t).toContain(s)
    expect(t).not.toMatch(dirty)
    await m.unmount()
  })
  it('Support sheet carries the exact values and no gift-size wording', async () => {
    const m = await mount(createElement(SupportSheet, { open: true, onClose: () => undefined }))
    const t = m.text(); console.log('SUPPORT DUMP:', t)
    expect(t).toContain(LIGHTNING_ADDRESS); expect(t).toContain(BTC_ADDRESS)
    expect(t).toContain('free and has no ads'); expect(t).toContain('Payments leave myPDF only when you tap. Your documents never do.')
    expect(t).toContain('Opens Paystack in a new tab'); expect(t).toContain('Instant, near-zero fees'); expect(t).toContain('Taproot address, any Bitcoin wallet')
    expect(t).not.toMatch(giftSize); expect(t).not.toMatch(dirty)
    const links = [...m.host.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links).toEqual(['https://paystack.shop/pay/gachichio', `lightning:${LIGHTNING_ADDRESS}`, `bitcoin:${BTC_ADDRESS}`])
    expect(m.host.querySelector('a[href^="https://paystack"]')?.getAttribute('target')).toBe('_blank')
    await m.unmount()
  })
  it('Privacy receipt chip is green and the panel states the facts', async () => {
    const m = await mount(createElement(PrivacyReceipt))
    expect(m.text()).toContain('0 bytes sent')
    await act(async () => { (m.host.querySelector('[data-testid="receipt-chip"]') as HTMLButtonElement).click() })
    const t = m.text(); console.log('RECEIPT DUMP:', t)
    expect(t).toContain('Nothing you opened has left this device.'); expect(t).toContain('Requests to other sites'); expect(t).not.toMatch(dirty)
    await m.unmount()
  })
})

describe('stage 5: edges in jsdom', () => {
  it('corrupt storage falls back to defaults', async () => {
    localStorage.setItem('ui.theme', '{"bad":'); localStorage.setItem('ui.fontScale', '99'); localStorage.setItem('export.compress', 'maybe')
    const { prefs } = await import('@/storage/prefs')
    expect(prefs.getTheme()).toBe('system'); expect(prefs.getFontScale()).toBe('default'); expect(prefs.getExportCompress()).toBe(true)
    const m = await mount(createElement(SettingsSheet, { open: true, onClose: () => undefined }))
    expect(m.text()).not.toMatch(dirty)
    await m.unmount()
  })
  it('storage that throws does not break the app', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const { prefs } = await import('@/storage/prefs')
    expect(prefs.getTheme()).toBe('system')
    spy.mockRestore()
  })
})
