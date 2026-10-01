// SPDX-License-Identifier: AGPL-3.0-or-later
// File bytes live in OPFS (BUILD-BRIEF section 6): /docs/<docId>/original.pdf, /docs/<docId>/working.pdf, /inbox/<uuid>.pdf.
// Every call is best effort: OPFS can be unavailable (private windows, older Safari) and the app must still work.

async function dirAt(parts: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let dir = await navigator.storage.getDirectory()
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create })
  return dir
}

export const opfs = {
  async write(parts: string[], name: string, bytes: Uint8Array): Promise<boolean> {
    try {
      const dir = await dirAt(parts, true)
      const handle = await dir.getFileHandle(name, { create: true })
      const w = await handle.createWritable()
      await w.write(bytes as unknown as BufferSource)
      await w.close()
      return true
    } catch { return false }
  },
  async read(parts: string[], name: string): Promise<Uint8Array | null> {
    try {
      const dir = await dirAt(parts, false)
      const file = await (await dir.getFileHandle(name)).getFile()
      return new Uint8Array(await file.arrayBuffer())
    } catch { return null }
  },
  async remove(parts: string[], name: string): Promise<void> {
    try { await (await dirAt(parts, false)).removeEntry(name, { recursive: true }) } catch { /* already gone */ }
  },
}
