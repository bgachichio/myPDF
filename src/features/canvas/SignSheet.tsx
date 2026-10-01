// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useRef, useState } from 'react'
import Sheet, { primaryBtn, primaryStyle, tonalBtn, tonalStyle, fieldStyle } from '@/features/common/Sheet'
import { idb, type SavedSignature } from '@/storage/idb'

interface Props { open: boolean; onClose: () => void; onUse: (png: Blob) => void }
type Tab = 'draw' | 'type' | 'image' | 'saved'
const W = 360, H = 140

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'))
const blank = (c: HTMLCanvasElement) => !c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0)

export default function SignSheet({ open, onClose, onUse }: Props) {
  const [tab, setTab] = useState<Tab>('draw')
  const [typed, setTyped] = useState('')
  const [keep, setKeep] = useState(true)
  const [saved, setSaved] = useState<(SavedSignature & { url: string })[]>([])
  const pad = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const reload = useCallback(async () => setSaved((await idb.signatures()).map((s) => ({ ...s, url: URL.createObjectURL(s.png) }))), [])
  useEffect(() => { if (open) void idb.signatures().then((list) => setSaved(list.map((s) => ({ ...s, url: URL.createObjectURL(s.png) })))) }, [open])
  useEffect(() => () => saved.forEach((s) => URL.revokeObjectURL(s.url)), [saved])

  const ctx = () => { const c = pad.current!.getContext('2d')!; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#111'; return c }
  const pos = (e: React.PointerEvent) => { const r = pad.current!.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)] }
  const down = (e: React.PointerEvent) => { drawing.current = true; pad.current!.setPointerCapture(e.pointerId); const [x, y] = pos(e); const c = ctx(); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.1, y); c.stroke() }
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const [x, y] = pos(e); const c = ctx(); c.lineTo(x, y); c.stroke() }
  const clear = () => pad.current?.getContext('2d')!.clearRect(0, 0, W, H)

  const finish = async (canvas: HTMLCanvasElement, kind: SavedSignature['kind']) => {
    if (blank(canvas)) return
    const png = await toBlob(canvas)
    if (keep) { await idb.putSignature({ id: crypto.randomUUID(), kind, png, createdAt: Date.now() }) }
    onUse(png)
  }
  const placeTyped = async () => {
    if (!typed.trim()) return
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const g = c.getContext('2d')!; g.fillStyle = '#111'; g.textBaseline = 'middle'
    let size = 72; g.font = `italic ${size}px "Brush Script MT","Segoe Script",cursive`
    while (g.measureText(typed).width > W - 20 && size > 20) { size -= 4; g.font = `italic ${size}px "Brush Script MT","Segoe Script",cursive` }
    g.fillText(typed, 10, H / 2)
    await finish(c, 'type')
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

  return (
    <Sheet open={open} title="Sign" onClose={onClose}>
      <div role="tablist" className="flex gap-2 flex-wrap">{tabBtn('draw', 'Draw')}{tabBtn('type', 'Type')}{tabBtn('image', 'Image')}{tabBtn('saved', `Saved (${saved.length})`)}</div>
      {tab === 'draw' && (<>
        <canvas ref={pad} width={W} height={H} data-testid="sign-pad" className="w-full rounded-xl touch-none" style={{ background: 'var(--paper)', boxShadow: '0 0 0 1px var(--md-outline)' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={() => { drawing.current = false }} aria-label="Draw your signature here" />
        <div className="flex gap-2"><button className={tonalBtn} style={tonalStyle} onClick={clear}>Clear</button>
          <button className={`${primaryBtn} flex-1`} style={primaryStyle} data-testid="sign-use-draw" onClick={() => void finish(pad.current!, 'draw')}>Use signature</button></div>
      </>)}
      {tab === 'type' && (<>
        <input aria-label="Type your name" value={typed} onChange={(e) => setTyped(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="sign-typed" />
        <button className={primaryBtn} style={primaryStyle} data-testid="sign-use-typed" onClick={() => void placeTyped()}>Use signature</button>
      </>)}
      {tab === 'image' && <label className="flex flex-col gap-2"><span>Choose a picture of your signature (PNG or JPEG)</span>
        <input type="file" accept="image/png,image/jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) void placeImage(f) }} /></label>}
      {tab === 'saved' && (saved.length === 0 ? <p>No saved signatures yet.</p> : (
        <ul className="flex flex-col gap-3">{saved.map((s) => (
          <li key={s.id} className="flex items-center gap-3">
            <img src={s.url} alt="Saved signature" className="h-14 rounded-lg flex-1 object-contain" style={{ background: 'var(--paper)' }} />
            <button className={tonalBtn} style={tonalStyle} data-testid="sign-use-saved" onClick={() => onUse(s.png)}>Use</button>
            <button className={tonalBtn} style={tonalStyle} aria-label="Delete saved signature" onClick={async () => { await idb.deleteSignature(s.id); await reload() }}>Delete</button>
          </li>))}</ul>))}
      {tab !== 'saved' && <label className="flex items-center gap-3 min-h-[44px]"><input type="checkbox" className="w-6 h-6" checked={keep} onChange={(e) => setKeep(e.target.checked)} /><span>Keep on this device for next time</span></label>}
    </Sheet>
  )
}
