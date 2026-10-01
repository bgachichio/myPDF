// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import Home from '@/features/home/Home'
import Viewer from '@/features/viewer/Viewer'
import SettingsSheet from '@/features/settings/SettingsSheet'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  return (
    <>
      {file
        ? <Viewer file={file} onClose={() => setFile(null)} />
        : <Home onSettings={() => setSettingsOpen(true)} onOpen={setFile} />}
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
