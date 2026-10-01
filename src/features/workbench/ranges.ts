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
