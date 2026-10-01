// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { useSession } from '@/app/session'
import Sheet, { primaryBtn, primaryStyle, fieldStyle } from '@/features/common/Sheet'

export default function PasswordSheet() {
  const { pending, unlock, cancelUnlock } = useSession()
  const [pw, setPw] = useState('')
  return (
    <Sheet open={Boolean(pending)} title="Password needed" onClose={cancelUnlock}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void unlock(pw); setPw('') }}>
        <label htmlFor="pdf-password">{pending?.name} is password protected</label>
        <input id="pdf-password" type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} className="min-h-11 rounded-xl px-4" style={fieldStyle} />
        {pending?.wrong && <p role="alert" style={{ color: 'var(--md-error)' }}>That password did not work. Try again.</p>}
        <button type="submit" className={primaryBtn} style={primaryStyle}>Unlock</button>
      </form>
    </Sheet>
  )
}
