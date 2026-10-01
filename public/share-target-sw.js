// SPDX-License-Identifier: AGPL-3.0-or-later
// Android share target (R01). Imported by the generated service worker. A shared PDF arrives as POST /share. It is parked in the
// Cache API (available in every service worker, unlike writable OPFS handles on some Android builds) under /inbox/<uuid>, and the
// page is redirected to /?open=inbox/<uuid>. Any failure redirects to /?open=failed so the app can say so. Nothing leaves the device.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/share') return
  event.respondWith((async () => {
    try {
      const form = await event.request.formData()
      let file = form.get('file')
      if (!file) { for (const value of form.values()) { if (typeof value !== 'string') { file = value; break } } }
      if (!file || typeof file === 'string' || file.size === 0) return Response.redirect('/?open=failed', 303)
      const id = crypto.randomUUID()
      const cache = await caches.open('mypdf-inbox')
      await cache.put('/inbox/' + id, new Response(file, { headers: { 'Content-Type': 'application/pdf', 'X-Name': encodeURIComponent(file.name || 'Shared.pdf') } }))
      return Response.redirect('/?open=inbox/' + id, 303)
    } catch {
      return Response.redirect('/?open=failed', 303)
    }
  })())
})
