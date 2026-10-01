// SPDX-License-Identifier: AGPL-3.0-or-later
// Android share target (R01). Imported by the generated service worker. A shared PDF arrives as POST /share;
// it is parked in OPFS /inbox/<uuid>.pdf and the page is redirected to /?open=inbox/<uuid>. Nothing leaves the device.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/share') return
  event.respondWith((async () => {
    try {
      const form = await event.request.formData()
      const file = form.get('file')
      if (!(file instanceof File)) return Response.redirect('/', 303)
      const id = crypto.randomUUID()
      const root = await navigator.storage.getDirectory()
      const inbox = await root.getDirectoryHandle('inbox', { create: true })
      const handle = await inbox.getFileHandle(id + '.pdf', { create: true })
      const writer = await handle.createWritable()
      await writer.write(file)
      await writer.close()
      return Response.redirect('/?open=inbox/' + id, 303)
    } catch (e) {
      return Response.redirect('/', 303)
    }
  })())
})
