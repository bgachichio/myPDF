// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, MousePointer2, Type, Highlighter, PenLine, Signature, EyeOff, TextCursorInput, Undo2, Redo2, Search, Settings, ListTree, ImagePlus, Eraser, PenTool } from 'lucide-react'
import { useSession } from '@/app/session'
import { getEngine } from '@/engine/mupdf/client'
import type { AnnotationType, FormField, OutlineEntry, Quad, Rect, SearchHit, TextStyle } from '@/engine/PdfEngine'
import Sheet, { primaryBtn, primaryStyle, tonalBtn, tonalStyle, fieldStyle } from '@/features/common/Sheet'
import SignSheet from '@/features/canvas/SignSheet'
import { PRESETS, findMatches } from '@/features/canvas/patterns'

type Tool = 'select' | 'edit' | 'markup' | 'draw' | 'sign' | 'image' | 'redact' | 'fields'
type Markup = 'highlight' | 'underline' | 'strikeout' | 'freetext' | 'square' | 'circle' | 'note' | 'link'
type Pop = null | { kind: 'edit'; rect: Rect; value: string } | { kind: 'text'; rect: Rect; value: string; note: boolean } | { kind: 'link'; rect: Rect; mode: 'web' | 'page'; value: string }

/** Colours offered for pens and typed text. Names are for the screen reader. */
const COLOURS = [{ name: 'Blue', value: '#1a3fb0' }, { name: 'Black', value: '#111111' }, { name: 'Red', value: '#c2410c' }, { name: 'Green', value: '#237352' }] as const
const WIDTHS = [{ name: 'Thin', value: 1.5 }, { name: 'Medium', value: 3 }, { name: 'Thick', value: 6 }] as const
const ERASER_RADIUS = 8

const quadOf = (r: Rect): Quad => [r[0], r[1], r[2], r[1], r[0], r[3], r[2], r[3]]
const boxOf = (q: Quad): Rect => [Math.min(q[0], q[2], q[4], q[6]), Math.min(q[1], q[3], q[5], q[7]), Math.max(q[0], q[2], q[4], q[6]), Math.max(q[1], q[3], q[5], q[7])]
const norm = (a: [number, number], b: [number, number]): Rect => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]

export default function Canvas({ startPage, onBack, onSettings }: { startPage: number; onBack: () => void; onSettings: () => void }) {
  const { session, run, undo, redo, canUndo, canRedo, notify, busy } = useSession()
  const [rawPage, setPage] = useState(startPage)
  const page = Math.max(0, Math.min(rawPage, (session?.pages.length ?? 1) - 1))
  const [zoom, setZoom] = useState(1)
  const [tool, setTool] = useState<Tool>('select')
  const [markup, setMarkup] = useState<Markup>('highlight')
  const [draft, setDraft] = useState<Rect | null>(null)
  const [ink, setInk] = useState<[number, number][]>([])
  const [pop, setPop] = useState<Pop>(null)
  const [signOpen, setSignOpen] = useState(false)
  const [pen, setPen] = useState<{ color: string; width: number }>({ color: COLOURS[0].value, width: 3 })
  const [eraser, setEraser] = useState(false)
  const erasePts = useRef<[number, number][]>([])
  const [textStyle, setTextStyle] = useState<TextStyle>({ font: 'sans', size: 12, bold: false, italic: false, color: '#111111' })
  const fieldTarget = useRef<Rect | null>(null)
  const [armed, setArmed] = useState<{ png: Blob; ratio: number } | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [hitPos, setHitPos] = useState(0)
  const [redactTerm, setRedactTerm] = useState('')
  const [fields, setFields] = useState<FormField[]>([])
  const [vw, setVw] = useState(window.innerWidth)
  const [contents, setContents] = useState<OutlineEntry[] | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const zoomRef = useRef(1)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const start = useRef<[number, number] | null>(null)
  const info = session?.pages[page]
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const fit = info ? (Math.min(vw, 900) - 32) / info.width : 1
  const s = fit * zoom

  useEffect(() => { const on = () => setVw(window.innerWidth); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on) }, [])

  // Render the page whenever the document, page or zoom changes.
  useEffect(() => {
    if (!session || !info) return
    let cancelled = false
    const scale = Math.min(s * dpr, 3000 / Math.max(info.width, info.height))
    void getEngine().render(session.id, page, scale).then((bm) => {
      const c = canvas.current
      if (cancelled || !c) { bm.close(); return }
      c.width = bm.width; c.height = bm.height
      c.getContext('2d')?.drawImage(bm, 0, 0); bm.close()
      c.dataset.rendered = `${page}`
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [session, page, s, dpr, info])

  useEffect(() => {
    if (!session || tool !== 'fields') return
    void getEngine().fields(session.id).then(setFields).catch(() => setFields([]))
  }, [session, tool])

  // Pinch (two fingers) and Ctrl+wheel zoom the page (F01). A second finger cancels any drag the first one started.
  useEffect(() => {
    const el = mainRef.current; if (!el) return
    const clamp = (z: number) => Math.min(4, Math.max(0.5, +z.toFixed(2)))
    let startDist = 0, startZoom = 1
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onStart = (e: TouchEvent) => { if (e.touches.length === 2) { startDist = dist(e.touches); startZoom = zoomRef.current; start.current = null; setDraft(null); setInk([]) } }
    const onMove = (e: TouchEvent) => { if (e.touches.length === 2 && startDist) { e.preventDefault(); setZoom(clamp(startZoom * (dist(e.touches) / startDist))) } }
    const onEnd = (e: TouchEvent) => { if (e.touches.length < 2) startDist = 0 }
    const onWheel = (e: WheelEvent) => { if (e.ctrlKey) { e.preventDefault(); setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) } }
    el.addEventListener('touchstart', onStart, { passive: true }); el.addEventListener('touchmove', onMove, { passive: false }); el.addEventListener('touchend', onEnd); el.addEventListener('wheel', onWheel, { passive: false })
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd); el.removeEventListener('wheel', onWheel) }
  }, [info])

  const go = useCallback((p: number) => { if (session) setPage(Math.max(0, Math.min(session.pages.length - 1, p))) }, [session])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(page + 1)
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(page - 1)
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [go, page])

  if (!session || !info) return null
  const marks = session.marks
  const at = (e: React.PointerEvent): [number, number] => { const r = overlay.current!.getBoundingClientRect(); return [(e.clientX - r.left) / s, (e.clientY - r.top) / s] }

  const doSearch = async () => {
    if (!query.trim()) { setHits(null); return }
    const found = await getEngine().search(session.id, query)
    setHits(found); setHitPos(0)
    if (found.length) setPage(found[0].page)
  }
  const stepHit = (d: number) => {
    if (!hits?.length) return
    const next = (hitPos + d + hits.length) % hits.length
    setHitPos(next); setPage(hits[next].page)
  }
  const markAll = async () => {
    if (!redactTerm.trim()) return
    const found = await getEngine().search(session.id, redactTerm)
    if (!found.length) return notify('No matches for that text. If this page is a scan, run OCR first.')
    let count = 0
    await run('Marking', async (e, id) => { for (const h of found) { await e.markRedaction(id, h.page, h.quads); count += h.quads.length } }, { marks: marks + found.reduce((n, h) => n + h.quads.length, 0) })
    notify(`${count} ${count === 1 ? 'area' : 'areas'} marked for redaction`)
  }
  /** Finds every match of a ready-made pattern in the whole file and marks each one. Nothing is removed until Apply. */
  const markPreset = async (id: string) => {
    const preset = PRESETS.find((p) => p.id === id); if (!preset) return
    const engine = getEngine(), found = new Set<string>()
    for (let i = 0; i < session.pages.length; i++) for (const m of findMatches(await engine.text(session.id, i), preset.re)) found.add(m)
    if (!found.size) return notify(`No ${preset.label.toLowerCase()} found. If this file is a scan, run OCR first.`)
    const hits: Awaited<ReturnType<typeof engine.search>> = []
    for (const needle of [...found].slice(0, 300)) hits.push(...await engine.search(session.id, needle))
    const count = hits.reduce((n, h) => n + h.quads.length, 0)
    if (!count) return notify('Found the text but could not locate it on the page.')
    await run('Marking', async (e, docId) => { for (const h of hits) await e.markRedaction(docId, h.page, h.quads) }, { marks: marks + count })
    notify(`${count} ${count === 1 ? 'area' : 'areas'} marked: ${preset.label.toLowerCase()}. Check them, then apply.`)
  }
  const applyRedaction = async () => {
    let result = { verified: false, residualMatches: 0 }
    await run('Applying redaction', async (e, id) => { result = await e.applyRedactions(id) }, { marks: 0 })
    notify(result.verified ? 'Redaction applied and verified: no text is left under the marked areas.' : `Redaction applied, but ${result.residualMatches} marked ${result.residualMatches === 1 ? 'area still holds' : 'areas still hold'} text. Check before sharing.`)
  }

  const annotate = (type: AnnotationType, extra: Partial<{ rect: Rect; quads: Quad[]; contents: string; inkList: [number, number][][]; color: string; opacity: number; borderWidth: number }>) =>
    run('Marking up', (e, id) => e.annotate(id, page, { type, page, ...extra }).then(() => undefined))

  const placeSignature = async (rect: Rect) => {
    if (!armed) return
    const png = armed.png
    await run(tool === 'image' ? 'Adding image' : 'Signing', (e, id) => e.placeImage(id, page, rect, png))
    // The mark stays armed so a second tap places another (initials on every page, a tick beside each line). Choosing another tool puts it down.
  }
  /** Fit a mark inside a signature field, centred, keeping its proportions. */
  const placeInField = async (png: Blob, ratio: number, field: Rect) => {
    const fw = field[2] - field[0] - 6, fh = field[3] - field[1] - 6
    const w = Math.min(fw, fh / ratio), h = w * ratio
    const cx = (field[0] + field[2]) / 2, cy = (field[1] + field[3]) / 2
    await run('Signing', (e, id) => e.placeImage(id, page, [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], png))
  }

  const onDown = (e: React.PointerEvent) => {
    if (tool === 'select' || tool === 'fields') return
    if (tool === 'sign' && !armed) return setSignOpen(true)
    if (tool === 'image' && !armed) return void document.getElementById('insert-image')?.click()
    overlay.current!.setPointerCapture(e.pointerId)
    start.current = at(e)
    if (tool === 'draw') { setInk([at(e)]); erasePts.current = [at(e)] }
    else setDraft([...start.current, ...start.current] as Rect)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return
    if (tool === 'draw') setInk((p) => { const [x, y] = at(e), l = p[p.length - 1]; if (eraser) erasePts.current.push([x, y]); return Math.hypot(x - l[0], y - l[1]) * s < 2 ? p : [...p, [x, y]] })
    else setDraft(norm(start.current, at(e)))
  }
  const onUp = async (e: React.PointerEvent) => {
    if (!start.current) return
    const begin = start.current; start.current = null
    const end = at(e)
    let r = norm(begin, end), tiny = (r[2] - r[0]) * s < 6 && (r[3] - r[1]) * s < 6
    setDraft(null)
    // A tap selects the word under the finger for the text tools (edit, redact, highlight, underline, strike).
    const wordTool = tool === 'edit' || tool === 'redact' || (tool === 'markup' && (markup === 'highlight' || markup === 'underline' || markup === 'strikeout'))
    if (tiny && wordTool) {
      const q = await getEngine().wordAt(session.id, page, end)
      if (q) { r = boxOf(q); tiny = false }
    }
    if (tool === 'draw') {
      const pts = ink; setInk([])
      if (eraser) {
        const swept = erasePts.current; erasePts.current = []
        let gone = 0
        await run('Erasing', async (e, id) => { for (const p of swept) gone += await e.eraseInk(id, page, p, ERASER_RADIUS) })
        if (!gone) notify('No pen strokes there. The eraser removes strokes drawn with the pen.')
        return
      }
      if (pts.length > 1) await annotate('ink', { inkList: [pts], color: pen.color, borderWidth: pen.width })
      return
    }
    if ((tool === 'sign' || tool === 'image') && armed) {
      const w = tiny ? 150 : r[2] - r[0], h = tiny ? 150 * armed.ratio : r[3] - r[1]
      return placeSignature(tiny ? [end[0] - w / 2, end[1] - h / 2, end[0] + w / 2, end[1] + h / 2] : r)
    }
    if (tool === 'redact') { if (!tiny) await run('Marking', (en, id) => en.markRedaction(id, page, [quadOf(r)]).then(() => undefined), { marks: marks + 1 }); return }
    if (tool === 'edit') {
      if (tiny) return notify('No word there. Tap a word, or drag across the words you want to change.')
      if (info.rotation !== 0) return notify('Rotate the page back to upright before editing its text')
      const old = await getEngine().textIn(session.id, page, r)
      if (!old) return notify('No text found there. Drag across the words you want to change.')
      return setPop({ kind: 'edit', rect: r, value: old.replace(/\s+/g, ' ') })
    }
    if (tool === 'markup') {
      if (markup === 'note') return setPop({ kind: 'text', rect: [end[0], end[1], end[0] + 24, end[1] + 24], value: '', note: true })
      if (tiny) return
      if (markup === 'freetext') return setPop({ kind: 'text', rect: r, value: '', note: false })
      if (markup === 'link') return setPop({ kind: 'link', rect: r, mode: 'web', value: 'https://' })
      if (markup === 'square' || markup === 'circle') return annotate(markup, { rect: r, color: '#c2410c' })
      return annotate(markup, { quads: [quadOf(r)] })
    }
  }

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button key={t} aria-pressed={tool === t} data-testid={`tool-${t}`} disabled={Boolean(busy)}
      className="flex flex-col items-center justify-center gap-1 min-w-[56px] min-h-[56px] px-2 rounded-xl text-xs font-medium"
      style={tool === t ? { background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' } : undefined}
      onClick={() => { setTool(t); setDraft(null); setArmed(null); if (t === 'sign') setSignOpen(true); if (t === 'image') document.getElementById('insert-image')?.click() }}>{icon}<span>{label}</span></button>
  )
  const iconBtn = 'flex items-center justify-center rounded-full w-[44px] h-[44px] shrink-0 disabled:opacity-40'
  const pageHits = hits?.find((h) => h.page === page)
  const MARKUPS: [Markup, string][] = [['highlight', 'Highlight'], ['underline', 'Underline'], ['strikeout', 'Strike'], ['freetext', 'Text box'], ['square', 'Box'], ['circle', 'Circle'], ['note', 'Note'], ['link', 'Link']]

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--md-surface-container)', color: 'var(--md-on-surface)' }}>
      <header className="sticky top-0 z-30 flex items-center gap-1 px-2 h-14" style={{ background: 'var(--md-surface)', borderBottom: '1px solid var(--md-outline-variant)' }}>
        <button aria-label="Back to pages" className={iconBtn} onClick={onBack}><ArrowLeft size={24} /></button>
        <button aria-label="Previous page" className={iconBtn} disabled={page === 0} onClick={() => go(page - 1)} data-testid="prev"><ChevronLeft size={24} /></button>
        <span className="text-sm min-w-[64px] text-center shrink-0" aria-live="polite" data-testid="page-indicator">{page + 1} / {session.pages.length}</span>
        <button aria-label="Next page" className={iconBtn} disabled={page >= session.pages.length - 1} onClick={() => go(page + 1)} data-testid="next"><ChevronRight size={24} /></button>
        <span className="flex-1" />
        <button aria-label="Undo" className={iconBtn} onClick={() => void undo()} disabled={!canUndo || Boolean(busy)} data-testid="undo"><Undo2 size={22} /></button>
        <button aria-label="Redo" className={iconBtn} onClick={() => void redo()} disabled={!canRedo || Boolean(busy)} data-testid="redo"><Redo2 size={22} /></button>
        <button aria-label="Settings" className={iconBtn} onClick={onSettings} data-testid="settings"><Settings size={22} /></button>
      </header>

      {tool === 'select' && (
        <form className="flex items-center gap-2 px-4 py-2" role="search" onSubmit={(e) => { e.preventDefault(); void doSearch() }}>
          <Search size={20} aria-hidden="true" />
          <input aria-label="Search this document" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 min-w-0 min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="search" />
          <button type="button" className={iconBtn} aria-label="Contents" data-testid="contents" onClick={() => void getEngine().outline(session.id).then(setContents)}><ListTree size={22} /></button>
          {hits && <span className="text-sm" data-testid="search-count">{hits.length ? `${hitPos + 1} of ${hits.length} pages` : 'No matches'}</span>}
          {hits?.length ? (<><button type="button" className={iconBtn} aria-label="Previous match" onClick={() => stepHit(-1)}><ChevronLeft size={20} /></button><button type="button" className={iconBtn} aria-label="Next match" onClick={() => stepHit(1)}><ChevronRight size={20} /></button></>) : null}
        </form>
      )}
      {tool === 'select' && hits && !hits.length && <p className="px-4 text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>Nothing found. On a scanned page, run OCR from the page grid, then search again.</p>}

      {tool === 'markup' && (
        <div className="flex gap-2 px-4 py-2 overflow-x-auto" role="group" aria-label="Mark up type">
          {MARKUPS.map(([m, label]) => <button key={m} className={tonalBtn} aria-pressed={markup === m} data-testid={`markup-${m}`} style={markup === m ? primaryStyle : tonalStyle} onClick={() => setMarkup(m)}>{label}</button>)}
        </div>
      )}
      {tool === 'edit' && <p className="px-4 py-2 text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>Tap a word, or drag across several, to change them. Edits stay on one line.</p>}
      {tool === 'draw' && (
        <div className="px-4 py-2 flex flex-wrap items-center gap-2" role="group" aria-label="Pen">
          <button className={`${tonalBtn} flex items-center gap-2`} style={!eraser ? primaryStyle : tonalStyle} aria-pressed={!eraser} data-testid="pen-on" onClick={() => setEraser(false)}><PenTool size={18} aria-hidden="true" />Pen</button>
          <button className={`${tonalBtn} flex items-center gap-2`} style={eraser ? primaryStyle : tonalStyle} aria-pressed={eraser} data-testid="eraser-on" onClick={() => setEraser(true)}><Eraser size={18} aria-hidden="true" />Eraser</button>
          {!eraser && <>
            <span className="flex gap-1" role="radiogroup" aria-label="Pen colour">{COLOURS.map((c) => <button key={c.value} role="radio" aria-checked={pen.color === c.value} aria-label={c.name} data-testid={`pen-colour-${c.name.toLowerCase()}`} onClick={() => setPen({ ...pen, color: c.value })}
              className="w-[44px] h-[44px] rounded-full" style={{ background: c.value, boxShadow: pen.color === c.value ? '0 0 0 3px var(--md-surface), 0 0 0 5px var(--md-primary)' : '0 0 0 1px var(--md-outline)' }} />)}</span>
            <span className="flex gap-1" role="radiogroup" aria-label="Pen width">{WIDTHS.map((w) => <button key={w.value} role="radio" aria-checked={pen.width === w.value} data-testid={`pen-width-${w.name.toLowerCase()}`} className={tonalBtn} style={pen.width === w.value ? primaryStyle : tonalStyle} onClick={() => setPen({ ...pen, width: w.value })}>{w.name}</button>)}</span>
          </>}
          <p className="text-sm basis-full" style={{ color: 'var(--md-on-surface-variant)' }}>{eraser ? 'Drag across a pen stroke to remove it.' : 'Draw with your finger or mouse.'}</p>
        </div>)}
      {tool === 'sign' && armed && (
        <div className="px-4 py-2 flex items-center gap-3">
          <p className="text-sm flex-1" role="status">Tap where the signature goes, or drag a box. Tap again to place it more than once.</p>
          <button className={tonalBtn} style={tonalStyle} data-testid="sign-done" onClick={() => { setArmed(null); setTool('select') }}>Done</button>
        </div>)}
      {tool === 'image' && <p className="px-4 py-2 text-sm" role="status" data-testid="image-hint">{armed ? 'Tap where the image goes, or drag a box.' : 'Tap the page to choose a picture (PNG or JPEG).'}</p>}
      <input id="insert-image" type="file" hidden accept="image/png,image/jpeg" data-testid="insert-image" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const bm = await createImageBitmap(f); setArmed({ png: f, ratio: bm.height / bm.width }); bm.close() }} />
      {tool === 'redact' && (
        <div className="px-4 py-3 flex flex-col gap-2" style={{ background: 'var(--md-error-container)', color: 'var(--md-on-error-container)' }}>
          <p className="text-sm font-medium" data-testid="redact-banner">{marks} {marks === 1 ? 'area' : 'areas'} marked. Drag a box over anything to remove, or find text below. Nothing is removed until you apply.</p>
          <div className="flex gap-2 flex-wrap">
            <input aria-label="Text to find and mark" placeholder="Find text to mark" value={redactTerm} onChange={(e) => setRedactTerm(e.target.value)} className="flex-1 min-w-0 min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="redact-term" />
            <button className={tonalBtn} style={tonalStyle} onClick={() => void markAll()} data-testid="redact-mark">Mark all</button>
          </div>
          <div className="flex gap-2 flex-wrap" role="group" aria-label="Find and mark">
            {PRESETS.map((p) => <button key={p.id} className={tonalBtn} style={tonalStyle} disabled={Boolean(busy)} data-testid={`redact-preset-${p.id}`} onClick={() => void markPreset(p.id)}>{p.label}</button>)}
          </div>
          <button className={primaryBtn} disabled={marks === 0 || Boolean(busy)} data-testid="redact-apply"
            style={{ background: 'var(--md-error)', color: 'var(--md-on-error)' }} onClick={() => void applyRedaction()}>Apply redaction ({marks})</button>
        </div>
      )}
      {tool === 'fields' && (
        <div className="px-4 py-2 flex items-center gap-3">
          <p className="text-sm flex-1" style={{ color: 'var(--md-on-surface-variant)' }}>{fields.length ? `${fields.length} fields in this document.` : 'This document has no form fields.'}</p>
          {fields.length > 0 && <button className={tonalBtn} style={tonalStyle} data-testid="flatten" onClick={() => void run('Flattening', (e, id) => e.flatten(id))}>Flatten form</button>}
        </div>
      )}

      <main ref={mainRef} className="flex-1 overflow-auto flex justify-center px-4 py-4 pb-28" style={{ touchAction: 'pan-x pan-y' }}>
        <div style={{ width: info.width * s, height: info.height * s, position: 'relative', flex: 'none', background: 'var(--paper)', boxShadow: '0 2px 8px rgba(0,0,0,.25)' }}>
          <canvas ref={canvas} data-testid="page-canvas" data-rev={session.rev} aria-label={`Page ${page + 1}`} style={{ width: '100%', height: '100%', display: 'block' }} />
          <div ref={overlay} data-testid="overlay" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={(e) => void onUp(e)} onPointerCancel={() => { start.current = null; setDraft(null); setInk([]) }}
            style={{ position: 'absolute', inset: 0, touchAction: tool === 'select' || tool === 'fields' ? 'auto' : 'none', cursor: tool === 'select' ? 'auto' : 'crosshair' }}>
            {pageHits?.quads.map((q, i) => { const b = boxOf(q); return <div key={i} data-testid="hit" style={{ position: 'absolute', left: b[0] * s, top: b[1] * s, width: (b[2] - b[0]) * s, height: (b[3] - b[1]) * s, background: 'rgba(255,200,0,.4)', pointerEvents: 'none' }} /> })}
            {draft && <div style={{ position: 'absolute', left: draft[0] * s, top: draft[1] * s, width: (draft[2] - draft[0]) * s, height: (draft[3] - draft[1]) * s, border: `2px dashed ${tool === 'redact' ? 'var(--md-error)' : 'var(--md-primary)'}`, background: tool === 'redact' ? 'var(--redact-mark)' : 'rgba(35,115,82,.12)', pointerEvents: 'none' }} />}
            {ink.length > 1 && <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}><polyline fill="none" stroke={eraser ? '#ba1a1a' : pen.color} strokeOpacity={eraser ? 0.5 : 1} strokeWidth={eraser ? ERASER_RADIUS * 2 * s : pen.width * s} strokeLinecap="round" strokeLinejoin="round" points={ink.map((p) => `${p[0] * s},${p[1] * s}`).join(' ')} /></svg>}
            {tool === 'fields' && fields.filter((f) => f.page === page).map((f) => {
              const st: React.CSSProperties = { position: 'absolute', left: f.rect[0] * s, top: f.rect[1] * s, width: (f.rect[2] - f.rect[0]) * s, height: (f.rect[3] - f.rect[1]) * s, minWidth: 24, minHeight: 24 }
              if (f.type === 'checkbox' || f.type === 'radio') return <input key={f.name + f.rect[0]} type="checkbox" aria-label={f.name} checked={Boolean(f.value)} style={st} data-testid="field" onChange={(e) => void run('Filling', (en, id) => en.setField(id, f.name, e.target.checked))} />
              if (f.type === 'choice') return <select key={f.name} aria-label={f.name} defaultValue={String(f.value)} style={st} data-testid="field" onChange={(e) => void run('Filling', (en, id) => en.setField(id, f.name, e.target.value))}>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}</select>
              if (f.type === 'signature') return <button key={f.name + f.rect[0] + f.rect[1]} aria-label={`Sign ${f.name || 'here'}`} data-testid="sign-field" className="rounded-md text-xs font-medium"
                style={{ ...st, background: 'rgba(196,238,220,.7)', border: '2px dashed var(--md-primary)', color: '#0b3d28' }}
                onClick={() => { fieldTarget.current = f.rect; if (armed) void placeInField(armed.png, armed.ratio, f.rect); else setSignOpen(true) }}>Sign here</button>
              if (f.type === 'text') return <input key={f.name + f.rect[0]} aria-label={f.name} defaultValue={String(f.value)} style={{ ...st, background: 'rgba(196,238,220,.6)', border: '1px solid var(--md-primary)', fontSize: Math.max(10, (f.rect[3] - f.rect[1]) * s * 0.6) }} data-testid="field"
                onBlur={(e) => { if (e.target.value !== String(f.value)) void run('Filling', (en, id) => en.setField(id, f.name, e.target.value)) }} />
              return null
            })}
          </div>
        </div>
      </main>

      <div className="fixed right-3 bottom-[88px] z-30 flex flex-col gap-2" role="group" aria-label="Zoom">
        <span className="text-xs text-center rounded-full px-2 py-1" style={{ background: 'var(--md-surface-container-high)' }} data-testid="zoom-level" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button aria-label="Zoom in" className={`${iconBtn} shadow-md`} style={{ background: 'var(--md-surface-container-high)' }} onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}><ZoomIn size={22} /></button>
        <button aria-label="Zoom out" className={`${iconBtn} shadow-md`} style={{ background: 'var(--md-surface-container-high)' }} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}><ZoomOut size={22} /></button>
      </div>

      <nav aria-label="Tools" className="fixed bottom-0 left-0 right-0 z-30 flex justify-center gap-1 px-2 py-2 overflow-x-auto" style={{ background: 'var(--md-surface-container-high)', borderTop: '1px solid var(--md-outline-variant)' }}>
        {toolBtn('select', <MousePointer2 size={22} />, 'Select')}
        {toolBtn('edit', <Type size={22} />, 'Edit text')}
        {toolBtn('markup', <Highlighter size={22} />, 'Mark up')}
        {toolBtn('draw', <PenLine size={22} />, 'Draw')}
        {toolBtn('sign', <Signature size={22} />, 'Sign')}
        {toolBtn('image', <ImagePlus size={22} />, 'Image')}
        {toolBtn('redact', <EyeOff size={22} />, 'Redact')}
        {toolBtn('fields', <TextCursorInput size={22} />, 'Fields')}
      </nav>

      <Sheet open={contents !== null} title="Contents" onClose={() => setContents(null)}>
        {contents?.length ? (
          <ul className="flex flex-col">{contents.map((c, i) => (
            <li key={`${i}-${c.page}`}><button className="w-full text-left min-h-[44px] rounded-xl px-3 flex items-center justify-between gap-3" style={{ paddingLeft: 12 + c.depth * 16 }} data-testid="contents-item"
              onClick={() => { setPage(c.page); setContents(null) }}><span className="truncate">{c.title}</span><span className="text-sm shrink-0" style={{ color: 'var(--md-on-surface-variant)' }}>{c.page + 1}</span></button></li>))}</ul>
        ) : <p>This document has no contents list.</p>}
      </Sheet>
      <SignSheet open={signOpen} onClose={() => { setSignOpen(false); if (!armed && tool !== 'fields') setTool('select') }} onUse={async (png) => {
        const bm = await createImageBitmap(png); const ratio = bm.height / bm.width; bm.close(); setSignOpen(false)
        const target = tool === 'fields' ? fieldTarget.current : null
        fieldTarget.current = null
        if (target) await placeInField(png, ratio, target)
        else setArmed({ png, ratio })
      }} />
      <Sheet open={pop?.kind === 'edit'} title="Edit text" onClose={() => setPop(null)}>
        <label htmlFor="edit-text">Replace the selected words with</label>
        <textarea id="edit-text" rows={2} value={pop?.value ?? ''} onChange={(e) => pop && setPop({ ...pop, value: e.target.value })} className="rounded-xl px-4 py-3" style={fieldStyle} data-testid="edit-text" />
        <p className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>The new text is written on the same line. If the original font cannot be reused, a close match is used and you will be told.</p>
        <button className={primaryBtn} style={primaryStyle} data-testid="edit-apply" onClick={async () => {
          if (pop?.kind !== 'edit') return
          const { rect, value } = pop; setPop(null)
          let fallback = false
          await run('Editing text', async (e, id) => { fallback = (await e.replaceText(id, page, [quadOf(rect)], value)).usedFallbackFont })
          if (fallback) notify('The original font could not be reused, so a close match was used. Check the line before you save.')
        }}>Apply</button>
      </Sheet>
      <Sheet open={pop?.kind === 'link'} title="Add a link" onClose={() => setPop(null)}>
        <div role="radiogroup" aria-label="Where the link goes" className="flex gap-2">
          <button role="radio" aria-checked={pop?.kind === 'link' && pop.mode === 'web'} className={tonalBtn} style={pop?.kind === 'link' && pop.mode === 'web' ? primaryStyle : tonalStyle} data-testid="link-web" onClick={() => pop?.kind === 'link' && setPop({ ...pop, mode: 'web', value: 'https://' })}>Web address</button>
          <button role="radio" aria-checked={pop?.kind === 'link' && pop.mode === 'page'} className={tonalBtn} style={pop?.kind === 'link' && pop.mode === 'page' ? primaryStyle : tonalStyle} data-testid="link-page" onClick={() => pop?.kind === 'link' && setPop({ ...pop, mode: 'page', value: '1' })}>A page in this file</button>
        </div>
        <label htmlFor="link-value">{pop?.kind === 'link' && pop.mode === 'page' ? `Page number (1 to ${session.pages.length})` : 'Address'}</label>
        <input id="link-value" value={pop?.kind === 'link' ? pop.value : ''} inputMode={pop?.kind === 'link' && pop.mode === 'page' ? 'numeric' : 'url'} onChange={(e) => pop?.kind === 'link' && setPop({ ...pop, value: e.target.value })} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="link-value" />
        <button className={primaryBtn} style={primaryStyle} data-testid="link-apply" onClick={async () => {
          if (pop?.kind !== 'link') return
          const { rect, mode, value } = pop
          if (mode === 'web' && !/^(https?:\/\/|mailto:|tel:)\S+$/i.test(value.trim())) return notify('Use an address that starts with https://, http://, mailto: or tel:')
          const n = Math.floor(Number(value))
          if (mode === 'page' && !(n >= 1 && n <= session.pages.length)) return notify(`Choose a page from 1 to ${session.pages.length}`)
          setPop(null)
          await run('Adding link', (e, id) => e.addLink(id, page, rect, mode === 'web' ? { uri: value.trim() } : { page: n - 1 }))
        }}>Add link</button>
      </Sheet>
      <Sheet open={pop?.kind === 'text'} title={pop?.kind === 'text' && pop.note ? 'Add a note' : 'Add text'} onClose={() => setPop(null)}>
        <label htmlFor="note-text">Text</label>
        <textarea id="note-text" rows={3} value={pop?.value ?? ''} onChange={(e) => pop && setPop({ ...pop, value: e.target.value })} className="rounded-xl px-4 py-3" style={fieldStyle} data-testid="note-text" />
        {pop?.kind === 'text' && !pop.note && (<>
          <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Font">
            {(['sans', 'serif', 'mono'] as const).map((f) => <button key={f} role="radio" aria-checked={textStyle.font === f} data-testid={`text-font-${f}`} className={tonalBtn} style={{ ...(textStyle.font === f ? primaryStyle : tonalStyle), fontFamily: f === 'serif' ? 'Georgia, "Times New Roman", serif' : f === 'mono' ? '"Courier Prime", monospace' : undefined }}
              onClick={() => setTextStyle({ ...textStyle, font: f })}>{f === 'sans' ? 'Sans' : f === 'serif' ? 'Serif' : 'Mono'}</button>)}
            <button aria-pressed={textStyle.bold} data-testid="text-bold" className={tonalBtn} style={{ ...(textStyle.bold ? primaryStyle : tonalStyle), fontWeight: 700 }} onClick={() => setTextStyle({ ...textStyle, bold: !textStyle.bold })}>B</button>
            <button aria-pressed={textStyle.italic} data-testid="text-italic" className={tonalBtn} style={{ ...(textStyle.italic ? primaryStyle : tonalStyle), fontStyle: 'italic' }} onClick={() => setTextStyle({ ...textStyle, italic: !textStyle.italic })}>I</button>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <label className="flex items-center gap-2"><span>Size</span>
              <input type="number" min={6} max={96} value={textStyle.size} data-testid="text-size" onChange={(e) => setTextStyle({ ...textStyle, size: Math.max(6, Math.min(96, Number(e.target.value) || 12)) })} className="w-20 min-h-[44px] rounded-xl px-3" style={fieldStyle} /></label>
            <span className="flex gap-1" role="radiogroup" aria-label="Text colour">{COLOURS.map((c) => <button key={c.value} role="radio" aria-checked={textStyle.color === c.value} aria-label={c.name} data-testid={`text-colour-${c.name.toLowerCase()}`} onClick={() => setTextStyle({ ...textStyle, color: c.value })}
              className="w-[44px] h-[44px] rounded-full" style={{ background: c.value, boxShadow: textStyle.color === c.value ? '0 0 0 3px var(--md-surface-container-low), 0 0 0 5px var(--md-primary)' : '0 0 0 1px var(--md-outline)' }} />)}</span>
          </div>
        </>)}
        <button className={primaryBtn} style={primaryStyle} data-testid="note-apply" onClick={async () => {
          if (pop?.kind !== 'text' || !pop.value.trim()) return
          const { rect, value, note } = pop; setPop(null)
          if (note) return void await annotate('note', { rect, contents: value })
          let whole = true
          await run('Adding text', async (e, id) => { whole = await e.addText(id, page, rect, value, textStyle) })
          if (!whole) notify('Some characters are not in this font and were shown as question marks.')
        }}>Add</button>
      </Sheet>
    </div>
  )
}
