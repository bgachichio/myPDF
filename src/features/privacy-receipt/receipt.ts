// SPDX-License-Identifier: AGPL-3.0-or-later
// Privacy Receipt (F14). Counts what this page has asked the network for since launch. It reports what the browser tells the page:
// resource-timing entries (cross-origin ones are the ones that matter) and security-policy violations (attempts the CSP blocked).
// Requests made inside workers are covered by the same CSP, which is the real guarantee; the R13 test proves both.
import { useSyncExternalStore } from 'react'

export interface Receipt { sameOrigin: number; otherOrigins: number; blocked: number; documentsOpened: number; since: number }

let state: Receipt = { sameOrigin: 0, otherOrigins: 0, blocked: 0, documentsOpened: 0, since: Date.now() }
const listeners = new Set<() => void>()
const emit = (next: Partial<Receipt>) => { state = { ...state, ...next }; listeners.forEach((l) => l()) }

export function startReceipt() {
  if (typeof PerformanceObserver === 'undefined') return
  const count = (entries: PerformanceEntryList) => {
    let same = 0, other = 0
    for (const e of entries) {
      try { if (new URL(e.name).origin === location.origin) same++; else other++ } catch { /* data: and blob: URLs are local */ }
    }
    if (same || other) emit({ sameOrigin: state.sameOrigin + same, otherOrigins: state.otherOrigins + other })
  }
  count(performance.getEntriesByType('resource'))
  new PerformanceObserver((l) => count(l.getEntries())).observe({ type: 'resource', buffered: false })
  document.addEventListener('securitypolicyviolation', () => emit({ blocked: state.blocked + 1 }))
}
export const noteDocumentOpened = () => emit({ documentsOpened: state.documentsOpened + 1 })

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }
export const useReceipt = (): Receipt => useSyncExternalStore(subscribe, () => state)
