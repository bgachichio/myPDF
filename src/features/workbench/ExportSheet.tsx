// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react'
import { useSession } from '@/app/session'
import { getEngine } from '@/engine/mupdf/client'
import Sheet, { primaryBtn, primaryStyle, tonalBtn, tonalStyle, fieldStyle } from '@/features/common/Sheet'
import { canShareFiles, saveBytes, saveInPlace, shareBytes } from '@/features/common/download'
import { prefs } from '@/storage/prefs'
import { buildDocx } from '@/features/export/docx'

const META = ['Title', 'Author', 'Subject', 'Keywords'] as const

export default function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, exportPdf, notify } = useSession()
  const [compress, setCompress] = useState(prefs.getExportCompress())
  const [strip, setStrip] = useState(prefs.getExportStripMetadata())
  const [password, setPassword] = useState('')
  const [meta, setMeta] = useState<Record<string, string>>({ Title: '', Author: '', Subject: '', Keywords: '' })
  const [working, setWorking] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const sid = session?.id

  // Prefill the document properties each time the sheet opens, from the file as it stands now.
  useEffect(() => {
    if (!open || !sid) return
    void getEngine().getMetadata(sid).then(setMeta).catch(() => undefined)
  }, [open, sid])

  if (!session) return null
  const handle = session.handle
  const outName = session.name.replace(/\.pdf$/i, '') + (compress ? '-compressed' : '-edited') + '.pdf'

  const build = async () => {
    if (!strip) { const filled = Object.fromEntries(META.map((k) => [k, meta[k] ?? ''])); await getEngine().setMetadata(session.id, filled) }
    const bytes = await exportPdf({ compress, stripMetadata: strip, password: password || undefined, decrypt: true })
    prefs.setExportCompress(compress); prefs.setExportStripMetadata(strip)
    return bytes
  }
  const doSave = async () => {
    setWorking(true)
    try {
      const bytes = await build()
      const r = await saveBytes(outName, bytes)
      if (r !== 'cancelled') { notify(`Saved ${outName} (${(bytes.length / 1024).toFixed(0)} KB)${password ? ', password protected' : ''}`); onClose() }
    } catch { notify('Export failed') } finally { setWorking(false) }
  }
  const doReplace = async () => {
    if (!handle) return
    if (!confirmReplace) { setConfirmReplace(true); setTimeout(() => setConfirmReplace(false), 5000); return }
    setWorking(true)
    try {
      const bytes = await build()
      if (await saveInPlace(handle, bytes)) { notify(`Replaced ${handle.name} (${(bytes.length / 1024).toFixed(0)} KB)${password ? ', password protected' : ''}`); onClose() }
      else notify('Permission to change the original file was not given')
    } catch { notify('Could not write to the original file') } finally { setWorking(false); setConfirmReplace(false) }
  }
  const doWord = async () => {
    setWorking(true)
    try {
      const { paragraphs, bodySize } = await getEngine().structure(session.id)
      if (!paragraphs.length) return notify('No text found. If these pages are scans, run OCR first, then try again.')
      const bytes = buildDocx(paragraphs, bodySize, session.name.replace(/\.pdf$/i, ''))
      const r = await saveBytes(session.name.replace(/\.pdf$/i, '') + '.docx', bytes, 'docx')
      if (r !== 'cancelled') { notify(`Saved ${session.name.replace(/\.pdf$/i, '')}.docx (${paragraphs.length} paragraphs)`); onClose() }
    } catch { notify('Word export failed') } finally { setWorking(false) }
  }
  const doShare = async () => {
    setWorking(true)
    try { const ok = await shareBytes(outName, await build()); if (ok) onClose() } finally { setWorking(false) }
  }
  const row = 'flex items-center justify-between min-h-[44px] gap-3'

  return (
    <Sheet open={open} title="Export" onClose={() => { setConfirmReplace(false); onClose() }}>
      <label className={row}><span>Compress (smaller images, tidy structure)</span><input type="checkbox" className="w-6 h-6" checked={compress} onChange={(e) => setCompress(e.target.checked)} data-testid="opt-compress" /></label>
      <label className={row}><span>Remove metadata (author, dates)</span><input type="checkbox" className="w-6 h-6" checked={strip} onChange={(e) => setStrip(e.target.checked)} data-testid="opt-strip" /></label>
      <label className="flex flex-col gap-1"><span>Open with a password (optional)</span>
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="opt-password" /></label>
      {!strip && (
        <fieldset className="flex flex-col gap-3" data-testid="meta-fields"><legend className="mb-1">Document properties</legend>
          {META.map((k) => <label key={k} className="flex flex-col gap-1"><span>{k}</span>
            <input value={meta[k] ?? ''} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid={`meta-${k.toLowerCase()}`} /></label>)}
        </fieldset>)}
      <p className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>Your file stays on this device. Saving does not upload anything.</p>
      <button className={primaryBtn} style={primaryStyle} disabled={working} onClick={() => void doSave()} data-testid="export-save">{working ? 'Working' : 'Save PDF'}</button>
      {handle && <button className={tonalBtn} style={confirmReplace ? { background: 'var(--md-error)', color: 'var(--md-on-error)' } : tonalStyle} disabled={working} onClick={() => void doReplace()} data-testid="export-replace">{confirmReplace ? `Tap again to replace ${handle.name}` : `Save over the original (${handle.name})`}</button>}
      <button className={tonalBtn} style={tonalStyle} disabled={working} onClick={() => void doWord()} data-testid="export-word">Save as Word (.docx)</button>
      <p className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>Word export keeps text, headings, bold and italic. Tables, columns, images and exact layout are not kept.</p>
      {canShareFiles() && <button className={tonalBtn} style={tonalStyle} disabled={working} onClick={() => void doShare()}>Share</button>}
    </Sheet>
  )
}
