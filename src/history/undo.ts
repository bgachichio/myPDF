// SPDX-License-Identifier: AGPL-3.0-or-later
// Snapshot undo stack (R11: at least 50 steps). Each entry is the whole document as saved bytes, so every edit,
// including ones the engine cannot invert (delete, redaction), undoes the same way. A byte budget bounds memory on big files.

export interface Snapshot { bytes: Uint8Array; marks: number }

export class UndoStack {
  private past: Snapshot[] = []
  private future: Snapshot[] = []
  constructor(private readonly maxSteps = 100, private readonly maxBytes = 400 * 1024 * 1024, private readonly minSteps = 50) {}

  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }
  get depth() { return this.past.length }

  /** Record the state before an edit. A new edit clears redo. */
  push(snapshot: Snapshot) {
    this.past.push(snapshot)
    this.future = []
    this.trim()
  }
  undo(current: Snapshot): Snapshot | null {
    const prev = this.past.pop()
    if (!prev) return null
    this.future.push(current)
    return prev
  }
  redo(current: Snapshot): Snapshot | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(current)
    return next
  }
  clear() { this.past = []; this.future = [] }

  private trim() {
    let total = this.past.reduce((n, s) => n + s.bytes.length, 0)
    while (this.past.length > this.maxSteps || (total > this.maxBytes && this.past.length > this.minSteps)) {
      total -= this.past.shift()!.bytes.length
    }
  }
}
