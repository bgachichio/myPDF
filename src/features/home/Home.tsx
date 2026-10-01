// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react'
import { FileType2, Merge, Settings } from 'lucide-react'
import { useSession } from '@/app/session'
import { SIGN_OFF } from '@/config/support'
import { idb, type Recent } from '@/storage/idb'
import { primaryBtn, primaryStyle, tonalBtn, tonalStyle } from '@/features/common/Sheet'
import PrivacyReceipt from '@/features/privacy-receipt/PrivacyReceipt'
import { SupportButton } from '@/features/support/SupportSheet'
import { check, getConfig, openCompanionSheet, useCompanionState } from '@/features/companion/companion'

export default function Home({ onSettings }: { onSettings: () => void }) {
  const { openFile, mergeFiles, openRecent, busy } = useSession()
  const open = useRef<HTMLInputElement>(null)
  const merge = useRef<HTMLInputElement>(null)
  const [recents, setRecents] = useState<Recent[]>([])
  const [now] = useState(Date.now)
  const companion = useCompanionState()
  useEffect(() => { void idb.recents().then(setRecents) }, [])
  // Once a companion is configured, look for it on arrival and whenever the window regains focus. Nothing is pinged before that.
  useEffect(() => {
    if (!getConfig()) return
    void check()
    const on = () => void check()
    window.addEventListener('focus', on); return () => window.removeEventListener('focus', on)
  }, [])
  // Desktop browsers that can hand back a file handle let Export save over the original (F12).
  const pickPdf = async () => {
    if (window.showOpenFilePicker) {
      try {
        const [h] = await window.showOpenFilePicker({ types: [{ description: 'PDF or image', accept: { 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] } }] })
        return void openFile(await h.getFile(), h)
      } catch (e) { if ((e as DOMException).name === 'AbortError') return }
    }
    open.current?.click()
  }
  const companionText = companion === 'running' ? 'Running' : companion === 'wrong-token' ? 'Token not accepted' : 'Not detected'
  const days = (t: number) => { const d = Math.floor((now - t) / 86_400_000); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago` }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--md-surface)', color: 'var(--md-on-surface)' }}>
      <header className="flex items-center justify-between px-4 h-14" style={{ borderBottom: '1px solid var(--md-outline-variant)' }}>
        <span className="flex items-center gap-2 font-bold text-lg" style={{ fontFamily: 'var(--font-narrative)', color: 'var(--md-primary)' }}><img src="/icons/icon.svg" width={32} height={32} alt="" aria-hidden="true" />myPDF</span>
        <button aria-label="Settings" className="flex items-center justify-center rounded-full w-[44px] h-[44px]" onClick={onSettings}><Settings size={24} /></button>
      </header>

      <main className="flex-1 flex flex-col items-center gap-6 px-4 py-10 w-full max-w-lg mx-auto">
        <img src="/icons/icon.svg" width={72} height={72} alt="myPDF logo" data-testid="logo" />
        <h1 className="hero-title">Edit any PDF. It never leaves your device.</h1>
        <p className="text-center text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>Your file stays on this device. Drop a PDF anywhere on this page, or choose one.</p>
        <input ref={open} type="file" accept="application/pdf,.pdf,image/png,image/jpeg" hidden data-testid="file-input"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f) }} />
        <input ref={merge} type="file" multiple accept="application/pdf,.pdf,image/png,image/jpeg,.png,.jpg,.jpeg" hidden data-testid="merge-input"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void mergeFiles(f) }} />
        <div className="flex flex-wrap justify-center gap-3">
          <button className={`${primaryBtn} min-w-44 min-h-[48px]`} style={primaryStyle} disabled={Boolean(busy)} onClick={() => void pickPdf()} data-testid="open-pdf">Open PDF</button>
          <button className={`${tonalBtn} min-h-[48px] flex items-center gap-2`} style={tonalStyle} disabled={Boolean(busy)} onClick={() => merge.current?.click()} data-testid="merge-files"><Merge size={20} aria-hidden="true" />Merge files</button>
        </div>
        <PrivacyReceipt />
        <section className="w-full rounded-2xl p-4 flex items-center gap-3" style={{ background: 'var(--md-surface-container-low)' }} aria-labelledby="companion-h">
          <FileType2 size={28} aria-hidden="true" style={{ color: 'var(--md-primary)' }} />
          <div className="flex-1 min-w-0"><h2 id="companion-h" className="font-medium">Word, Excel and PowerPoint</h2>
            <p className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>Companion: <span data-testid="companion-status">{companionText}</span></p></div>
          <button className={`${tonalBtn} shrink-0`} style={tonalStyle} data-testid="convert-office" onClick={() => openCompanionSheet(null)}>Convert to PDF</button>
        </section>
        {recents.length > 0 && (
          <section className="w-full" aria-labelledby="recents-h">
            <h2 id="recents-h" className="text-sm mb-2" style={{ color: 'var(--md-on-surface-variant)' }}>Recent</h2>
            <ul className="flex flex-col gap-2">
              {recents.map((r) => (
                <li key={r.docId}>
                  <button className="w-full min-h-[56px] rounded-2xl px-4 py-2 text-left flex flex-col" style={{ background: 'var(--md-surface-container-low)' }} data-testid="recent" onClick={() => void openRecent(r.docId, r.name)}>
                    <span className="truncate font-medium">{r.name}</span>
                    <span className="text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>{r.pages} {r.pages === 1 ? 'page' : 'pages'}, {days(r.updatedAt)}</span>
                  </button>
                </li>))}
            </ul>
          </section>)}
      </main>

      <footer className="px-4 py-4 flex flex-col items-center gap-3 text-sm" style={{ color: 'var(--md-on-surface-variant)', borderTop: '1px solid var(--md-outline-variant)' }}>
        <SupportButton />
        <span data-testid="home-signoff">{SIGN_OFF.text}{' '}<a href={SIGN_OFF.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--md-primary)' }}>{SIGN_OFF.name}</a></span>
      </footer>
    </div>
  )
}
