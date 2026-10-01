// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import Sheet, { primaryBtn, primaryStyle, tonalBtn, tonalStyle, fieldStyle } from '@/features/common/Sheet'
import { useSession } from '@/app/session'
import { DEFAULT_URL, OFFICE_ACCEPT, SETUP_URL, check, closeCompanionSheet, getConfig, isLoopbackUrl, saveConfig, useCompanionSheet, useCompanionState } from '@/features/companion/companion'

/** Shown when someone asks to convert an Office file and the companion is not running. A stopped companion is explained, never reported as an error (R14). */
export default function CompanionSheet() {
  const { open, file } = useCompanionSheet()
  const state = useCompanionState()
  const { convertOffice } = useSession()
  const cfg = getConfig()
  const [url, setUrl] = useState(cfg?.url ?? DEFAULT_URL)
  const [token, setToken] = useState(cfg?.token ?? '')
  const [msg, setMsg] = useState<string | null>(null)

  const connect = async () => {
    if (!isLoopbackUrl(url)) return setMsg('The companion address must be on this device, for example http://127.0.0.1:8787')
    saveConfig({ url, token })
    const s = await check()
    if (s === 'running') { setMsg(null); if (file) { closeCompanionSheet(); await convertOffice(file) } }
    else setMsg(s === 'wrong-token' ? 'The companion is running but did not accept that token.' : 'Still no companion at that address. If Chrome asked about your local network, choose Allow and try again.')
  }

  return (
    <Sheet open={open} title="Convert Word, Excel and PowerPoint" onClose={closeCompanionSheet}>
      {state === 'running' ? (<>
        <p data-testid="companion-running">The companion is running on this device.</p>
        <label className={`${primaryBtn} inline-flex items-center justify-center cursor-pointer`} style={primaryStyle}>Choose a file to convert
          <input type="file" hidden accept={OFFICE_ACCEPT} data-testid="convert-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { closeCompanionSheet(); void convertOffice(f) } }} />
        </label>
      </>) : (<>
        <p className="font-medium" data-testid="companion-not-running">Companion not running</p>
        <p style={{ color: 'var(--md-on-surface-variant)' }}>Turning an Office file into a PDF needs a small helper program on your own computer. The file goes to that program and back. It never goes to the internet.</p>
        <a href={SETUP_URL} target="_blank" rel="noopener noreferrer" className="min-h-[44px] inline-flex items-center" style={{ color: 'var(--md-primary)' }} data-testid="setup-link">Set up the companion</a>
        <label className="flex flex-col gap-1"><span>Companion address</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="companion-url" /></label>
        <label className="flex flex-col gap-1"><span>Pairing token</span>
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className="min-h-[44px] rounded-xl px-4" style={fieldStyle} data-testid="companion-token" /></label>
        <p className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>Chrome may ask whether myPDF can connect to a device on your local network. That is this program on your own computer: choose Allow.</p>
        {msg && <p role="alert" style={{ color: 'var(--md-error)' }}>{msg}</p>}
        <div className="flex gap-2 flex-wrap">
          <button className={primaryBtn} style={primaryStyle} onClick={() => void connect()} data-testid="companion-connect">Connect</button>
          <button className={tonalBtn} style={tonalStyle} onClick={closeCompanionSheet}>Not now</button>
        </div>
      </>)}
    </Sheet>
  )
}
