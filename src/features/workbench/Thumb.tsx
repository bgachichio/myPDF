// SPDX-License-Identifier: AGPL-3.0-or-later
import { memo, useEffect, useRef, useState } from 'react'
import { getEngine } from '@/engine/mupdf/client'

// One shared queue so a 300-page file never floods the engine worker (R02).
let chain: Promise<unknown> = Promise.resolve()
const enqueue = <T,>(job: () => Promise<T>): Promise<T> => { const p = chain.then(job, job); chain = p.catch(() => undefined); return p }

interface ThumbProps { docId: string; rev: number; index: number; width: number; height: number; rotation: number }

function Thumb({ docId, rev, index, width, height }: ThumbProps) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = host.current; if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    const scale = Math.min(0.6, (200 * Math.min(window.devicePixelRatio || 1, 2)) / Math.max(1, width))
    void enqueue(async () => {
      if (cancelled) return
      const bitmap = await getEngine().render(docId, index, scale)
      const c = canvas.current
      if (cancelled || !c) { bitmap.close(); return }
      c.width = bitmap.width; c.height = bitmap.height
      c.getContext('2d')?.drawImage(bitmap, 0, 0); bitmap.close()
      setReady(true)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [visible, docId, rev, index, width])

  return (
    <div ref={host} className="w-full rounded-lg overflow-hidden" style={{ aspectRatio: `${width} / ${height}`, background: 'var(--paper)', boxShadow: '0 0 0 1px var(--md-outline-variant)' }}>
      <canvas ref={canvas} className="w-full h-full block" data-ready={ready ? 'true' : 'false'} aria-hidden="true" />
    </div>
  )
}
export default memo(Thumb)
