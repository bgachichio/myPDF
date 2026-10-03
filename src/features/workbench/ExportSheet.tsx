// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react'
import { useSession } from '@/app/session'
import { getEngine } from '@/engine/mupdf/client'
import Sheet, { primaryBtn, primaryStyle, tonalBtn, tonalStyle, fieldStyle } from '@/features/common/Sheet'
import { canShareFiles, saveBytes, saveInPlace, shareBytes } from '@/features/common/download'
import SignPanel from '@/features/signing/SignPanel'
import { prefs } from '@/storage/prefs'
import { buildDocx } from '@/features/export/docx'

const META = ['Title', 'Author', 'Subject', 'Keywords'] as const
const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export default function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, exportPdf, notify } = useSession()
  const [compress, setCompress] = useState(prefs.getExportCompress())
  const [strip, setStrip] = useState(prefs.getExportStripMetadata())
  const [password, setPassword] = useState('')
  const [owner, setOwner] = useState('')
  const [allow, setAllow] = useState({ print: true, copy: true, edit: true })
  const [meta, setMeta] = useState<Record<string, string>>({ Title: '', Author: '', Subject: '', Keywords: '' })
  const [typedName, setTypedName] = useState<string | null>(null)
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
  const stem = session.name.replace(/\.pdf$/i, '')
  const suggested = stem + (compress ? '-compressed' : '-edited')
  const outName = (typedName ?? suggested).replace(/[\\/:*?"<>|]+/g, '-').replace(/\.pdf$/i, '').trim().slice(0, 120) + '.pdf'
  const restricted = !allow.print || !allow.copy || !allow.edit

  const build = async () => {
    if (restricted && !owner) throw new Error('Add an owner password to apply these limits. It is the password that lets you change them later.')
    if (owner && owner === password) throw new Error('Use a different owner password from the open password')
    if (!strip) { const filled = Object.fromEntries(META.map((k) => [k, meta[k] ?? ''])); await getEngine().setMetadata(session.id, filled) }
    const bytes = await exportPdf({ compress, stripMetadata: strip, password: password || undefined, decrypt: true, ownerPassword: owner || undefined, restrict: owner ? allow : undefined })
    prefs.setExportCompress(compress); prefs.setExportStripMetadata(strip)
    return bytes
  }
  const sizeNote = (bytes: number) => {
    const was = session.size
    if (!was) return kb(bytes)
    const change = Math.round((1 - bytes / was) * 100)
    return change === 0 ? `${kb(bytes)}, the same size as the original` : `${kb(bytes)}, ${Math.abs(change)}% ${change > 0 ? 'smaller' : 'larger'} than the original ${kb(was)}`
  }
  const fail = (e: unknown, fallback: string) => notify(e instanceof Error && e.message ? e.message : fallback)
  const doSave = async () => {
    setWorking(true)
    try {
      const bytes = await build()
      const r = await saveBytes(outName, bytes)
      if (r !== 'cancelled') { notify(`Saved ${outName} (${sizeNote(bytes.length)})${password ? ', password protected' : ''}${owner ? ', limits applied' : ''}`); onClose() }
    } catch (e) { fail(e, 'Export failed') } finally { setWorking(false) }
  }
  const doReplace = async () => {
    if (!handle) return
    if (!confirmReplace) { setConfirmReplace(true); setTimeout(() => setConfirmReplace(false), 5000); return }
    setWorking(true)
    try {
      const bytes = await build()
      if (await saveInPlace(handle, bytes)) { notify(`Replaced ${handle.name} (${sizeNote(bytes.length)})${password ? ', password protected' : ''}`); onClose() }
      else notify('Permission to change the original file was not given')
    } catch (e) { fail(e, 'Could not write to the original file') } finally { setWorking(false); setConfirmReplace(false) }
  }
  const doWord = async () => {
    setWorking(true)
    try {
      const { paragraphs, bodySize } = await getEngine().structure(session.id)
      if (!paragraphs.length) return notify('No text found. If these pages are scans, run OCR first, then try again.')
      const bytes = buildDocx(paragraphs, bodySize, stem)
      const r = await saveBytes(stem + '.docx', bytes, 'docx')
      if (r !== 'cancelled') { notify(`Saved ${stem}.docx (${paragraphs.length} paragraphs)`); onClose() }
    } catch { notify('Word export failed') } finally { setWorking(false) }
  }
  const doShare = async () => {
    setWorking(true)
    try { const ok = await shareBytes(outName, await build()); if (ok) onClose() } catch (e) { fail(e, 'Sharing failed') } finally { setWorking(false) }
  }
  const row = 'flex items-center justify-between min-h-[44px] gap-3'
  const sub = { color: 'var(--md-on-surface-variant)' } as const

  return (
    <Sheet open={open} title="Export" onClose={() => { setConfirmReplace(false); onClose() }}>
      <label className="flex flex-col gap-1"><span>File name</span>
        <span className="flex items-center gap-2"><input value={typedName ?? suggested} onChange={(e) => setTypedName(e.target.value)} className="flex-1 min-w-0 min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="export-name" autoComplete="off" /><span aria-hidden="true">.pdf</span></span></label>
      <label className={row}><span>Compress (smaller images, tidy structure)</span><input type="checkbox" className="w-6 h-6" checked={compress} onChange={(e) => setCompress(e.target.checked)} data-testid="opt-compress" /></label>
      <p className="text-sm -mt-2" style={sub} data-testid="size-now">Opened at {kb(session.size)}. The saved size is shown when you save.</p>
      <label className={row}><span>Remove metadata (author, dates)</span><input type="checkbox" className="w-6 h-6" checked={strip} onChange={(e) => setStrip(e.target.checked)} data-testid="opt-strip" /></label>
      <label className="flex flex-col gap-1"><span>Open with a password (optional)</span>
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="opt-password" /></label>
      <details className="rounded-2xl px-4 py-3" style={{ background: 'var(--md-surface-container)' }} data-testid="limits">
        <summary className="min-h-[44px] flex items-center font-medium cursor-pointer">Limit what readers can do</summary>
        <div className="flex flex-col gap-2 pt-2">
          <p className="text-sm" style={sub}>Anyone can still open the file, unless you set an open password above. Readers that respect the limits will block the actions you switch off. Some tools ignore them, so this is a courtesy and not a lock.</p>
          {(['print', 'copy', 'edit'] as const).map((k) => <label key={k} className={row}><span>Allow {k === 'print' ? 'printing' : k === 'copy' ? 'copying text' : 'editing'}</span>
            <input type="checkbox" className="w-6 h-6" checked={allow[k]} onChange={(e) => setAllow({ ...allow, [k]: e.target.checked })} data-testid={`allow-${k}`} /></label>)}
          <label className="flex flex-col gap-1"><span>Owner password (needed to change the limits later)</span>
            <input type="password" autoComplete="new-password" value={owner} onChange={(e) => setOwner(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="opt-owner" /></label>
        </div>
      </details>
      {!strip && (
        <fieldset className="flex flex-col gap-3" data-testid="meta-fields"><legend className="mb-1">Document properties</legend>
          {META.map((k) => <label key={k} className="flex flex-col gap-1"><span>{k}</span>
            <input value={meta[k] ?? ''} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid={`meta-${k.toLowerCase()}`} /></label>)}
        </fieldset>)}
      <p className="text-sm" style={sub}>Your file stays on this device. Saving does not upload anything.</p>
      <button className={primaryBtn} style={primaryStyle} disabled={working} onClick={() => void doSave()} data-testid="export-save">{working ? 'Working' : 'Save PDF'}</button>
      {handle && <button className={tonalBtn} style={confirmReplace ? { background: 'var(--md-error)', color: 'var(--md-on-error)' } : tonalStyle} disabled={working} onClick={() => void doReplace()} data-testid="export-replace">{confirmReplace ? `Tap again to replace ${handle.name}` : `Save over the original (${handle.name})`}</button>}
      <SignPanel outName={outName} compress={compress} strip={strip} onDone={onClose} />
      <button className={tonalBtn} style={tonalStyle} disabled={working} onClick={() => void doWord()} data-testid="export-word">Save as Word (.docx)</button>
      <p className="text-sm" style={sub}>Word export keeps text, headings, bold and italic. Tables, columns, images and exact layout are not kept.</p>
      {canShareFiles() && <button className={tonalBtn} style={tonalStyle} disabled={working} onClick={() => void doShare()}>Share</button>}
    </Sheet>
  )
}
