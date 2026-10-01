// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import Sheet from '@/features/common/Sheet'
import { useReceipt } from '@/features/privacy-receipt/receipt'

/** Green "0 bytes sent" chip on Home that opens the receipt (F14). It turns amber if the page ever reaches another origin. */
export default function PrivacyReceipt() {
  const r = useReceipt()
  const [open, setOpen] = useState(false)
  const clean = r.otherOrigins === 0 && r.blocked === 0
  const row = (label: string, value: string | number, testid: string) => (
    <div className="flex justify-between gap-4 min-h-[44px] items-center" style={{ borderBottom: '1px solid var(--md-outline-variant)' }}>
      <dt>{label}</dt><dd className="font-medium" data-testid={testid}>{value}</dd>
    </div>
  )
  return (
    <>
      <button className="min-h-[44px] px-4 rounded-full inline-flex items-center gap-2 text-sm font-medium" data-testid="receipt-chip" onClick={() => setOpen(true)}
        style={clean ? { background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' } : { background: 'var(--md-error-container)', color: 'var(--md-on-error-container)' }}>
        <ShieldCheck size={18} aria-hidden="true" />{clean ? '0 bytes sent' : 'Check the privacy receipt'}
      </button>
      <Sheet open={open} title="Privacy receipt" onClose={() => setOpen(false)}>
        <p data-testid="receipt-summary">{clean ? 'Nothing you opened has left this device.' : 'This page reached another site. Details below.'}</p>
        <dl>
          {row('Documents opened', r.documentsOpened, 'receipt-docs')}
          {row('Requests to other sites', r.otherOrigins, 'receipt-other')}
          {row('Requests to the helper program on this device', r.companion, 'receipt-companion')}
          {row('Requests blocked by the security policy', r.blocked, 'receipt-blocked')}
          {row('App files loaded from mypdf.gachichio.org', r.sameOrigin, 'receipt-same')}
        </dl>
        <p className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>
          The app has no server to send files to and no analytics. Its security policy only allows files from its own address. Links you tap, such as Support, open in a new tab and carry no document data.
        </p>
      </Sheet>
    </>
  )
}
