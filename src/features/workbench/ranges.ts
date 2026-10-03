// SPDX-License-Identifier: AGPL-3.0-or-later
/** Parse "1-3, 5, 8-" into zero-based page indexes, in order, without duplicates. Returns null when the text is not a valid range list. */
export function parseRanges(text: string, pageCount: number): number[] | null {
  const out: number[] = []
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+)?\s*-\s*(\d+)?$/.exec(part) ?? /^(\d+)$/.exec(part)
    if (!m) return null
    const a = m[1] ? Number(m[1]) : (part.includes('-') ? 1 : NaN)
    const b = part.includes('-') ? (m[2] ? Number(m[2]) : pageCount) : a
    if (!(a >= 1 && b >= a && b <= pageCount)) return null
    for (let i = a; i <= b; i++) if (!out.includes(i - 1)) out.push(i - 1)
  }
  return out.length ? out : null
}

/** Compress sorted zero-based indexes back into "1-3, 5". */
export function formatRanges(pages: number[]): string {
  const s = [...pages].sort((a, b) => a - b), parts: string[] = []
  for (let i = 0; i < s.length; i++) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    parts.push(j > i ? `${s[i] + 1}-${s[j] + 1}` : String(s[i] + 1))
    i = j
  }
  return parts.join(', ')
}

/** New page order after moving `moving` (sorted) so the first of them lands at `slot` (0..n among the remaining pages). */
export function reorder(count: number, moving: number[], slot: number): number[] {
  const rest = Array.from({ length: count }, (_, i) => i).filter((i) => !moving.includes(i))
  const at = Math.max(0, Math.min(slot, rest.length))
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)]
}

/** Groups of page indexes (0-based) for Split. Returns null when the input does not make sense. */
export function splitGroups(mode: 'every' | 'at' | 'ranges', n: number, text: string): number[][] | null {
  const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
  if (mode === 'every') {
    const k = Math.floor(Number(text))
    if (!Number.isFinite(k) || k < 1) return null
    const out: number[][] = []
    for (let i = 0; i < n; i += k) out.push(span(i, Math.min(n - 1, i + k - 1)))
    return out
  }
  if (mode === 'at') {
    const cuts = [...new Set(text.split(/[,\s]+/).filter(Boolean).map(Number))].sort((a, b) => a - b)
    if (!cuts.length || cuts.some((c) => !Number.isInteger(c) || c < 1 || c >= n)) return null
    const out: number[][] = []; let from = 0
    for (const c of cuts) { out.push(span(from, c - 1)); from = c }
    out.push(span(from, n - 1))
    return out
  }
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null
  const out: number[][] = []
  for (const p of parts) { const g = parseRanges(p, n); if (!g || !g.length) return null; out.push(g) }
  return out
}
