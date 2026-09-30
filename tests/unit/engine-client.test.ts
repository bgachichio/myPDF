// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi } from 'vitest'

// Mock the Worker and Comlink so tests run in Node
vi.mock('comlink', () => ({
  wrap: vi.fn(() => ({})),
  expose: vi.fn(),
}))

describe('engine client', () => {
  it('getEngine returns a client', async () => {
    const { getEngine } = await import('@/engine/mupdf/client')
    expect(getEngine).toBeDefined()
  })
})
