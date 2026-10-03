// SPDX-License-Identifier: AGPL-3.0-or-later
// The Canvas sheets for adding a link, a note and styled text.
import type { Dispatch, SetStateAction } from 'react'
import type { AnnotationType, Rect, TextStyle } from '@/engine/PdfEngine'
import type { getEngine } from '@/engine/mupdf/client'
import Sheet, { primaryBtn, primaryStyle, tonalBtn, tonalStyle, fieldStyle } from '@/features/common/Sheet'
import { COLOURS, type Pop } from '@/features/canvas/shared'

interface Props {
  pop: Pop; setPop: Dispatch<SetStateAction<Pop>>; page: number; pageCount: number
  run: (label: string, fn: (engine: ReturnType<typeof getEngine>, id: string) => Promise<void>) => Promise<void>
  notify: (m: string) => void
  annotate: (type: AnnotationType, extra: Partial<{ rect: Rect; contents: string }>) => Promise<unknown>
  textStyle: TextStyle; setTextStyle: (s: TextStyle) => void
}

export default function PopSheets({ pop, setPop, page, pageCount, run, notify, annotate, textStyle, setTextStyle }: Props) {
  return (<>
      <Sheet open={pop?.kind === 'link'} title="Add a link" onClose={() => setPop(null)}>
        <div role="radiogroup" aria-label="Where the link goes" className="flex gap-2">
          <button role="radio" aria-checked={pop?.kind === 'link' && pop.mode === 'web'} className={tonalBtn} style={pop?.kind === 'link' && pop.mode === 'web' ? primaryStyle : tonalStyle} data-testid="link-web" onClick={() => pop?.kind === 'link' && setPop({ ...pop, mode: 'web', value: 'https://' })}>Web address</button>
          <button role="radio" aria-checked={pop?.kind === 'link' && pop.mode === 'page'} className={tonalBtn} style={pop?.kind === 'link' && pop.mode === 'page' ? primaryStyle : tonalStyle} data-testid="link-page" onClick={() => pop?.kind === 'link' && setPop({ ...pop, mode: 'page', value: '1' })}>A page in this file</button>
        </div>
        <label htmlFor="link-value">{pop?.kind === 'link' && pop.mode === 'page' ? `Page number (1 to ${pageCount})` : 'Address'}</label>
        <input id="link-value" value={pop?.kind === 'link' ? pop.value : ''} inputMode={pop?.kind === 'link' && pop.mode === 'page' ? 'numeric' : 'url'} onChange={(e) => pop?.kind === 'link' && setPop({ ...pop, value: e.target.value })} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="link-value" />
        <button className={primaryBtn} style={primaryStyle} data-testid="link-apply" onClick={async () => {
          if (pop?.kind !== 'link') return
          const { rect, mode, value } = pop
          if (mode === 'web' && !/^(https?:\/\/|mailto:|tel:)\S+$/i.test(value.trim())) return notify('Use an address that starts with https://, http://, mailto: or tel:')
          const n = Math.floor(Number(value))
          if (mode === 'page' && !(n >= 1 && n <= pageCount)) return notify(`Choose a page from 1 to ${pageCount}`)
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
  </>)
}
