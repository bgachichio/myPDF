// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared by the Canvas and its sheets.
import type { Rect } from '@/engine/PdfEngine'

/** Colours offered for pens and typed text. Names are for the screen reader. */
export const COLOURS = [{ name: 'Blue', value: '#1a3fb0' }, { name: 'Black', value: '#111111' }, { name: 'Red', value: '#c2410c' }, { name: 'Green', value: '#237352' }] as const

export type Pop = null | { kind: 'edit'; rect: Rect; value: string } | { kind: 'text'; rect: Rect; value: string; note: boolean } | { kind: 'link'; rect: Rect; mode: 'web' | 'page'; value: string }
