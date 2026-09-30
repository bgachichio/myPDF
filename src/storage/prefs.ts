// SPDX-License-Identifier: AGPL-3.0-or-later
type Theme = 'system' | 'light' | 'dark'
type FontScale = 'compact' | 'default' | 'large' | 'xlarge'

function get(key: string, allowed: string[], fallback: string): string {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v ?? '') ? (v as string) : fallback
  } catch {
    return fallback
  }
}

function set(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* ignore private mode */ }
}

export const prefs = {
  getTheme: (): Theme => get('ui.theme', ['system', 'light', 'dark'], 'system') as Theme,
  setTheme: (v: Theme) => set('ui.theme', v),
  getFontScale: (): FontScale => get('ui.fontScale', ['compact', 'default', 'large', 'xlarge'], 'default') as FontScale,
  setFontScale: (v: FontScale) => set('ui.fontScale', v),
  getExportCompress: (): boolean => get('export.compress', ['true', 'false'], 'true') === 'true',
  setExportCompress: (v: boolean) => set('export.compress', String(v)),
  getExportStripMetadata: (): boolean => get('export.stripMetadata', ['true', 'false'], 'true') === 'true',
  setExportStripMetadata: (v: boolean) => set('export.stripMetadata', String(v)),
}
