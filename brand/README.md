# myPDF brand assets

Sources are the SVGs here; everything raster is generated.

| File | Use |
|---|---|
| `icon.svg` | The app icon: a white document with a folded corner and a padlock, on brand green `#237352`. Also the favicon. |
| `icon-maskable.svg` | Full-bleed version with a safe zone, for Android adaptive icons and the iOS touch icon. |
| `logo.svg`, `logo-dark.svg` | Horizontal lockup, icon plus the "myPDF" wordmark (Courier Prime outlines, so it needs no font). Light and dark backgrounds. |
| `og.svg` | The 1200 by 630 social card. |

Regenerate the PNGs, favicons and social card: `node brand/render.mjs` (needs Playwright's Chromium).
Regenerate the install-prompt screenshots after a UI change: `npm run build && node brand/screenshots.mjs`.
