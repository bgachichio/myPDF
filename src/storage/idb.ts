// SPDX-License-Identifier: AGPL-3.0-or-later
// IndexedDB database `mypdf` v1 (BUILD-BRIEF section 6): recents and signatures. Best effort, never throws to the UI.

export interface Recent { docId: string; name: string; pages: number; updatedAt: number }
/** `role` was added on 03-10-2026 (initials). Records without it are signatures. No database version change: IndexedDB stores any extra field. */
export interface SavedSignature { id: string; kind: 'draw' | 'type' | 'image'; role?: 'signature' | 'initials'; png: Blob; createdAt: number }
// Stored as raw bytes plus a type: Safari and WebKit are unreliable at keeping Blobs in IndexedDB (decision log 01-10-2026). Older records that hold a Blob are still read.
interface StoredSignature { id: string; kind: SavedSignature['kind']; role?: SavedSignature['role']; bytes?: ArrayBuffer; type?: string; png?: Blob; createdAt: number }

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('mypdf', 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('recents', { keyPath: 'docId' })
      req.result.createObjectStore('signatures', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const d = await db()
    return await new Promise<T>((resolve, reject) => {
      const req = fn(d.transaction(store, mode).objectStore(store))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch { return undefined }
}

export const idb = {
  putRecent: (r: Recent) => tx('recents', 'readwrite', (s) => s.put(r)),
  deleteRecent: (docId: string) => tx('recents', 'readwrite', (s) => s.delete(docId)),
  async recents(): Promise<Recent[]> {
    const all = (await tx<Recent[]>('recents', 'readonly', (s) => s.getAll())) ?? []
    return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12)
  },
  async putSignature(sig: SavedSignature) {
    const rec: StoredSignature = { id: sig.id, kind: sig.kind, role: sig.role ?? 'signature', bytes: await sig.png.arrayBuffer(), type: sig.png.type || 'image/png', createdAt: sig.createdAt }
    return tx('signatures', 'readwrite', (st) => st.put(rec))
  },
  deleteSignature: (id: string) => tx('signatures', 'readwrite', (st) => st.delete(id)),
  async signatures(): Promise<SavedSignature[]> {
    const all = (await tx<StoredSignature[]>('signatures', 'readonly', (s) => s.getAll())) ?? []
    return all
      .map((r) => ({ id: r.id, kind: r.kind, role: r.role ?? 'signature' as const, createdAt: r.createdAt, png: r.png instanceof Blob ? r.png : new Blob([r.bytes ?? new ArrayBuffer(0)], { type: r.type || 'image/png' }) }))
      .sort((a, b) => b.createdAt - a.createdAt)
  },
}
