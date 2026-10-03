// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface SheetProps { open: boolean; title: string; onClose: () => void; children: ReactNode }

/** Bottom sheet with --r-xl top corners (BUILD-BRIEF section 8). Escape and the scrim close it. */
export default function Sheet({ open, title, onClose, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <>
      <button type="button" tabIndex={-1} aria-hidden="true" className="fixed inset-0 z-40 w-full h-full cursor-default" style={{ background: 'var(--md-scrim)', opacity: 0.32 }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title}
        className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto p-6 pb-10 flex flex-col gap-4 max-h-[85vh] overflow-y-auto [&>*]:shrink-0"
        style={{ background: 'var(--md-surface-container-low)', borderRadius: 'var(--r-xl) var(--r-xl) 0 0', color: 'var(--md-on-surface)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-ui)' }}>{title}</h2>
          <button aria-label={`Close ${title}`} className="flex items-center justify-center w-[44px] h-[44px] rounded-full" onClick={onClose}><X size={24} /></button>
        </div>
        {children}
      </div>
    </>
  )
}

export const primaryBtn = 'min-h-[48px] px-6 rounded-full font-medium disabled:opacity-40'
export const primaryStyle = { background: 'var(--md-primary)', color: 'var(--md-on-primary)' } as const
export const tonalBtn = 'min-h-[44px] px-4 rounded-full font-medium disabled:opacity-40'
export const tonalStyle = { background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' } as const
export const fieldStyle = { background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)' } as const
