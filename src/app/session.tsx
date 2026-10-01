// SPDX-License-Identifier: AGPL-3.0-or-later
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import * as Comlink from 'comlink'
import { getEngine, terminateEngine } from '@/engine/mupdf/client'
import type { PageInfo, SaveOptions } from '@/engine/PdfEngine'
import { UndoStack, type Snapshot } from '@/history/undo'
import { opfs } from '@/storage/opfs'
import { idb } from '@/storage/idb'

export interface Session { id: string; storageId: string; name: string; pages: PageInfo[]; rev: number; marks: number }
export interface PendingPassword { name: string; bytes: Uint8Array; storageId?: string; wrong: boolean }
type Engine = ReturnType<typeof getEngine>

interface SessionApi {
  session: Session | null
  busy: string | null
  toast: string | null
  pending: PendingPassword | null
  canUndo: boolean
  canRedo: boolean
  notify: (message: string) => void
  openFile: (file: File) => Promise<void>
  openRecent: (docId: string, name: string) => Promise<void>
  openInbox: (uuid: string) => Promise<void>
  unlock: (password: string) => Promise<void>
  cancelUnlock: () => void
  mergeFiles: (files: File[]) => Promise<void>
  addFiles: (files: File[], at?: number) => Promise<void>
  run: (label: string, fn: (engine: Engine, id: string) => Promise<void>, opts?: { marks?: number }) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  exportPdf: (opts: SaveOptions) => Promise<Uint8Array>
  extractPages: (pages: number[]) => Promise<Uint8Array>
  close: () => Promise<void>
}

const Ctx = createContext<SessionApi | null>(null)
export const useSession = () => { const c = useContext(Ctx); if (!c) throw new Error('SessionProvider missing'); return c }

const PLAIN: SaveOptions = { compress: false, stripMetadata: false }
const isImage = (f: File) => /^image\/(png|jpe?g)$/.test(f.type) || /\.(png|jpe?g)$/i.test(f.name)
const own = (b: Uint8Array) => b.slice().buffer as ArrayBuffer

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingPassword | null>(null)
  const history = useRef(new UndoStack())
  const [, force] = useState(0)
  const sessionRef = useRef<Session | null>(null)
  const persistTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  sessionRef.current = session

  const notify = useCallback((m: string) => { setToast(m); setTimeout(() => setToast((t) => (t === m ? null : t)), 4000) }, [])
  const apply = (s: Session | null) => { sessionRef.current = s; setSession(s) }

  const persistSoon = useCallback(() => {
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(async () => {
      const s = sessionRef.current
      if (!s) return
      const bytes = await getEngine().save(s.id, PLAIN)
      await opfs.write(['docs', s.storageId], 'working.pdf', bytes)
      await idb.putRecent({ docId: s.storageId, name: s.name, pages: s.pages.length, updatedAt: Date.now() })
    }, 800)
  }, [])

  const load = useCallback(async (name: string, bytes: Uint8Array, storageId: string | undefined, password?: string) => {
    if (bytes.length > 250 * 1024 * 1024) throw new Error('Files over 250 MB are not supported')
    const engine = getEngine()
    const prev = sessionRef.current
    const res = await engine.open(Comlink.transfer(own(bytes), [own(bytes)]) as ArrayBuffer, password)
    if (res.needsPassword && !res.id) { setPending({ name, bytes, storageId, wrong: Boolean(password) }); return false }
    if (res.pages.length > 5000) { void engine.close(res.id); throw new Error('Files over 5,000 pages are not supported') }
    if (prev) void engine.close(prev.id)
    const sid = storageId ?? crypto.randomUUID()
    if (!storageId) await opfs.write(['docs', sid], 'original.pdf', bytes)
    history.current.clear()
    apply({ id: res.id, storageId: sid, name, pages: res.pages, rev: 0, marks: 0 })
    setPending(null)
    persistSoon()
    return true
  }, [persistSoon])

  const guarded = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try { await fn() } catch (e) { notify(e instanceof Error && e.message ? `${label} failed: ${e.message}` : `${label} failed`) } finally { setBusy(null) }
  }, [notify])

  const openFile = useCallback((file: File) => guarded('Opening', async () => {
    if (isImage(file)) return void (await mergeFilesImpl([file]))
    await load(file.name, new Uint8Array(await file.arrayBuffer()), undefined)
  // eslint-disable-next-line
  }), [guarded, load])

  async function mergeFilesImpl(files: File[]) {
    const engine = getEngine()
    let targetBytes: Uint8Array | null = null
    const [first, ...rest] = files
    if (isImage(first)) {
      const id = await engine.imagesToPdf(files.filter(isImage))
      targetBytes = await engine.save(id, PLAIN); await engine.close(id)
      rest.splice(0, rest.length, ...files.filter((f) => !isImage(f)))
    } else targetBytes = new Uint8Array(await first.arrayBuffer())
    const base = await engine.open(Comlink.transfer(own(targetBytes), [own(targetBytes)]) as ArrayBuffer)
    if (!base.id) throw new Error('First file is password protected')
    for (const f of rest.filter((f) => !isImage(first) || !isImage(f))) await appendTo(engine, base.id, f, Infinity)
    const out = await engine.save(base.id, PLAIN)
    await engine.close(base.id)
    const name = files.length > 1 ? 'Merged.pdf' : first.name.replace(/\.(png|jpe?g)$/i, '') + '.pdf'
    await load(name, out, undefined)
  }
  async function appendTo(engine: Engine, id: string, f: File, at: number) {
    const count = (await engine.pages(id)).length
    const pos = Math.min(at, count)
    if (isImage(f)) {
      const src = await engine.imagesToPdf([f]); await engine.merge(id, src, pos); await engine.close(src)
    } else {
      const src = await engine.open(Comlink.transfer(await f.arrayBuffer(), []) as ArrayBuffer)
      if (!src.id) throw new Error(`${f.name} is password protected`)
      await engine.merge(id, src.id, pos); await engine.close(src.id)
    }
  }

  const mergeFiles = useCallback((files: File[]) => guarded('Merging', () => mergeFilesImpl(files)), [guarded]) // eslint-disable-line

  const addFiles = useCallback((files: File[], at = Infinity) => guarded('Adding pages', async () => {
    await runCore(async (engine, id) => {
      let pos = at
      for (const f of files) {
        const before = (await engine.pages(id)).length
        await appendTo(engine, id, f, pos)
        if (pos !== Infinity) pos += (await engine.pages(id)).length - before
      }
    })
  }), [guarded]) // eslint-disable-line

  const openRecent = useCallback((docId: string, name: string) => guarded('Opening', async () => {
    const bytes = await opfs.read(['docs', docId], 'working.pdf')
    if (!bytes) { await idb.deleteRecent(docId); throw new Error('The saved copy is no longer on this device') }
    await load(name, bytes, docId)
  }), [guarded, load])

  const openInbox = useCallback((uuid: string) => guarded('Opening shared file', async () => {
    const bytes = await opfs.read(['inbox'], `${uuid}.pdf`)
    if (!bytes) throw new Error('The shared file could not be read')
    await load('Shared.pdf', bytes, undefined)
    await opfs.remove(['inbox'], `${uuid}.pdf`)
  }), [guarded, load])

  const unlock = useCallback(async (password: string) => {
    const p = pending; if (!p) return
    await guarded('Unlocking', async () => { await load(p.name, p.bytes, p.storageId, password) })
  }, [pending, guarded, load])

  async function runCore(fn: (engine: Engine, id: string) => Promise<void>, opts?: { marks?: number }) {
    const s = sessionRef.current; if (!s) return
    const engine = getEngine()
    const before: Snapshot = { bytes: await engine.save(s.id, PLAIN), marks: s.marks }
    try { await fn(engine, s.id) } catch (e) {
      // restore the pre-edit state so a failed operation leaves nothing half-applied
      const r = await engine.open(Comlink.transfer(own(before.bytes), [own(before.bytes)]) as ArrayBuffer)
      void engine.close(s.id)
      apply({ ...s, id: r.id, pages: r.pages })
      throw e
    }
    history.current.push(before)
    apply({ ...s, pages: await engine.pages(s.id), rev: s.rev + 1, marks: opts?.marks ?? s.marks })
    persistSoon(); force((n) => n + 1)
  }
  const run = useCallback((label: string, fn: (engine: Engine, id: string) => Promise<void>, opts?: { marks?: number }) => guarded(label, () => runCore(fn, opts)), [guarded]) // eslint-disable-line

  const swapTo = async (snap: Snapshot) => {
    const s = sessionRef.current!; const engine = getEngine()
    const r = await engine.open(Comlink.transfer(own(snap.bytes), [own(snap.bytes)]) as ArrayBuffer)
    void engine.close(s.id)
    apply({ ...s, id: r.id, pages: r.pages, rev: s.rev + 1, marks: snap.marks })
    persistSoon(); force((n) => n + 1)
  }
  const undo = useCallback(() => guarded('Undo', async () => {
    const s = sessionRef.current; if (!s) return
    const cur: Snapshot = { bytes: await getEngine().save(s.id, PLAIN), marks: s.marks }
    const prev = history.current.undo(cur); if (prev) await swapTo(prev)
  }), [guarded]) // eslint-disable-line
  const redo = useCallback(() => guarded('Redo', async () => {
    const s = sessionRef.current; if (!s) return
    const cur: Snapshot = { bytes: await getEngine().save(s.id, PLAIN), marks: s.marks }
    const next = history.current.redo(cur); if (next) await swapTo(next)
  }), [guarded]) // eslint-disable-line

  const exportPdf = useCallback(async (opts: SaveOptions) => {
    const s = sessionRef.current; if (!s) throw new Error('No document')
    return getEngine().save(s.id, opts)
  }, [])
  const extractPages = useCallback(async (pages: number[]) => {
    const s = sessionRef.current; if (!s) throw new Error('No document')
    const engine = getEngine(); const id = await engine.extract(s.id, pages)
    const bytes = await engine.save(id, { compress: true, stripMetadata: false }); await engine.close(id)
    return bytes
  }, [])

  const close = useCallback(async () => {
    const s = sessionRef.current
    if (s) { clearTimeout(persistTimer.current); try { await opfs.write(['docs', s.storageId], 'working.pdf', await getEngine().save(s.id, PLAIN)); await idb.putRecent({ docId: s.storageId, name: s.name, pages: s.pages.length, updatedAt: Date.now() }) } catch { /* best effort */ } }
    if (s) void getEngine().close(s.id)
    history.current.clear(); apply(null); force((n) => n + 1)
    void terminateEngine // engine worker is recycled by the idle timer in client.ts
  }, [])

  const api = useMemo<SessionApi>(() => ({
    session, busy, toast, pending, canUndo: history.current.canUndo, canRedo: history.current.canRedo,
    notify, openFile, openRecent, openInbox, unlock, cancelUnlock: () => setPending(null), mergeFiles, addFiles, run, undo, redo, exportPdf, extractPages, close,
  }), [session, busy, toast, pending, notify, openFile, openRecent, openInbox, unlock, mergeFiles, addFiles, run, undo, redo, exportPdf, extractPages, close])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
