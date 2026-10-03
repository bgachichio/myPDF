// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useRef, useState } from 'react'
import Sheet, { primaryBtn, primaryStyle, tonalBtn, tonalStyle, fieldStyle } from '@/features/common/Sheet'
import { idb, type SavedSignature } from '@/storage/idb'

interface Props { open: boolean; onClose: () => void; onUse: (png: Blob) => void }
type Tab = 'draw' | 'type' | 'image' | 'stamps' | 'saved'
type Role = NonNullable<SavedSignature['role']>
const W = 360, H = 140

/** The four script faces shipped with the app (public/fonts, with their licences). */
export const SCRIPT_FONTS = [
  { id: 'great-vibes', label: 'Formal', family: 'Sig Great Vibes', scale: 1.0 },
  { id: 'dancing', label: 'Flowing', family: 'Sig Dancing Script', scale: 1.0 },
  { id: 'caveat', label: 'Handwritten', family: 'Sig Caveat', scale: 1.15 },
  { id: 'apple', label: 'Pen', family: 'Sig Homemade Apple', scale: 0.7 },
] as const
const INKS = [{ id: 'black', label: 'Black', value: '#111111' }, { id: 'blue', label: 'Blue', value: '#1a3fb0' }] as const

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'))
const blank = (c: HTMLCanvasElement) => !c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0)
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}` }
const canvasOf = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }

/** Draws `text` in a script face, shrinking it until it fits. Waits for the face to load so the first render is not a fallback font. */
export async function renderScript(text: string, fontIndex: number, ink: string): Promise<HTMLCanvasElement> {
  const f = SCRIPT_FONTS[fontIndex] ?? SCRIPT_FONTS[0]
  try { await document.fonts.load(`64px "${f.family}"`, text) } catch { /* the fallback below still draws */ }
  const c = canvasOf(), g = c.getContext('2d')!
  g.fillStyle = ink; g.textBaseline = 'middle'
  let size = Math.round(84 * f.scale); const face = (px: number) => `${px}px "${f.family}", "Brush Script MT", "Segoe Script", cursive`
  g.font = face(size)
  while (g.measureText(text).width > W - 20 && size > 18) { size -= 4; g.font = face(size) }
  g.fillText(text, 10, H / 2)
  return c
}

/** A tick or a cross drawn as strokes, so it looks the same on every device. */
function mark(kind: 'tick' | 'cross', ink: string): HTMLCanvasElement {
  const c = canvasOf(120, 120), g = c.getContext('2d')!
  g.strokeStyle = ink; g.lineWidth = 12; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath()
  if (kind === 'tick') { g.moveTo(18, 64); g.lineTo(46, 92); g.lineTo(102, 26) } else { g.moveTo(24, 24); g.lineTo(96, 96); g.moveTo(96, 24); g.lineTo(24, 96) }
  g.stroke(); return c
}
function dateStamp(text: string, ink: string): HTMLCanvasElement {
  const c = canvasOf(300, 70), g = c.getContext('2d')!
  g.fillStyle = ink; g.textBaseline = 'middle'
  let size = 44; g.font = `500 ${size}px "Inter Variable", system-ui, sans-serif`
  while (g.measureText(text).width > 280 && size > 14) { size -= 2; g.font = `500 ${size}px "Inter Variable", system-ui, sans-serif` }
  g.fillText(text, 10, 35); return c
}

export default function SignSheet({ open, onClose, onUse }: Props) {
  const [tab, setTab] = useState<Tab>('draw')
  const [role, setRole] = useState<Role>('signature')
  const [ink, setInk] = useState<string>(INKS[0].value)
  const [typed, setTyped] = useState('')
  const [fontIx, setFontIx] = useState(0)
  const [stampText, setStampText] = useState(today)
  const [keep, setKeep] = useState(true)
  const [saved, setSaved] = useState<(SavedSignature & { url: string })[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const pad = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const reload = useCallback(async () => setSaved((await idb.signatures()).map((s) => ({ ...s, url: URL.createObjectURL(s.png) }))), [])
  useEffect(() => { if (open) void idb.signatures().then((list) => setSaved(list.map((s) => ({ ...s, url: URL.createObjectURL(s.png) })))) }, [open])
  useEffect(() => () => saved.forEach((s) => URL.revokeObjectURL(s.url)), [saved])

  // Live preview of the typed signature in the chosen face and ink.
  useEffect(() => {
    if (tab !== 'type' || !typed.trim()) return
    let alive = true
    void renderScript(typed, fontIx, ink).then((c) => { if (alive) setPreview(c.toDataURL()) })
    return () => { alive = false }
  }, [tab, typed, fontIx, ink])

  const ctx = () => { const c = pad.current!.getContext('2d')!; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = ink; return c }
  const pos = (e: React.PointerEvent) => { const r = pad.current!.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)] }
  const down = (e: React.PointerEvent) => { drawing.current = true; pad.current!.setPointerCapture(e.pointerId); const [x, y] = pos(e); const c = ctx(); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.1, y); c.stroke() }
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const [x, y] = pos(e); const c = ctx(); c.lineTo(x, y); c.stroke() }
  const clear = () => pad.current?.getContext('2d')!.clearRect(0, 0, W, H)

  const finish = async (canvas: HTMLCanvasElement, kind: SavedSignature['kind'], remember = keep) => {
    if (blank(canvas)) return
    const png = await toBlob(canvas)
    if (remember) { await idb.putSignature({ id: crypto.randomUUID(), kind, role, png, createdAt: Date.now() }) }
    onUse(png)
  }
  const placeImage = async (file: File) => {
    const bmp = await createImageBitmap(file)
    const c = document.createElement('canvas'); const k = Math.min(1, 600 / bmp.width); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    await finish(c, 'image')
  }
  const tabBtn = (t: Tab, label: string) => (
    <button role="tab" aria-selected={tab === t} className={tonalBtn} data-testid={`sign-tab-${t}`}
      style={tab === t ? primaryStyle : tonalStyle} onClick={() => setTab(t)}>{label}</button>
  )
  const chip = (on: boolean) => (on ? primaryStyle : tonalStyle)
  const shown = saved.filter((s) => (s.role ?? 'signature') === role)
  const what = role === 'initials' ? 'initials' : 'signature'

  return (
    <Sheet open={open} title="Sign" onClose={onClose}>
      <div role="radiogroup" aria-label="What to add" className="flex gap-2">
        <button role="radio" aria-checked={role === 'signature'} className={tonalBtn} style={chip(role === 'signature')} data-testid="role-signature" onClick={() => setRole('signature')}>Signature</button>
        <button role="radio" aria-checked={role === 'initials'} className={tonalBtn} style={chip(role === 'initials')} data-testid="role-initials" onClick={() => setRole('initials')}>Initials</button>
        <span className="flex-1" />
        <div role="radiogroup" aria-label="Ink colour" className="flex gap-2 items-center">
          {INKS.map((i) => <button key={i.id} role="radio" aria-checked={ink === i.value} aria-label={i.label} data-testid={`ink-${i.id}`} onClick={() => setInk(i.value)}
            className="w-[44px] h-[44px] rounded-full" style={{ background: i.value, boxShadow: ink === i.value ? '0 0 0 3px var(--md-surface-container-low), 0 0 0 5px var(--md-primary)' : '0 0 0 1px var(--md-outline)' }} />)}
        </div>
      </div>
      <div role="tablist" className="flex gap-2 flex-wrap">{tabBtn('draw', 'Draw')}{tabBtn('type', 'Type')}{tabBtn('image', 'Image')}{tabBtn('stamps', 'Date and marks')}{tabBtn('saved', `Saved (${shown.length})`)}</div>
      {tab === 'draw' && (<>
        <canvas ref={pad} width={W} height={H} data-testid="sign-pad" className="w-full rounded-xl touch-none" style={{ background: 'var(--paper)', boxShadow: '0 0 0 1px var(--md-outline)' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={() => { drawing.current = false }} aria-label={`Draw your ${what} here`} />
        <div className="flex gap-2"><button className={tonalBtn} style={tonalStyle} onClick={clear}>Clear</button>
          <button className={`${primaryBtn} flex-1`} style={primaryStyle} data-testid="sign-use-draw" onClick={() => void finish(pad.current!, 'draw')}>Use {what}</button></div>
      </>)}
      {tab === 'type' && (<>
        <input aria-label={role === 'initials' ? 'Type your initials' : 'Type your name'} value={typed} onChange={(e) => setTyped(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="sign-typed" />
        <div role="radiogroup" aria-label="Writing style" className="flex gap-2 flex-wrap">
          {SCRIPT_FONTS.map((f, i) => <button key={f.id} role="radio" aria-checked={fontIx === i} className={tonalBtn} style={{ ...chip(fontIx === i), fontFamily: `"${f.family}", cursive`, fontSize: '1.15rem' }} data-testid={`sign-font-${f.id}`} onClick={() => setFontIx(i)}>{f.label}</button>)}
        </div>
        <div className="rounded-xl flex items-center justify-center min-h-[100px]" style={{ background: 'var(--paper)', boxShadow: '0 0 0 1px var(--md-outline)' }} aria-label="Preview">
          {preview && typed.trim() ? <img src={preview} alt={`Preview of ${typed}`} className="max-h-[140px] w-auto max-w-full object-contain" data-testid="sign-preview" /> : <span style={{ color: '#555' }}>Your {what} appears here</span>}
        </div>
        <button className={primaryBtn} style={primaryStyle} data-testid="sign-use-typed" onClick={async () => { if (typed.trim()) await finish(await renderScript(typed, fontIx, ink), 'type') }}>Use {what}</button>
      </>)}
      {tab === 'image' && <label className="flex flex-col gap-2"><span>Choose a picture of your {what} (PNG or JPEG)</span>
        <input type="file" accept="image/png,image/jpeg" data-testid="sign-image" onChange={(e) => { const f = e.target.files?.[0]; if (f) void placeImage(f) }} /></label>}
      {tab === 'stamps' && (<>
        <label className="flex flex-col gap-1"><span>Date</span>
          <input value={stampText} maxLength={24} onChange={(e) => setStampText(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="stamp-text" /></label>
        <button className={primaryBtn} style={primaryStyle} data-testid="stamp-date" onClick={() => { if (stampText.trim()) void finish(dateStamp(stampText, ink), 'type', false) }}>Place this date</button>
        <div className="flex gap-2">
          <button className={`${tonalBtn} flex-1`} style={tonalStyle} data-testid="stamp-tick" onClick={() => void finish(mark('tick', ink), 'draw', false)}>Tick</button>
          <button className={`${tonalBtn} flex-1`} style={tonalStyle} data-testid="stamp-cross" onClick={() => void finish(mark('cross', ink), 'draw', false)}>Cross</button>
        </div>
      </>)}
      {tab === 'saved' && (shown.length === 0 ? <p>No saved {role === 'initials' ? 'initials' : 'signatures'} yet.</p> : (
        <ul className="flex flex-col gap-3">{shown.map((s) => (
          <li key={s.id} className="flex items-center gap-3">
            <img src={s.url} alt={`Saved ${what}`} className="h-14 rounded-lg flex-1 object-contain" style={{ background: 'var(--paper)' }} />
            <button className={tonalBtn} style={tonalStyle} data-testid="sign-use-saved" onClick={() => onUse(s.png)}>Use</button>
            <button className={tonalBtn} style={tonalStyle} aria-label={`Delete saved ${what}`} onClick={async () => { await idb.deleteSignature(s.id); await reload() }}>Delete</button>
          </li>))}</ul>))}
      {(tab === 'draw' || tab === 'type' || tab === 'image') && <label className="flex items-center gap-3 min-h-[44px]"><input type="checkbox" className="w-6 h-6" checked={keep} onChange={(e) => setKeep(e.target.checked)} /><span>Keep on this device for next time</span></label>}
    </Sheet>
  )
}
