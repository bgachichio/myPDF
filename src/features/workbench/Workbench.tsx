// SPDX-License-Identifier: AGPL-3.0-or-later
import { useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Copy, FilePlus2, FileText, Hash, Layers, Move, Settings, Pencil, Redo2, RotateCw, ScanText, Scissors, Trash2, Undo2, Minimize2 } from 'lucide-react'
import { useSession } from '@/app/session'
import Sheet, { primaryBtn, primaryStyle, tonalBtn, tonalStyle, fieldStyle } from '@/features/common/Sheet'
import ExportSheet from '@/features/workbench/ExportSheet'
import Thumb from '@/features/workbench/Thumb'
import { formatRanges, parseRanges, reorder } from '@/features/workbench/ranges'
import { saveBytes } from '@/features/common/download'
import { recognise, stopOcr } from '@/engine/ocr/ocr'

interface Props { onBack: () => void; onEdit: (page: number) => void; onSettings: () => void }
type Panel = null | 'export' | 'move' | 'extract' | 'watermark' | 'ocr'

export default function Workbench({ onBack, onEdit, onSettings }: Props) {
  const { session, run, undo, redo, canUndo, canRedo, addFiles, extractPages, notify, busy } = useSession()
  const [selected, setSelected] = useState<number[]>([])
  const [panel, setPanel] = useState<Panel>(null)
  const [drag, setDrag] = useState<{ from: number; slot: number } | null>(null)
  const [moveTo, setMoveTo] = useState('1')
  const [rangeText, setRangeText] = useState('')
  const [wmText, setWmText] = useState('CONFIDENTIAL')
  const [ocrProgress, setOcrProgress] = useState<string | null>(null)
  const dragged = useRef(false)
  const pages = session?.pages ?? []
  const n = pages.length
  const sel = selected.filter((i) => i < n).sort((a, b) => a - b)

  if (!session) return null
  const toggle = (i: number) => { if (dragged.current) { dragged.current = false; return } setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i])) }

  const move = (moving: number[], slot: number) => {
    const order = reorder(n, moving, slot)
    void run('Moving pages', (e, id) => e.rearrange(id, order))
    setSelected(moving.map((_, k) => Math.max(0, Math.min(slot, n - moving.length)) + k))
  }

  // Pointer-based drag reorder: mouse drags after 6 px, touch after a 350 ms long press (BUILD-BRIEF section 8).
  const onPointerDown = (e: React.PointerEvent, i: number) => {
    const start = { x: e.clientX, y: e.clientY }, touch = e.pointerType !== 'mouse'
    let active = false, timer: ReturnType<typeof setTimeout> | undefined, slot = i
    const blockScroll = (ev: TouchEvent) => ev.preventDefault()
    const slotAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-page-index]')
      if (!el) return slot
      const idx = Number(el.dataset.pageIndex), r = el.getBoundingClientRect()
      return x < r.left + r.width / 2 ? idx : idx + 1
    }
    const begin = () => { active = true; dragged.current = true; setDrag({ from: i, slot: i }); window.addEventListener('touchmove', blockScroll, { passive: false }) }
    const onMove = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - start.x, ev.clientY - start.y)
      if (!active) { if (!touch && dist > 6) begin(); else if (touch && dist > 10) cleanup(); return }
      slot = slotAt(ev.clientX, ev.clientY); setDrag({ from: i, slot })
    }
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); window.removeEventListener('touchmove', blockScroll) }
    const onUp = () => {
      cleanup(); setDrag(null)
      if (!active) return
      const moving = selected.includes(i) ? sel : [i]
      const rest = moving.filter((m) => m < slot).length
      move(moving, slot - rest)
      setTimeout(() => { dragged.current = false }, 0)
    }
    if (touch) timer = setTimeout(begin, 350)
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp)
  }

  const duplicate = () => {
    const order: number[] = []; for (let i = 0; i < n; i++) { order.push(i); if (selected.includes(i)) order.push(i) }
    void run('Duplicating', (e, id) => e.rearrange(id, order))
  }
  const remove = () => {
    if (sel.length >= n) return notify('A document needs at least one page')
    const order = Array.from({ length: n }, (_, i) => i).filter((i) => !selected.includes(i))
    void run('Deleting', (e, id) => e.rearrange(id, order)); setSelected([])
  }
  const doExtract = async () => {
    const pagesToTake = parseRanges(rangeText, n)
    if (!pagesToTake) return notify('Use page numbers like 1-3, 5')
    try {
      const bytes = await extractPages(pagesToTake)
      await saveBytes(`${session.name.replace(/\.pdf$/i, '')}-pages-${formatRanges(pagesToTake).replace(/[ ,]+/g, '_')}.pdf`, bytes)
      setPanel(null)
    } catch { notify('Extract failed') }
  }
  const doOcr = async () => {
    const scale = 2
    try {
      await run('Recognising text', async (e, id) => {
        for (let i = 0; i < n; i++) {
          setOcrProgress(`Page ${i + 1} of ${n}`)
          const bitmap = await e.render(id, i, scale)
          const words = await recognise(bitmap, scale); bitmap.close()
          await e.addTextLayer(id, i, words)
        }
      })
      notify('Text recognised. The pages now search like any other.')
    } finally { setOcrProgress(null); setPanel(null); void stopOcr() }
  }

  const pickFile = () => document.getElementById('add-file-input')?.click()
  const dockBtn = 'flex flex-col items-center justify-center gap-1 min-w-[56px] min-h-[56px] px-2 rounded-xl text-xs font-medium disabled:opacity-40'
  const btn = (icon: ReactNode, label: string, onClick: () => void, testid: string) => (
    <button className={dockBtn} onClick={onClick} data-testid={testid} disabled={Boolean(busy)}>{icon}<span>{label}</span></button>
  )
  const iconBtn = 'flex items-center justify-center rounded-full w-[44px] h-[44px] disabled:opacity-40'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--md-surface)', color: 'var(--md-on-surface)' }}>
      <header className="sticky top-0 z-30 flex items-center gap-1 px-2 h-14" style={{ background: 'var(--md-surface)', borderBottom: '1px solid var(--md-outline-variant)' }}>
        <button aria-label="Back to home" className={iconBtn} onClick={onBack}><ArrowLeft size={24} /></button>
        <div className="flex-1 min-w-0">
          <div className="truncate font-medium" style={{ fontSize: '1rem' }}>{session.name}</div>
          <div className="text-xs" style={{ color: 'var(--md-on-surface-variant)' }} data-testid="page-count">{n} {n === 1 ? 'page' : 'pages'}{sel.length ? `, ${sel.length} selected` : ''}</div>
        </div>
        <button aria-label="Undo" className={iconBtn} onClick={() => void undo()} disabled={!canUndo || Boolean(busy)} data-testid="undo"><Undo2 size={22} /></button>
        <button aria-label="Redo" className={iconBtn} onClick={() => void redo()} disabled={!canRedo || Boolean(busy)} data-testid="redo"><Redo2 size={22} /></button>
        <button className={`${primaryBtn} min-h-[44px] px-5`} style={primaryStyle} onClick={() => setPanel('export')} data-testid="export">Export</button>
        <button aria-label="Settings" className={iconBtn} onClick={onSettings} data-testid="settings"><Settings size={22} /></button>
      </header>

      <main className="flex-1 px-4 pt-4 pb-32">
        {sel.length > 0 && (
          <div className="flex gap-2 mb-3">
            <button className={tonalBtn} style={tonalStyle} onClick={() => setSelected(Array.from({ length: n }, (_, i) => i))}>Select all</button>
            <button className={tonalBtn} style={tonalStyle} onClick={() => setSelected([])}>Clear</button>
          </div>
        )}
        <ul className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-4" aria-label="Pages" data-testid="grid">
          {pages.map((p, i) => {
            const isSel = selected.includes(i)
            return (
              <li key={i} data-page-index={i} data-testid={`page-${i}`} className="relative select-none"
                style={{ touchAction: 'pan-y', opacity: drag?.from === i ? 0.4 : 1, outline: drag?.slot === i ? '3px solid var(--md-primary)' : undefined, outlineOffset: 2 }}>
                <button className="block w-full text-left rounded-lg" aria-pressed={isSel} aria-label={`Page ${i + 1}${isSel ? ', selected' : ''}`}
                  onClick={() => toggle(i)} onPointerDown={(e) => onPointerDown(e, i)} onDoubleClick={() => onEdit(i)}
                  style={{ outline: isSel ? '3px solid var(--md-primary)' : 'none', outlineOffset: 2 }}>
                  <Thumb docId={session.id} rev={session.rev} index={i} width={p.width} height={p.height} rotation={p.rotation} />
                  <span className="block text-center text-xs mt-1" style={{ color: 'var(--md-on-surface-variant)' }}>{i + 1}</span>
                </button>
                {isSel && <span className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)' }}><Check size={16} /></span>}
              </li>
            )
          })}
        </ul>
      </main>

      <nav aria-label="Page actions" className="fixed bottom-0 left-0 right-0 z-30 flex justify-center gap-1 px-2 py-2 overflow-x-auto"
        style={{ background: 'var(--md-surface-container)', borderTop: '1px solid var(--md-outline-variant)' }}>
        {sel.length === 0 ? (<>
          {btn(<FilePlus2 size={22} />, 'Blank page', () => void run('Adding a blank page', (e, id) => e.insertBlank(id, n)), 'dock-blank')}
          {btn(<FileText size={22} />, 'Add file', pickFile, 'dock-add')}
          {btn(<Minimize2 size={22} />, 'Compress', () => setPanel('export'), 'dock-compress')}
          {btn(<Hash size={22} />, 'Page numbers', () => void run('Numbering pages', (e, id) => e.stamp(id, 'pageNumbers')), 'dock-numbers')}
          {btn(<Layers size={22} />, 'Watermark', () => setPanel('watermark'), 'dock-watermark')}
          {btn(<ScanText size={22} />, 'OCR', () => setPanel('ocr'), 'dock-ocr')}
        </>) : (<>
          {btn(<Pencil size={22} />, 'Edit', () => onEdit(sel[0]), 'dock-edit')}
          {btn(<RotateCw size={22} />, 'Rotate', () => void run('Rotating', (e, id) => e.rotate(id, sel, 90)), 'dock-rotate')}
          {btn(<Copy size={22} />, 'Duplicate', duplicate, 'dock-duplicate')}
          {btn(<Move size={22} />, 'Move', () => { setMoveTo(String(sel[0] + 1)); setPanel('move') }, 'dock-move')}
          {btn(<Scissors size={22} />, 'Extract', () => { setRangeText(formatRanges(sel)); setPanel('extract') }, 'dock-extract')}
          {btn(<Trash2 size={22} />, 'Delete', remove, 'dock-delete')}
        </>)}
      </nav>
      <input id="add-file-input" type="file" multiple hidden accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" data-testid="add-file-input"
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void addFiles(f) }} />

      <ExportSheet open={panel === 'export'} onClose={() => setPanel(null)} />

      <Sheet open={panel === 'move'} title="Move pages" onClose={() => setPanel(null)}>
        <label htmlFor="move-to">Move to position (1 to {n})</label>
        <input id="move-to" type="number" min={1} max={n} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} />
        <button className={primaryBtn} style={primaryStyle} data-testid="move-apply" onClick={() => { const p = Math.max(1, Math.min(n, Number(moveTo) || 1)); move(sel, p - 1); setPanel(null) }}>Move</button>
      </Sheet>
      <Sheet open={panel === 'extract'} title="Extract or split pages" onClose={() => setPanel(null)}>
        <label htmlFor="ranges">Pages to take out (for example 1-3, 5)</label>
        <input id="ranges" value={rangeText} onChange={(e) => setRangeText(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} />
        <button className={primaryBtn} style={primaryStyle} data-testid="extract-apply" onClick={() => void doExtract()}>Save these pages as a new PDF</button>
      </Sheet>
      <Sheet open={panel === 'watermark'} title="Text watermark" onClose={() => setPanel(null)}>
        <label htmlFor="wm">Watermark text</label>
        <input id="wm" value={wmText} maxLength={40} onChange={(e) => setWmText(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} />
        <button className={primaryBtn} style={primaryStyle} data-testid="watermark-apply" onClick={() => { void run('Adding watermark', (e, id) => e.stamp(id, 'watermark', wmText)); setPanel(null) }}>Add to every page</button>
      </Sheet>
      <Sheet open={panel === 'ocr'} title="Recognise text (OCR)" onClose={() => (ocrProgress ? undefined : setPanel(null))}>
        <p style={{ color: 'var(--md-on-surface-variant)' }}>Adds an invisible text layer so scanned pages can be searched and copied. English, on this device. The page images do not change.</p>
        <button className={primaryBtn} style={primaryStyle} disabled={Boolean(ocrProgress)} data-testid="ocr-apply" onClick={() => void doOcr()}>{ocrProgress ?? `Recognise ${n} ${n === 1 ? 'page' : 'pages'}`}</button>
      </Sheet>
    </div>
  )
}
