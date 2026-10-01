// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi } from 'vitest'

describe('first-run engine download progress', () => {
  it('reports rising percentages, never above 99 until the engine opens', async () => {
    const chunk = new Uint8Array(2_600_000)
    const stream = new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < 4; i++) c.enqueue(chunk); c.close() } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { status: 200 })))
    const { warmEngine } = await import('@/engine/mupdf/warm')
    const seen: number[] = []
    await warmEngine((p) => seen.push(p))
    expect(seen.length).toBe(4)
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
    expect(seen[0]).toBeGreaterThan(0); expect(seen.at(-1)).toBeLessThanOrEqual(99)
    await warmEngine(() => seen.push(-1)) // second call reuses the first download
    expect(seen).not.toContain(-1)
    vi.unstubAllGlobals()
  })
})
