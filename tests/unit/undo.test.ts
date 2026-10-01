// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { UndoStack, type Snapshot } from '@/history/undo'

const snap = (n: number, size = 10): Snapshot => ({ bytes: new Uint8Array(size).fill(n), marks: 0 })

describe('UndoStack (R11)', () => {
  it('undoes and redoes 60 steps in order', () => {
    const h = new UndoStack()
    for (let i = 0; i < 60; i++) h.push(snap(i))
    let current = snap(60)
    for (let i = 59; i >= 0; i--) { const prev = h.undo(current)!; expect(prev.bytes[0]).toBe(i); current = prev }
    expect(h.canUndo).toBe(false)
    for (let i = 1; i <= 60; i++) { const next = h.redo(current)!; expect(next.bytes[0]).toBe(i); current = next }
    expect(h.canRedo).toBe(false)
  })
  it('a new edit clears redo', () => {
    const h = new UndoStack()
    h.push(snap(1)); h.undo(snap(2)); expect(h.canRedo).toBe(true)
    h.push(snap(3)); expect(h.canRedo).toBe(false)
  })
  it('keeps at least 50 steps even over the byte budget, then trims', () => {
    const h = new UndoStack(100, 100, 50)
    for (let i = 0; i < 80; i++) h.push(snap(i, 10))
    expect(h.depth).toBe(50)
  })
})
