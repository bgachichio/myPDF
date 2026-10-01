// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { getEngine } from '@/engine/mupdf/client'
import type { PageInfo } from '@/engine/PdfEngine'

interface ViewerProps {
  file: File
  onClose: () => void
}

type Phase = 'loading' | 'password' | 'ready' | 'error'

const RENDER_SCALE = 1.5

export default function Viewer({ file, onClose }: ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bytesRef = useRef<ArrayBuffer | null>(null)
  const docIdRef = useRef<string>('')
  const [phase, setPhase] = useState<Phase>('loading')
  const [pages, setPages] = useState<PageInfo[]>([])
  const [page, setPage] = useState(0)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function openWith(pw?: string) {
    setPhase('loading')
    try {
      bytesRef.current ??= await file.arrayBuffer()
      const result = await getEngine().open(bytesRef.current.slice(0), pw)
      if (result.needsPassword && !result.id) {
        setPhase('password')
        setMessage(pw ? 'That password did not work. Try again.' : '')
        return
      }
      docIdRef.current = result.id
      setPages(result.pages)
      setPage(0)
      setPhase('ready')
    } catch {
      setPhase('error')
      setMessage('This file could not be opened.')
    }
  }

  useEffect(() => {
    void openWith()
    return () => {
      if (docIdRef.current) void getEngine().close(docIdRef.current)
    }
    // eslint-disable-next-line
  }, [file])

  useEffect(() => {
    if (phase !== 'ready' || !docIdRef.current) return
    let cancelled = false
    void getEngine().render(docIdRef.current, page, RENDER_SCALE).then((bitmap) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
      bitmap.close()
      canvas.dataset.rendered = String(page)
    })
    return () => { cancelled = true }
  }, [phase, page])

  const navButton = 'flex items-center justify-center rounded-full w-11 h-11 disabled:opacity-40'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--md-surface)', color: 'var(--md-on-surface)' }}>
      <header className="flex items-center gap-2 px-4 h-14" style={{ borderBottom: '1px solid var(--md-outline-variant)' }}>
        <button aria-label="Back to home" className={navButton} onClick={onClose}><ArrowLeft size={24} /></button>
        <span className="flex-1 truncate" style={{ fontFamily: 'var(--font-ui)' }}>{file.name}</span>
        {phase === 'ready' && (
          <>
            <button aria-label="Previous page" className={navButton} disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={24} /></button>
            <span className="text-sm" aria-live="polite">{page + 1} / {pages.length}</span>
            <button aria-label="Next page" className={navButton} disabled={page >= pages.length - 1} onClick={() => setPage(page + 1)}><ChevronRight size={24} /></button>
          </>
        )}
      </header>
      <main className="flex-1 flex flex-col items-center gap-4 px-4 py-6">
        {phase === 'loading' && <p role="status">Opening your file on this device</p>}
        {phase === 'error' && <p role="alert">{message}</p>}
        {phase === 'password' && (
          <form className="flex flex-col gap-3 w-full max-w-sm" onSubmit={(e) => { e.preventDefault(); void openWith(password) }}>
            <label htmlFor="pdf-password">This file is password protected</label>
            <input id="pdf-password" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 rounded-xl px-4" style={{ background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)' }} />
            {message && <p role="alert" style={{ color: 'var(--md-error)' }}>{message}</p>}
            <button type="submit" className="min-h-12 rounded-full font-medium" style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)' }}>Unlock</button>
          </form>
        )}
        <canvas ref={canvasRef} aria-label={`Page ${page + 1} of ${file.name}`} hidden={phase !== 'ready'}
          className="max-w-full h-auto shadow-md" style={{ background: 'var(--paper)' }} />
      </main>
    </div>
  )
}
