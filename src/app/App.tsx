// SPDX-License-Identifier: AGPL-3.0-or-later
import { lazy, Suspense, useEffect, useState } from 'react'
import { SessionProvider, useSession } from '@/app/session'
import { useRoute } from '@/app/router'
import Home from '@/features/home/Home'
// The editor screens load when a document opens, so the first screen paints from a small bundle.
const Workbench = lazy(() => import('@/features/workbench/Workbench'))
const Canvas = lazy(() => import('@/features/canvas/Canvas'))
import SettingsSheet from '@/features/settings/SettingsSheet'
import PasswordSheet from '@/features/common/PasswordSheet'

interface LaunchQueue { setConsumer(cb: (params: { files: FileSystemFileHandle[] }) => void): void }

function Shell() {
  const { session, busy, toast, notify, openFile, openInbox, undo, redo, close } = useSession()
  const { route, canvasPage, openCanvas, toWork } = useRoute(Boolean(session))
  const [settings, setSettings] = useState(false)
  const [dropping, setDropping] = useState(false)

  // Android share target: the service worker parked the file in OPFS and redirected here with ?open=inbox/<uuid>.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('open')
    const m = /^inbox\/([0-9a-f-]{36})$/.exec(q ?? '')
    if (m) { history.replaceState(null, '', '/'); void openInbox(m[1]) }
    else if (q === 'failed') { history.replaceState(null, '', '/'); notify('The shared file could not be received. Open myPDF and choose the file instead.') }
    // desktop file handler (file_handlers in the manifest)
    ;(window as unknown as { launchQueue?: LaunchQueue }).launchQueue?.setConsumer(async ({ files }) => { if (files[0]) void openFile(await files[0].getFile()) })
  }, [openInbox, openFile, notify])

  // Drag and drop anywhere (F01).
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); setDropping(true) } }
    const leave = (e: DragEvent) => { if (e.relatedTarget === null) setDropping(false) }
    const drop = (e: DragEvent) => { e.preventDefault(); setDropping(false); const f = e.dataTransfer?.files[0]; if (f) void openFile(f) }
    window.addEventListener('dragover', over); window.addEventListener('dragleave', leave); window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop) }
  }, [openFile])

  // Undo and redo from the keyboard (R11).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); void (e.shiftKey ? redo() : undo()) }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); void redo() }
    }
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on)
  }, [undo, redo])

  return (
    <>
      {route === 'home' && <Home onSettings={() => setSettings(true)} />}
      <Suspense fallback={<output className="block p-6 text-center" data-testid="loading">Opening your file on this device</output>}>
        {route === 'work' && <Workbench onBack={() => void close()} onEdit={openCanvas} onSettings={() => setSettings(true)} />}
        {route === 'canvas' && <Canvas startPage={canvasPage} onBack={toWork} onSettings={() => setSettings(true)} />}
      </Suspense>
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
      <PasswordSheet />
      {busy && <output className="block fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2 rounded-full text-sm" style={{ background: 'var(--md-inverse-surface)', color: 'var(--md-inverse-on-surface)' }} data-testid="busy">{busy}</output>}
      {toast && <output aria-live="polite" className="block fixed bottom-24 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] px-5 py-3 rounded-2xl text-sm" style={{ background: 'var(--md-inverse-surface)', color: 'var(--md-inverse-on-surface)' }} data-testid="toast">{toast}</output>}
      {dropping && <div className="fixed inset-0 z-50 flex items-center justify-center text-xl pointer-events-none" style={{ background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)', opacity: 0.92 }}>Drop a PDF to open it</div>}
    </>
  )
}

export default function App() { return <SessionProvider><Shell /></SessionProvider> }
