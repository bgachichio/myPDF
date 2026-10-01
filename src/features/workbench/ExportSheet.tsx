// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { useSession } from '@/app/session'
import Sheet, { primaryBtn, primaryStyle, tonalBtn, tonalStyle, fieldStyle } from '@/features/common/Sheet'
import { canShareFiles, saveBytes, shareBytes } from '@/features/common/download'
import { prefs } from '@/storage/prefs'

export default function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, exportPdf, notify } = useSession()
  const [compress, setCompress] = useState(prefs.getExportCompress())
  const [strip, setStrip] = useState(prefs.getExportStripMetadata())
  const [password, setPassword] = useState('')
  const [title, setTitle] = useState('')
  const [working, setWorking] = useState(false)
  if (!session) return null
  const outName = session.name.replace(/\.pdf$/i, '') + (compress ? '-compressed' : '-edited') + '.pdf'

  const build = async () => {
    const bytes = await exportPdf({ compress, stripMetadata: strip, password: password || undefined })
    prefs.setExportCompress(compress); prefs.setExportStripMetadata(strip)
    return bytes
  }
  const doSave = async () => {
    setWorking(true)
    try {
      const { getEngine } = await import('@/engine/mupdf/client')
      if (title.trim() && !strip) await getEngine().setMetadata(session.id, { Title: title.trim() })
      const bytes = await build()
      const r = await saveBytes(outName, bytes)
      if (r !== 'cancelled') { notify(`Saved ${outName} (${(bytes.length / 1024).toFixed(0)} KB)${password ? ', password protected' : ''}`); onClose() }
    } catch { notify('Export failed') } finally { setWorking(false) }
  }
  const doShare = async () => {
    setWorking(true)
    try { const ok = await shareBytes(outName, await build()); if (ok) onClose() } finally { setWorking(false) }
  }
  const row = 'flex items-center justify-between min-h-[44px] gap-3'

  return (
    <Sheet open={open} title="Export" onClose={onClose}>
      <label className={row}><span>Compress (smaller images, tidy structure)</span><input type="checkbox" className="w-6 h-6" checked={compress} onChange={(e) => setCompress(e.target.checked)} data-testid="opt-compress" /></label>
      <label className={row}><span>Remove metadata (author, dates)</span><input type="checkbox" className="w-6 h-6" checked={strip} onChange={(e) => setStrip(e.target.checked)} data-testid="opt-strip" /></label>
      <label className="flex flex-col gap-1"><span>Open with a password (optional)</span>
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="opt-password" /></label>
      {!strip && <label className="flex flex-col gap-1"><span>Title (optional)</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} /></label>}
      <p className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>Your file stays on this device. Saving does not upload anything.</p>
      <button className={primaryBtn} style={primaryStyle} disabled={working} onClick={() => void doSave()} data-testid="export-save">{working ? 'Working' : 'Save PDF'}</button>
      {canShareFiles() && <button className={tonalBtn} style={tonalStyle} disabled={working} onClick={() => void doShare()}>Share</button>}
    </Sheet>
  )
}
