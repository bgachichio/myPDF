// SPDX-License-Identifier: AGPL-3.0-or-later
import { useRef } from 'react'
import { FileText, Settings } from 'lucide-react'
import { useAppearance } from '@/hooks/appearance-hooks.jsx'
import { SIGN_OFF } from '@/config/support'

interface HomeProps {
  onSettings: () => void
  onOpen: (file: File) => void
}

export default function Home({ onSettings, onOpen }: HomeProps) {
  const input = useRef<HTMLInputElement>(null)
  const { theme } = useAppearance()
  void theme // used by the hook to track state

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--md-surface)', color: 'var(--md-on-surface)' }}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 h-14" style={{ borderBottom: '1px solid var(--md-outline-variant)' }}>
        <span className="font-bold text-lg" style={{ fontFamily: 'var(--font-ui)', color: 'var(--md-primary)' }}>myPDF</span>
        <button
          aria-label="Settings"
          className="flex items-center justify-center rounded-full w-11 h-11"
          style={{ background: 'transparent' }}
          onClick={onSettings}
        >
          <Settings size={24} />
        </button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-12">
        <FileText size={64} style={{ color: 'var(--md-primary)' }} />
        <p className="text-center text-lg" style={{ fontFamily: 'var(--font-ui)' }}>
          Your private PDF editor
        </p>
        <p className="text-center text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>
          Your file stays on this device
        </p>
        <input ref={input} type="file" accept="application/pdf,.pdf" hidden data-testid="file-input"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onOpen(f); e.target.value = '' }} />
        <button
          onClick={() => input.current?.click()}
          className="px-8 py-3 rounded-full font-medium text-base min-w-44 min-h-11"
          style={{
            background: 'var(--md-primary)',
            color: 'var(--md-on-primary)',
            fontFamily: 'var(--font-ui)',
          }}
        >
          Open PDF
        </button>
      </main>

      {/* Footer */}
      <footer className="px-4 py-4 text-center text-sm" style={{ color: 'var(--md-on-surface-variant)', borderTop: '1px solid var(--md-outline-variant)' }}>
        {SIGN_OFF.text}{' '}
        <a href={SIGN_OFF.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--md-primary)' }}>
          {SIGN_OFF.name}
        </a>
      </footer>
    </div>
  )
}
