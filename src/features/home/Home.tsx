// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react'
import { FileText, Merge, Settings } from 'lucide-react'
import { useSession } from '@/app/session'
import { SIGN_OFF } from '@/config/support'
import { idb, type Recent } from '@/storage/idb'
import { primaryBtn, primaryStyle, tonalBtn, tonalStyle } from '@/features/common/Sheet'

export default function Home({ onSettings }: { onSettings: () => void }) {
  const { openFile, mergeFiles, openRecent, busy } = useSession()
  const open = useRef<HTMLInputElement>(null)
  const merge = useRef<HTMLInputElement>(null)
  const [recents, setRecents] = useState<Recent[]>([])
  useEffect(() => { void idb.recents().then(setRecents) }, [])
  const days = (t: number) => { const d = Math.floor((Date.now() - t) / 86_400_000); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago` }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--md-surface)', color: 'var(--md-on-surface)' }}>
      <header className="flex items-center justify-between px-4 h-14" style={{ borderBottom: '1px solid var(--md-outline-variant)' }}>
        <span className="font-bold text-lg" style={{ fontFamily: 'var(--font-ui)', color: 'var(--md-primary)' }}>myPDF</span>
        <button aria-label="Settings" className="flex items-center justify-center rounded-full w-11 h-11" onClick={onSettings}><Settings size={24} /></button>
      </header>

      <main className="flex-1 flex flex-col items-center gap-6 px-4 py-10 w-full max-w-lg mx-auto">
        <FileText size={64} style={{ color: 'var(--md-primary)' }} aria-hidden="true" />
        <h1 className="text-center" style={{ fontFamily: 'var(--font-narrative)', fontSize: '2rem', lineHeight: '2.5rem' }}>Edit any PDF. It never leaves your device.</h1>
        <p className="text-center text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>Your file stays on this device. Drop a PDF anywhere on this page, or choose one.</p>
        <input ref={open} type="file" accept="application/pdf,.pdf,image/png,image/jpeg" hidden data-testid="file-input"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f) }} />
        <input ref={merge} type="file" multiple accept="application/pdf,.pdf,image/png,image/jpeg,.png,.jpg,.jpeg" hidden data-testid="merge-input"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void mergeFiles(f) }} />
        <div className="flex flex-wrap justify-center gap-3">
          <button className={`${primaryBtn} min-w-44 min-h-12`} style={primaryStyle} disabled={Boolean(busy)} onClick={() => open.current?.click()} data-testid="open-pdf">Open PDF</button>
          <button className={`${tonalBtn} min-h-12 flex items-center gap-2`} style={tonalStyle} disabled={Boolean(busy)} onClick={() => merge.current?.click()} data-testid="merge-files"><Merge size={20} aria-hidden="true" />Merge files</button>
        </div>
        {recents.length > 0 && (
          <section className="w-full" aria-labelledby="recents-h">
            <h2 id="recents-h" className="text-sm mb-2" style={{ color: 'var(--md-on-surface-variant)' }}>Recent</h2>
            <ul className="flex flex-col gap-2">
              {recents.map((r) => (
                <li key={r.docId}>
                  <button className="w-full min-h-14 rounded-2xl px-4 py-2 text-left flex flex-col" style={{ background: 'var(--md-surface-container-low)' }} data-testid="recent" onClick={() => void openRecent(r.docId, r.name)}>
                    <span className="truncate font-medium">{r.name}</span>
                    <span className="text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>{r.pages} {r.pages === 1 ? 'page' : 'pages'}, {days(r.updatedAt)}</span>
                  </button>
                </li>))}
            </ul>
          </section>)}
      </main>

      <footer className="px-4 py-4 text-center text-sm" style={{ color: 'var(--md-on-surface-variant)', borderTop: '1px solid var(--md-outline-variant)' }}>
        {SIGN_OFF.text}{' '}<a href={SIGN_OFF.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--md-primary)' }}>{SIGN_OFF.name}</a>
      </footer>
    </div>
  )
}
