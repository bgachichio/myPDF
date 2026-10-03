// SPDX-License-Identifier: AGPL-3.0-or-later
// Ready-made things to find for redaction (F7): the kinds of text people most often need to black out before sharing a file.

export interface Preset { id: string; label: string; re: RegExp }

export const PRESETS: Preset[] = [
  { id: 'email', label: 'Email addresses', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  // Kenyan numbers (+254 7.., 07.., 01..) and international numbers written with a plus sign.
  { id: 'phone', label: 'Phone numbers', re: /(?:\+254|254|0)[\s-]?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}|\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g },
  { id: 'long', label: 'Long numbers (IDs, accounts)', re: /\b\d{8,}\b/g },
  // KRA PIN: a letter, nine digits, a letter.
  { id: 'kra', label: 'KRA PINs', re: /\b[AP]\d{9}[A-Z]\b/g },
]

/** Every distinct match in `text`, trimmed, in the order first seen. */
export function findMatches(text: string, re: RegExp): string[] {
  const seen = new Set<string>()
  for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) { const t = m[0].trim(); if (t) seen.add(t) }
  return [...seen]
}
