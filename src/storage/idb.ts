// SPDX-License-Identifier: AGPL-3.0-or-later
// IndexedDB database `mypdf` v1 (BUILD-BRIEF section 6): recents and signatures. Best effort, never throws to the UI.

export interface Recent { docId: string; name: string; pages: number; updatedAt: number }
export interface SavedSignature { id: string; kind: 'draw' | 'type' | 'image'; png: Blob; createdAt: number }

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
  putSignature: (s: SavedSignature) => tx('signatures', 'readwrite', (st) => st.put(s)),
  deleteSignature: (id: string) => tx('signatures', 'readwrite', (st) => st.delete(id)),
  async signatures(): Promise<SavedSignature[]> {
    const all = (await tx<SavedSignature[]>('signatures', 'readonly', (s) => s.getAll())) ?? []
    return all.sort((a, b) => b.createdAt - a.createdAt)
  },
}
