// SPDX-License-Identifier: AGPL-3.0-or-later
// Client for the optional local companion (C01, R14). It only ever talks to a loopback address the user configured; the CSP allows nothing else.
import { useSyncExternalStore } from 'react'

export const DEFAULT_URL = 'http://127.0.0.1:8787'
export const SETUP_URL = 'https://github.com/bgachichio/myPDF/tree/main/companion'
export const OFFICE_ACCEPT = '.docx,.doc,.xlsx,.xls,.pptx,.ppt,.odt,.ods,.odp,.rtf,.txt,.html,.htm,.csv'
const OFFICE = new Set(OFFICE_ACCEPT.split(','))
export const isOffice = (name: string) => OFFICE.has(name.slice(name.lastIndexOf('.')).toLowerCase())
export const isLoopbackUrl = (u: string) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?\/?$/.test(u.trim())

export interface CompanionConfig { url: string; token: string }
export type CompanionState = 'unconfigured' | 'checking' | 'running' | 'not-running' | 'wrong-token'

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

export function getConfig(): CompanionConfig | null {
  const token = read('companion.token'); if (!token) return null
  return { url: (read('companion.url') || DEFAULT_URL).replace(/\/$/, ''), token }
}
export function saveConfig(c: CompanionConfig) { write('companion.url', c.url.replace(/\/$/, '')); write('companion.token', c.token.trim()); setState('checking') }

let state: CompanionState = getConfig() ? 'checking' : 'unconfigured'
const listeners = new Set<() => void>()
function setState(s: CompanionState) { state = s; listeners.forEach((l) => l()) }
export const useCompanionState = (): CompanionState => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)

/** Ask the companion if it is there and whether the token is accepted. Never throws: a stopped companion is a normal state, not an error. */
export async function check(cfg: CompanionConfig | null = getConfig()): Promise<CompanionState> {
  if (!cfg || !isLoopbackUrl(cfg.url)) { setState('unconfigured'); return 'unconfigured' }
  try {
    const r = await fetch(`${cfg.url}/health`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(2500) })
    const s: CompanionState = r.ok ? 'running' : r.status === 401 ? 'wrong-token' : 'not-running'
    setState(s); return s
  } catch { setState('not-running'); return 'not-running' }
}

export async function convert(file: File, cfg: CompanionConfig): Promise<Uint8Array> {
  const r = await fetch(`${cfg.url}/convert`, {
    method: 'POST', body: file, signal: AbortSignal.timeout(150_000),
    headers: { Authorization: `Bearer ${cfg.token}`, 'X-Filename': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' },
  })
  if (!r.ok) { let m = `the companion returned ${r.status}`; try { m = (await r.json()).error ?? m } catch { /* keep default */ } throw new Error(m) }
  return new Uint8Array(await r.arrayBuffer())
}

// A tiny store so any screen can open the "Companion not running" sheet, with the file the user was trying to convert.
let sheet: { open: boolean; file: File | null } = { open: false, file: null }
const sheetListeners = new Set<() => void>()
export const openCompanionSheet = (file: File | null = null) => { sheet = { open: true, file }; sheetListeners.forEach((l) => l()) }
export const closeCompanionSheet = () => { sheet = { open: false, file: null }; sheetListeners.forEach((l) => l()) }
export const useCompanionSheet = () => useSyncExternalStore((l) => { sheetListeners.add(l); return () => sheetListeners.delete(l) }, () => sheet)
