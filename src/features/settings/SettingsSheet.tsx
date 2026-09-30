// SPDX-License-Identifier: AGPL-3.0-or-later
import { X } from 'lucide-react'
import { useAppearance } from '@/hooks/appearance-hooks.jsx'

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
}

const THEME_LABELS: Record<string, string> = { system: 'Auto', light: 'Light', dark: 'Dark' }
const SCALE_LABELS: Record<string, string> = { compact: 'Compact', default: 'Default', large: 'Large', xlarge: 'Extra large' }

export default function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const { theme, setTheme, themes, fontScale, setFontScale, fontScales } = useAppearance()

  if (!open) return null

  return (
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'var(--md-scrim)', opacity: 0.32 }}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-label="Settings"
        className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto p-6 pb-10 flex flex-col gap-6"
        style={{
          background: 'var(--md-surface-container-low)',
          borderRadius: 'var(--r-xl, 1.75rem) var(--r-xl, 1.75rem) 0 0',
          color: 'var(--md-on-surface)',
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-ui)' }}>Settings</h2>
          <button
            aria-label="Close settings"
            className="flex items-center justify-center w-11 h-11 rounded-full"
            onClick={onClose}
          >
            <X size={24} />
          </button>
        </div>

        {/* Theme */}
        <section>
          <p className="text-sm mb-3" style={{ color: 'var(--md-on-surface-variant)' }}>Theme</p>
          <div className="flex gap-2 flex-wrap">
            {themes.map((t) => (
              <button
                key={t}
                className="px-4 py-2 rounded-full text-sm min-h-11 min-w-[5.5rem]"
                style={{
                  background: theme === t ? 'var(--md-secondary-container)' : 'var(--md-surface-container-highest)',
                  color: theme === t ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface)',
                  fontFamily: 'var(--font-ui)',
                }}
                onClick={() => setTheme(t as 'system' | 'light' | 'dark')}
              >
                {THEME_LABELS[t]}
              </button>
            ))}
          </div>
        </section>

        {/* Font scale */}
        <section>
          <p className="text-sm mb-3" style={{ color: 'var(--md-on-surface-variant)' }}>Text size</p>
          <div className="flex gap-2 flex-wrap">
            {fontScales.map((s) => (
              <button
                key={s}
                className="px-4 py-2 rounded-full text-sm min-h-11 min-w-[5.5rem]"
                style={{
                  background: fontScale === s ? 'var(--md-secondary-container)' : 'var(--md-surface-container-highest)',
                  color: fontScale === s ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface)',
                  fontFamily: 'var(--font-ui)',
                }}
                onClick={() => setFontScale(s as 'compact' | 'default' | 'large' | 'xlarge')}
              >
                {SCALE_LABELS[s]}
              </button>
            ))}
          </div>
        </section>

        {/* About */}
        <section style={{ borderTop: '1px solid var(--md-outline-variant)', paddingTop: '1rem' }}>
          <p className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>
            myPDF - AGPL-3.0-or-later
          </p>
          <a
            href="https://github.com/bgachichio/mypdf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm"
            style={{ color: 'var(--md-primary)' }}
          >
            Source code on GitHub
          </a>
        </section>
      </div>
    </>
  )
}
