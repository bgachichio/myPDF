// SPDX-License-Identifier: AGPL-3.0-or-later
// Export paths (F12): File System Access save on desktop, Web Share where files can be shared, otherwise a download.

declare global {
  interface Window {
    showOpenFilePicker?: (o: { types: { description: string; accept: Record<string, string[]> }[]; multiple?: boolean }) => Promise<FileSystemFileHandle[]>
    showSaveFilePicker?: (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>
  }
}

/** Every kind of file the app can save. Names and types are what the save dialog and the download link show. */
const KINDS = {
  pdf: { mime: 'application/pdf', ext: '.pdf', description: 'PDF' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx', description: 'Word document' },
  zip: { mime: 'application/zip', ext: '.zip', description: 'ZIP archive' },
  png: { mime: 'image/png', ext: '.png', description: 'PNG picture' },
  jpg: { mime: 'image/jpeg', ext: '.jpg', description: 'JPEG picture' },
  txt: { mime: 'text/plain', ext: '.txt', description: 'Text file' },
  p12: { mime: 'application/x-pkcs12', ext: '.p12', description: 'Signing ID' },
} as const
export type FileKind = keyof typeof KINDS
const blobOf = (bytes: Uint8Array, kind: FileKind = 'pdf') => new Blob([bytes as unknown as BlobPart], { type: KINDS[kind].mime })

export async function saveBytes(name: string, bytes: Uint8Array, kind: FileKind = 'pdf'): Promise<'saved' | 'downloaded' | 'cancelled'> {
  const k = KINDS[kind]
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: k.description, accept: { [k.mime]: [k.ext] } }] })
      const w = await handle.createWritable(); await w.write(bytes as unknown as BufferSource); await w.close()
      return 'saved'
    } catch (e) { if ((e as DOMException).name === 'AbortError') return 'cancelled' }
  }
  const url = URL.createObjectURL(blobOf(bytes, kind))
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

/** Write bytes back to the file the user opened (F12, desktop). Asks for permission when the browser needs it. */
export async function saveInPlace(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<boolean> {
  const h = handle as FileSystemFileHandle & { requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState> }
  if (h.requestPermission && (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') return false
  const w = await handle.createWritable(); await w.write(bytes as unknown as BufferSource); await w.close()
  return true
}
