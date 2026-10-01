// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { useAppearance } from '@/hooks/appearance-hooks.jsx'
import Sheet from '@/features/common/Sheet'
import { SupportButton } from '@/features/support/SupportSheet'
import { SIGN_OFF } from '@/config/support'
import { prefs } from '@/storage/prefs'

interface SettingsSheetProps { open: boolean; onClose: () => void }

const THEME_LABELS: Record<string, string> = { system: 'Auto', light: 'Light', dark: 'Dark' }
const SCALE_LABELS: Record<string, string> = { compact: 'Compact', default: 'Default', large: 'Large', xlarge: 'Extra large' }
const REPO = 'https://github.com/bgachichio/myPDF'

export default function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const { theme, setTheme, themes, fontScale, setFontScale, fontScales } = useAppearance()
  const [compress, setCompress] = useState(prefs.getExportCompress())
  const [strip, setStrip] = useState(prefs.getExportStripMetadata())
  const chip = (active: boolean) => ({ background: active ? 'var(--md-primary-container)' : 'var(--md-surface-container-highest)', color: active ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)', fontFamily: 'var(--font-ui)' } as const)
  const chipClass = 'px-4 py-2 rounded-full text-sm min-h-[44px] min-w-[5.5rem]'
  const heading = 'text-sm mb-3'
  const muted = { color: 'var(--md-on-surface-variant)' } as const

  return (
    <Sheet open={open} title="Settings" onClose={onClose}>
      <section aria-labelledby="set-theme">
        <p id="set-theme" className={heading} style={muted}>Theme</p>
        <div className="flex gap-2 flex-wrap" role="group" aria-labelledby="set-theme">
          {themes.map((t: string) => <button key={t} className={chipClass} aria-pressed={theme === t} style={chip(theme === t)} data-testid={`theme-${t}`} onClick={() => setTheme(t as 'system' | 'light' | 'dark')}>{THEME_LABELS[t]}</button>)}
        </div>
      </section>
      <section aria-labelledby="set-size">
        <p id="set-size" className={heading} style={muted}>Text size</p>
        <div className="flex gap-2 flex-wrap" role="group" aria-labelledby="set-size">
          {fontScales.map((s: string) => <button key={s} className={chipClass} aria-pressed={fontScale === s} style={chip(fontScale === s)} data-testid={`scale-${s}`} onClick={() => setFontScale(s as 'compact' | 'default' | 'large' | 'xlarge')}>{SCALE_LABELS[s]}</button>)}
        </div>
      </section>
      <section aria-labelledby="set-export">
        <p id="set-export" className={heading} style={muted}>Export defaults</p>
        <label className="flex items-center justify-between min-h-[44px] gap-3"><span>Compress when saving</span><input type="checkbox" className="w-6 h-6" checked={compress} data-testid="default-compress" onChange={(e) => { setCompress(e.target.checked); prefs.setExportCompress(e.target.checked) }} /></label>
        <label className="flex items-center justify-between min-h-[44px] gap-3"><span>Remove metadata when saving</span><input type="checkbox" className="w-6 h-6" checked={strip} data-testid="default-strip" onChange={(e) => { setStrip(e.target.checked); prefs.setExportStripMetadata(e.target.checked) }} /></label>
      </section>
      <section aria-labelledby="set-about" style={{ borderTop: '1px solid var(--md-outline-variant)', paddingTop: '1rem' }} className="flex flex-col gap-3">
        <p id="set-about" className={heading} style={muted}>About</p>
        <SupportButton className="self-start" />
        <a href={REPO} target="_blank" rel="noopener noreferrer" className="min-h-[44px] inline-flex items-center" style={{ color: 'var(--md-primary)' }} data-testid="source-link">Source code (GitHub, AGPL-3.0-or-later)</a>
        <p className="text-sm" style={muted}>mypdf.gachichio.org</p>
        <p className="text-sm" style={muted} data-testid="settings-signoff">{SIGN_OFF.text} <a href={SIGN_OFF.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--md-primary)' }}>{SIGN_OFF.name}</a></p>
      </section>
    </Sheet>
  )
}
