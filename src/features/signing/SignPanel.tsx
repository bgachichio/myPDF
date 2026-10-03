// SPDX-License-Identifier: AGPL-3.0-or-later
// F19: sign the finished PDF with a certificate. The key and the file stay on this device; nothing is sent anywhere.
import { useState } from 'react'
import { useSession } from '@/app/session'
import { getEngine } from '@/engine/mupdf/client'
import type { Rect } from '@/engine/PdfEngine'
import { primaryBtn, primaryStyle, tonalBtn, tonalStyle, fieldStyle } from '@/features/common/Sheet'
import { saveBytes } from '@/features/common/download'
import type { Identity } from '@/features/signing/identity'

interface Props { outName: string; compress: boolean; strip: boolean; onDone: () => void }
type Corner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
const hint = { color: 'var(--md-on-surface-variant)' } as const
const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
const BOX = { w: 220, h: 64, margin: 36 }

function boxFor(corner: Corner, w: number, h: number): Rect {
  const x = corner.endsWith('left') ? BOX.margin : w - BOX.margin - BOX.w
  const y = corner.startsWith('top') ? BOX.margin : h - BOX.margin - BOX.h
  return [x, y, x + BOX.w, y + BOX.h]
}

export default function SignPanel({ outName, compress, strip, onDone }: Props) {
  const { session, notify } = useSession()
  const [file, setFile] = useState<File | null>(null)
  const [pw, setPw] = useState('')
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', pass: '' })
  const [reason, setReason] = useState('')
  const [location, setLocation] = useState('')
  const [invisible, setInvisible] = useState(false)
  const [corner, setCorner] = useState<Corner>('bottom-left')
  const [pageIx, setPageIx] = useState<number | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [now] = useState(Date.now)
  if (!session) return null
  const last = session.pages.length - 1, page = pageIx ?? last

  const unlock = async () => {
    if (!file) return
    setError(null); setWorking('Opening your signing ID')
    try {
      const { loadIdentity } = await import('@/features/signing/identity')
      setIdentity(await loadIdentity(new Uint8Array(await file.arrayBuffer()), pw))
    } catch (e) { setIdentity(null); setError(e instanceof Error ? e.message : 'This file could not be opened') } finally { setWorking(null) }
  }

  const create = async () => {
    if (!form.name.trim()) return setError('Enter the name to sign with')
    if (form.pass.length < 8) return setError('Choose a password of at least 8 characters. It protects the signing ID file.')
    setError(null); setWorking('Making your signing ID')
    try {
      const { createIdentity } = await import('@/features/signing/identity')
      const made = await createIdentity({ name: form.name.trim(), email: form.email.trim() || undefined, password: form.pass })
      const stem = form.name.trim().replace(/[^\w.-]+/g, '-').toLowerCase() || 'signing-id'
      const r = await saveBytes(`${stem}-signing-id.p12`, made.p12, 'p12')
      setIdentity(made.identity); setCreating(false)
      notify(r === 'cancelled' ? 'Signing ID ready for this save only. You did not save the file, so it cannot be used again.' : 'Signing ID saved. Keep the file and its password safe: you need both to sign again.')
    } catch { setError('The signing ID could not be made') } finally { setWorking(null) }
  }

  const sign = async () => {
    if (!identity) return
    setError(null); setWorking('Signing')
    try {
      const [{ finishSignature, checkSignatures, pdfDate, RESERVE }] = await Promise.all([import('@/features/signing/pdfsign')])
      const engine = getEngine()
      // The editing session is never touched: the signature field is added to a copy.
      const plain = await engine.save(session.id, { compress: false, stripMetadata: false, decrypt: true })
      const copy = await engine.open(plain.slice().buffer as ArrayBuffer)
      let prepared: Uint8Array
      try {
        const info = session.pages[page]
        prepared = await engine.saveForSigning(copy.id, {
          page, rect: invisible ? null : boxFor(corner, info.width, info.height), signer: identity.name, reason: reason.trim(), location: location.trim(), contact: '',
          date: pdfDate(new Date()), reserve: RESERVE, compress, stripMetadata: strip,
        })
      } finally { await engine.close(copy.id) }
      const signed = await finishSignature(prepared, identity, new Date())
      // Check our own work before it leaves: the new signature must read back as intact.
      const check = (await checkSignatures(signed)).at(-1)
      if (check?.integrity !== 'valid') throw new Error('The signature did not check out after signing, so the file was not saved')
      const name = outName.replace(/\.pdf$/i, '') + '-signed.pdf'
      const r = await saveBytes(name, signed)
      if (r !== 'cancelled') { notify(`Saved ${name}, signed by ${identity.name}`); onDone() }
    } catch (e) { setError(e instanceof Error ? e.message : 'Signing failed') } finally { setWorking(null) }
  }

  const row = 'flex flex-col gap-1'
  return (
    <details className="rounded-2xl px-4 py-3" style={{ background: 'var(--md-surface-container)' }} data-testid="sign-panel">
      <summary className="min-h-[44px] flex items-center font-medium cursor-pointer">Sign with a certificate</summary>
      <div className="flex flex-col gap-3 pt-2">
        <p className="text-sm" style={hint}>Adds a digital signature that other PDF readers can check. It shows the file has not changed since you signed it. It is not the same as the drawn signature in the editor.</p>
        {!identity && !creating && (<>
          <label className={row}><span>Your signing ID (.p12 or .pfx)</span>
            <input type="file" accept=".p12,.pfx,application/x-pkcs12" data-testid="sign-id-file" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null) }} /></label>
          <label className={row}><span>Its password</span>
            <input type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="sign-id-password" /></label>
          <div className="flex gap-2 flex-wrap">
            <button className={primaryBtn} style={primaryStyle} disabled={!file || Boolean(working)} data-testid="sign-id-open" onClick={() => void unlock()}>{working ?? 'Open signing ID'}</button>
            <button className={tonalBtn} style={tonalStyle} disabled={Boolean(working)} data-testid="sign-id-new" onClick={() => { setCreating(true); setError(null) }}>I do not have one</button>
          </div>
        </>)}
        {creating && !identity && (<>
          <p className="text-sm" style={hint}>This makes a signing ID on this device and saves it as a file. It is self-issued: it proves the file is unchanged since you signed it, and other readers will say they do not know the issuer. Nothing leaves this device.</p>
          <label className={row}><span>Name to sign with</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="new-id-name" autoComplete="name" /></label>
          <label className={row}><span>Email (optional)</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="new-id-email" autoComplete="email" /></label>
          <label className={row}><span>Password for the ID file (8 or more characters)</span><input type="password" autoComplete="new-password" value={form.pass} onChange={(e) => setForm({ ...form, pass: e.target.value })} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="new-id-password" /></label>
          <div className="flex gap-2"><button className={primaryBtn} style={primaryStyle} disabled={Boolean(working)} data-testid="new-id-make" onClick={() => void create()}>{working ?? 'Make and save my signing ID'}</button>
            <button className={tonalBtn} style={tonalStyle} onClick={() => setCreating(false)}>Back</button></div>
        </>)}
        {identity && (<>
          <p data-testid="sign-id-ready" className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }}>
            Signing as <strong>{identity.name}</strong>. Valid until {fmt(identity.notAfter)}{identity.notAfter.getTime() < now ? ' (expired)' : ''}. <button className="underline min-h-[44px]" onClick={() => { setIdentity(null); setPw('') }}>Change</button></p>
          <label className={row}><span>Reason (optional)</span><input value={reason} maxLength={80} onChange={(e) => setReason(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="sign-reason" /></label>
          <label className={row}><span>Location (optional)</span><input value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="sign-location" /></label>
          <label className="flex items-center justify-between min-h-[44px] gap-3"><span>Hide the signature box (still signed)</span><input type="checkbox" className="w-6 h-6" checked={invisible} onChange={(e) => setInvisible(e.target.checked)} data-testid="sign-invisible" /></label>
          {!invisible && (<div className="grid grid-cols-2 gap-3">
            <label className={row}><span>Page</span><select value={page} onChange={(e) => setPageIx(Number(e.target.value))} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="sign-page">
              {session.pages.slice(0, 500).map((_, i) => <option key={i} value={i}>{i + 1}{i === last ? ' (last)' : ''}</option>)}</select></label>
            <label className={row}><span>Corner</span><select value={corner} onChange={(e) => setCorner(e.target.value as Corner)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="sign-corner">
              <option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option><option value="top-left">Top left</option><option value="top-right">Top right</option></select></label>
          </div>)}
          <p className="text-sm" style={hint}>Sign last. Any change after signing, including a password or a different save, breaks the signature. This save leaves out a password.</p>
          <button className={primaryBtn} style={primaryStyle} disabled={Boolean(working)} data-testid="sign-save" onClick={() => void sign()}>{working ?? 'Sign and save PDF'}</button>
        </>)}
        {error && <p role="alert" className="text-sm rounded-xl px-4 py-3" style={{ background: 'var(--md-error-container)', color: 'var(--md-on-error-container)' }} data-testid="sign-error">{error}</p>}
      </div>
    </details>
  )
}
