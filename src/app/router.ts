// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react'

export type Route = 'home' | 'work' | 'canvas'

/** Three screens (BUILD-BRIEF section 3): home, work (the Workbench), canvas. No URL routing: nothing here is shareable. */
export function useRoute(hasDocument: boolean) {
  const [screen, setScreen] = useState<'work' | 'canvas'>('work')
  const [canvasPage, setCanvasPage] = useState(0)
  useEffect(() => { if (!hasDocument) setScreen('work') }, [hasDocument])
  return {
    route: (hasDocument ? screen : 'home') as Route,
    canvasPage,
    openCanvas: (page: number) => { setCanvasPage(page); setScreen('canvas') },
    toWork: () => setScreen('work'),
  }
}
