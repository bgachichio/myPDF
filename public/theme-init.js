// designer.md §12.1 no-flash script. Loaded synchronously in <head> before any stylesheet.
// External file (not inline) so the strict CSP needs no 'unsafe-inline'.
(function () {
  try {
    var t = localStorage.getItem('ui.theme') || 'system';
    var dark = t === 'dark' || (t === 'system' &&
      matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    var f = localStorage.getItem('ui.fontScale') || 'default';
    document.documentElement.dataset.fontScale = f;
  } catch (e) {}
})();
