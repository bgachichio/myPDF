// SPDX-License-Identifier: AGPL-3.0-or-later
// Export paths (F12): File System Access save on desktop, Web Share where files can be shared, otherwise a download.

declare global {
  interface Window { showSaveFilePicker?: (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle> }
}

const blobOf = (bytes: Uint8Array) => new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })

export async function saveBytes(name: string, bytes: Uint8Array): Promise<'saved' | 'downloaded' | 'cancelled'> {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] })
      const w = await handle.createWritable(); await w.write(bytes as unknown as BufferSource); await w.close()
      return 'saved'
    } catch (e) { if ((e as DOMException).name === 'AbortError') return 'cancelled' }
  }
  const url = URL.createObjectURL(blobOf(bytes))
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

export function canShareFiles(): boolean {
  try { return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'a.pdf', { type: 'application/pdf' })] }) } catch { return false }
}
export async function shareBytes(name: string, bytes: Uint8Array): Promise<boolean> {
  try { await navigator.share({ files: [new File([blobOf(bytes)], name, { type: 'application/pdf' })] }); return true } catch { return false }
}
