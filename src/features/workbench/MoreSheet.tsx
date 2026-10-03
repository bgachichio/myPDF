// SPDX-License-Identifier: AGPL-3.0-or-later
// The tools that do not fit the dock: split into files, pages to pictures, crop, page numbers with options, save the text, and the file's signatures.
import { useState, type ReactNode } from 'react'
import { Crop, FileImage, FileText, Hash, Layers2, Scissors, ShieldCheck } from 'lucide-react'
import { useSession } from '@/app/session'
import { getEngine } from '@/engine/mupdf/client'
import type { StampPosition } from '@/engine/PdfEngine'
import Sheet, { primaryBtn, primaryStyle, tonalBtn, tonalStyle, fieldStyle } from '@/features/common/Sheet'
import { saveBytes } from '@/features/common/download'
import { formatRanges, parseRanges, splitGroups } from '@/features/workbench/ranges'
import { zip } from '@/lib/zip'

export type MorePanel = null | 'menu' | 'split' | 'images' | 'crop' | 'numbers' | 'sigs'
interface Props { panel: MorePanel; setPanel: (p: MorePanel) => void; sel: number[] }

const stem = (name: string) => name.replace(/\.pdf$/i, '')
const pad = (i: number, n: number) => String(i + 1).padStart(String(n).length, '0')
const MM = 72 / 25.4
const hint = { color: 'var(--md-on-surface-variant)' } as const

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="flex flex-col gap-1"><label htmlFor={id}>{label}</label>{children}</div>
}

export default function MoreSheet({ panel, setPanel, sel }: Props) {
  const { session, run, extractPages, notify } = useSession()
  const [working, setWorking] = useState<string | null>(null)
  // split
  const [splitMode, setSplitMode] = useState<'every' | 'at' | 'ranges'>('every')
  const [splitText, setSplitText] = useState('5')
  // images
  const [fmt, setFmt] = useState<'png' | 'jpg'>('png')
  const [dpi, setDpi] = useState(150)
  const [imgScope, setImgScope] = useState<'all' | 'selected' | 'range'>('all')
  const [imgRange, setImgRange] = useState('')
  // crop
  const [margins, setMargins] = useState({ top: '10', right: '10', bottom: '10', left: '10' })
  const [cropScope, setCropScope] = useState<'all' | 'selected'>('all')
  // numbers
  const [numPos, setNumPos] = useState<StampPosition>('bottom-center')
  const [numFormat, setNumFormat] = useState<'n' | 'page-n' | 'n-of-total'>('n')
  const [numStart, setNumStart] = useState('1')
  const [numSize, setNumSize] = useState('10')
  if (!session) return null
  const n = session.pages.length, base = stem(session.name)
  const close = () => setPanel(null)
  const back = () => setPanel('menu')
  const hasSel = sel.length > 0
  const item = (id: string, icon: ReactNode, title: string, note: string, to: MorePanel | (() => void)) => (
    <li key={id}><button className="w-full min-h-[56px] rounded-2xl px-4 py-2 flex items-center gap-4 text-left" style={{ background: 'var(--md-surface-container)' }} data-testid={id}
      onClick={() => (typeof to === 'function' ? to() : setPanel(to))}>
      <span aria-hidden="true">{icon}</span><span className="flex flex-col"><span className="font-medium">{title}</span><span className="text-sm" style={hint}>{note}</span></span></button></li>
  )

  const doSplit = async () => {
    const groups = splitGroups(splitMode, n, splitText)
    if (!groups) return notify(splitMode === 'every' ? 'Enter how many pages go in each file, for example 5' : splitMode === 'at' ? 'Enter page numbers to cut after, for example 3, 7' : 'Use page numbers like 1-3, 4-9')
    if (groups.length < 2) return notify('That makes only one file. Choose a smaller number or more cut points.')
    if (groups.length > 200) return notify('That makes more than 200 files. Choose fewer.')
    setWorking('Splitting')
    try {
      const files = []
      for (let k = 0; k < groups.length; k++) {
        setWorking(`Splitting ${k + 1} of ${groups.length}`)
        files.push({ name: `${base}-${pad(k, groups.length)}-pages-${formatRanges(groups[k]).replace(/[ ,]+/g, '_')}.pdf`, bytes: await extractPages(groups[k]) })
      }
      const r = await saveBytes(`${base}-split.zip`, zip(files), 'zip')
      if (r !== 'cancelled') { notify(`Saved ${groups.length} files in ${base}-split.zip`); close() }
    } catch { notify('Split failed') } finally { setWorking(null) }
  }

  const doImages = async () => {
    const pages = imgScope === 'all' ? Array.from({ length: n }, (_, i) => i) : imgScope === 'selected' ? sel : parseRanges(imgRange, n)
    if (!pages?.length) return notify(imgScope === 'range' ? 'Use page numbers like 1-3, 5' : 'Select some pages first')
    const engine = getEngine(), mime = fmt === 'png' ? 'image/png' : 'image/jpeg'
    setWorking('Rendering')
    try {
      const files = []
      for (let k = 0; k < pages.length; k++) {
        setWorking(`Rendering ${k + 1} of ${pages.length}`)
        const info = session.pages[pages[k]]
        const scale = Math.min(dpi / 72, 7000 / Math.max(info.width, info.height))
        const bm = await engine.render(session.id, pages[k], scale)
        const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height
        const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bm, 0, 0); bm.close()
        const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('image'))), mime, 0.92))
        files.push({ name: `${base}-page-${pad(pages[k], n)}.${fmt}`, bytes: new Uint8Array(await blob.arrayBuffer()) })
      }
      const r = files.length === 1 ? await saveBytes(files[0].name, files[0].bytes, fmt) : await saveBytes(`${base}-pages.zip`, zip(files), 'zip')
      if (r !== 'cancelled') { notify(files.length === 1 ? `Saved ${files[0].name}` : `Saved ${files.length} pictures in ${base}-pages.zip`); close() }
    } catch { notify('Saving pictures failed') } finally { setWorking(null) }
  }

  const doCrop = async () => {
    const m = Object.fromEntries(Object.entries(margins).map(([k, v]) => [k, Number(v)])) as Record<'top' | 'right' | 'bottom' | 'left', number>
    if (Object.values(m).some((v) => !Number.isFinite(v) || v < 0)) return notify('Margins are numbers of millimetres, zero or more')
    const pages = cropScope === 'selected' && hasSel ? sel : Array.from({ length: n }, (_, i) => i)
    close()
    await run('Cropping', (e, id) => e.crop(id, pages, { top: m.top * MM, right: m.right * MM, bottom: m.bottom * MM, left: m.left * MM }))
  }

  const doNumbers = async () => {
    const start = Math.floor(Number(numStart)), size = Number(numSize)
    if (!Number.isFinite(start) || start < 0 || !(size >= 6 && size <= 36)) return notify('Start at a page number from 0, with a size from 6 to 36')
    close()
    await run('Numbering pages', (e, id) => e.stamp(id, 'pageNumbers', undefined, { position: numPos, format: numFormat, start, size }))
  }

  const doText = async () => {
    setWorking('Reading the text')
    try {
      const engine = getEngine(), parts: string[] = []
      for (let i = 0; i < n; i++) parts.push((await engine.text(session.id, i)).trimEnd())
      if (!parts.some((p) => p.trim())) return notify('No text found. If these pages are scans, run OCR first, then try again.')
      const r = await saveBytes(`${base}.txt`, new TextEncoder().encode(parts.join('\n\n\u000c\n')), 'txt')
      if (r !== 'cancelled') { notify(`Saved ${base}.txt`); close() }
    } catch { notify('Saving the text failed') } finally { setWorking(null) }
  }

  const doFlatten = async () => {
    if (session.marks > 0) return notify('Apply or clear the redaction marks first')
    close()
    await run('Making marks permanent', (e, id) => e.flatten(id, true))
    notify('Marks are now part of the page. You can undo this.')
  }

  const sigs = session.signatures
  const stale = session.rev > 0
  const label = (v: 'valid' | 'changed' | 'unverified') => (v === 'valid' ? 'Signed content unchanged' : v === 'changed' ? 'Changed since signing' : 'Could not be checked')
  const fmtDate = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}` : 'unknown date')

  return (<>
    <Sheet open={panel === 'menu'} title="More tools" onClose={close}>
      <ul className="flex flex-col gap-2">
        {item('more-split', <Scissors size={22} />, 'Split into files', 'Every few pages, or at the pages you choose, as a ZIP', 'split')}
        {item('more-images', <FileImage size={22} />, 'Pages to pictures', 'Save pages as PNG or JPEG', 'images')}
        {item('more-crop', <Crop size={22} />, 'Crop pages', 'Trim the margins', 'crop')}
        {item('more-numbers', <Hash size={22} />, 'Page numbers', 'Choose where, which style and where to start', 'numbers')}
        {item('more-text', <FileText size={22} />, 'Save the text', 'A plain text file of every page', () => void doText())}
        {item('more-flatten', <Layers2 size={22} />, 'Make marks permanent', 'Fix highlights, drawings and notes into the page', () => void doFlatten())}
        {item('more-sigs', <ShieldCheck size={22} />, 'Signatures in this file', sigs.length ? `${sigs.length} found` : 'None found', 'sigs')}
      </ul>
    </Sheet>

    <Sheet open={panel === 'split'} title="Split into files" onClose={close}>
      <div role="radiogroup" aria-label="How to split" className="flex gap-2 flex-wrap">
        {([['every', 'Every N pages', '5'], ['at', 'After pages', '3, 7'], ['ranges', 'By ranges', '1-3, 4-9']] as const).map(([m, label, example]) =>
          <button key={m} role="radio" aria-checked={splitMode === m} className={tonalBtn} style={splitMode === m ? primaryStyle : tonalStyle} data-testid={`split-${m}`} onClick={() => { setSplitMode(m); setSplitText(example) }}>{label}</button>)}
      </div>
      <Field id="split-text" label={splitMode === 'every' ? 'Pages in each file' : splitMode === 'at' ? 'Cut after these page numbers' : 'One file for each range'}>
        <input id="split-text" value={splitText} onChange={(e) => setSplitText(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="split-text" />
      </Field>
      <p className="text-sm" style={hint} data-testid="split-preview">{(() => { const g = splitGroups(splitMode, n, splitText); return g ? `Makes ${g.length} ${g.length === 1 ? 'file' : 'files'}: ${g.slice(0, 6).map((x) => formatRanges(x)).join(' | ')}${g.length > 6 ? ' ...' : ''}` : `This document has ${n} pages.` })()}</p>
      <button className={primaryBtn} style={primaryStyle} disabled={Boolean(working)} data-testid="split-apply" onClick={() => void doSplit()}>{working ?? 'Save as a ZIP of PDFs'}</button>
      <button className={tonalBtn} style={tonalStyle} onClick={back}>Back</button>
    </Sheet>

    <Sheet open={panel === 'images'} title="Pages to pictures" onClose={close}>
      <div role="radiogroup" aria-label="Picture type" className="flex gap-2">
        {(['png', 'jpg'] as const).map((f) => <button key={f} role="radio" aria-checked={fmt === f} className={tonalBtn} style={fmt === f ? primaryStyle : tonalStyle} data-testid={`img-${f}`} onClick={() => setFmt(f)}>{f === 'png' ? 'PNG (sharp)' : 'JPEG (smaller)'}</button>)}
      </div>
      <Field id="img-dpi" label="Quality">
        <select id="img-dpi" value={dpi} onChange={(e) => setDpi(Number(e.target.value))} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="img-dpi">
          <option value={96}>Screen (96 dpi)</option><option value={150}>Good (150 dpi)</option><option value={300}>Print (300 dpi)</option></select>
      </Field>
      <Field id="img-scope" label="Pages">
        <select id="img-scope" value={imgScope} onChange={(e) => setImgScope(e.target.value as typeof imgScope)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="img-scope">
          <option value="all">All {n} pages</option><option value="selected" disabled={!hasSel}>{hasSel ? `The ${sel.length} selected` : 'Selected pages (none selected)'}</option><option value="range">A range</option></select>
      </Field>
      {imgScope === 'range' && <input aria-label="Page range" placeholder="1-3, 5" value={imgRange} onChange={(e) => setImgRange(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="img-range" />}
      <p className="text-sm" style={hint}>One page is saved as a picture. More than one is saved as a ZIP.</p>
      <button className={primaryBtn} style={primaryStyle} disabled={Boolean(working)} data-testid="img-apply" onClick={() => void doImages()}>{working ?? 'Save pictures'}</button>
      <button className={tonalBtn} style={tonalStyle} onClick={back}>Back</button>
    </Sheet>

    <Sheet open={panel === 'crop'} title="Crop pages" onClose={close}>
      <p className="text-sm" style={hint}>Millimetres to trim from each edge, as the page looks on screen. Cropping hides the edge; it does not remove what is under it. Use Redact to remove content for good.</p>
      <div className="grid grid-cols-2 gap-3">
        {(['top', 'right', 'bottom', 'left'] as const).map((k) => <Field key={k} id={`crop-${k}`} label={k[0].toUpperCase() + k.slice(1)}>
          <input id={`crop-${k}`} type="number" min={0} step={1} inputMode="decimal" value={margins[k]} onChange={(e) => setMargins({ ...margins, [k]: e.target.value })} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid={`crop-${k}`} /></Field>)}
      </div>
      <div role="radiogroup" aria-label="Pages to crop" className="flex gap-2">
        <button role="radio" aria-checked={cropScope === 'all'} className={tonalBtn} style={cropScope === 'all' ? primaryStyle : tonalStyle} data-testid="crop-all" onClick={() => setCropScope('all')}>All pages</button>
        <button role="radio" aria-checked={cropScope === 'selected'} disabled={!hasSel} className={tonalBtn} style={cropScope === 'selected' ? primaryStyle : tonalStyle} data-testid="crop-selected" onClick={() => setCropScope('selected')}>{hasSel ? `The ${sel.length} selected` : 'Selected (none)'}</button>
      </div>
      <button className={primaryBtn} style={primaryStyle} data-testid="crop-apply" onClick={() => void doCrop()}>Crop</button>
      <button className={tonalBtn} style={tonalStyle} onClick={back}>Back</button>
    </Sheet>

    <Sheet open={panel === 'numbers'} title="Page numbers" onClose={close}>
      <Field id="num-pos" label="Position">
        <select id="num-pos" value={numPos} onChange={(e) => setNumPos(e.target.value as StampPosition)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="num-pos">
          <option value="bottom-center">Bottom centre</option><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option>
          <option value="top-center">Top centre</option><option value="top-right">Top right</option><option value="top-left">Top left</option></select>
      </Field>
      <Field id="num-format" label="Style">
        <select id="num-format" value={numFormat} onChange={(e) => setNumFormat(e.target.value as typeof numFormat)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="num-format">
          <option value="n">3</option><option value="page-n">Page 3</option><option value="n-of-total">3 of {n}</option></select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="num-start" label="First page is number"><input id="num-start" type="number" min={0} value={numStart} onChange={(e) => setNumStart(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="num-start" /></Field>
        <Field id="num-size" label="Size"><input id="num-size" type="number" min={6} max={36} value={numSize} onChange={(e) => setNumSize(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="num-size" /></Field>
      </div>
      <button className={primaryBtn} style={primaryStyle} data-testid="num-apply" onClick={() => void doNumbers()}>Add to every page</button>
      <button className={tonalBtn} style={tonalStyle} onClick={back}>Back</button>
    </Sheet>

    <Sheet open={panel === 'sigs'} title="Signatures in this file" onClose={close}>
      {sigs.length === 0 ? <p data-testid="sigs-none">No signatures were found when this file was opened.</p> : (<>
        {stale && <p role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--md-error-container)', color: 'var(--md-on-error-container)' }} data-testid="sigs-stale">You have edited this file since it was opened. Saving it now will break these signatures.</p>}
        <ul className="flex flex-col gap-3">{sigs.map((s, i) => (
          <li key={i} className="rounded-2xl px-4 py-3 flex flex-col gap-1" style={{ background: 'var(--md-surface-container)' }} data-testid="sig-row">
            <span className="font-medium">{s.signer}</span>
            <span data-testid="sig-state">{label(s.integrity)} - {fmtDate(s.signedAt)}</span>
            <span className="text-sm" style={hint}>{s.note}</span>
            {s.reason && <span className="text-sm" style={hint}>Reason: {s.reason}</span>}
            {s.location && <span className="text-sm" style={hint}>Location: {s.location}</span>}
            <span className="text-sm" style={hint}>{s.selfSigned ? 'This certificate was issued by the signer, so it proves the file is unchanged but not who the signer is.' : `Issued by ${s.issuer}. myPDF does not check this against a list of trusted issuers.`}{s.expired ? ' The certificate had expired when the signature was made.' : ''}</span>
          </li>))}</ul>
      </>)}
      <p className="text-sm" style={hint}>This check reads the signature on this device. It confirms the signed content has not changed. It does not check revocation or contact anyone.</p>
      <button className={tonalBtn} style={tonalStyle} onClick={back}>Back</button>
    </Sheet>
  </>)
}
