// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import Home from '@/features/home/Home'
import SettingsSheet from '@/features/settings/SettingsSheet'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <>
      <Home onSettings={() => setSettingsOpen(true)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
