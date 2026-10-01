// SPDX-License-Identifier: AGPL-3.0-or-later
// Support sheet (F15, R15, builder section 6.1). Values come only from src/config/support.ts. No amounts, no gift-size wording.
import { useState } from 'react'
import { Coffee } from 'lucide-react'
import Sheet, { tonalBtn, tonalStyle } from '@/features/common/Sheet'
import { PAYSTACK_URL, LIGHTNING_ADDRESS, BTC_ADDRESS, lightningUri, bitcoinUri } from '@/config/support'

const card = { background: 'var(--md-surface-container-high)', borderRadius: 'var(--r-lg)' } as const

export function SupportButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (<>
    <button className={`${tonalBtn} inline-flex items-center gap-2 ${className}`} style={tonalStyle} data-testid="support-open" onClick={() => setOpen(true)}><Coffee size={18} aria-hidden="true" />Support myPDF</button>
    <SupportSheet open={open} onClose={() => setOpen(false)} />
  </>)
}

export default function SupportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (what: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(what); setTimeout(() => setCopied((c) => (c === what ? null : c)), 2500) } catch { setCopied('failed') }
  }
  const addr = (label: string, sub: string, value: string, uri: string, id: string) => (
    <div className="p-4 flex flex-col gap-2" style={card}>
      <div><div className="font-medium">{label}</div><div className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>{sub}</div></div>
      <code className="text-sm break-all" style={{ fontFamily: 'var(--font-narrative)' }} data-testid={`${id}-value`}>{value}</code>
      <div className="flex gap-2">
        <button className={tonalBtn} style={tonalStyle} data-testid={`${id}-copy`} onClick={() => void copy(id, value)}>{copied === id ? 'Copied' : 'Copy'}</button>
        <a className={`${tonalBtn} inline-flex items-center`} style={tonalStyle} href={uri} data-testid={`${id}-wallet`}>Open wallet</a>
      </div>
    </div>
  )
  return (
    <Sheet open={open} title="Support myPDF" onClose={onClose}>
      <p>myPDF is free and has no ads. If it saved you time, you can help keep it that way.</p>
      <p className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>Payments leave myPDF only when you tap. Your documents never do.</p>
      <a className="p-4 flex flex-col gap-1 no-underline" style={{ ...card, color: 'var(--md-on-surface)' }} href={PAYSTACK_URL} target="_blank" rel="noopener noreferrer" data-testid="paystack">
        <span className="font-medium">Card or M-Pesa</span><span className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>Opens Paystack in a new tab</span>
      </a>
      {addr('Bitcoin, Lightning', 'Instant, near-zero fees', LIGHTNING_ADDRESS, lightningUri(), 'lightning')}
      {addr('Bitcoin, on-chain', 'Taproot address, any Bitcoin wallet', BTC_ADDRESS, bitcoinUri(), 'onchain')}
      {copied === 'failed' && <p role="alert" style={{ color: 'var(--md-error)' }}>Copying is blocked here. Select the address and copy it by hand.</p>}
    </Sheet>
  )
}
