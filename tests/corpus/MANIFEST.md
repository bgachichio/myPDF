# Fidelity corpus manifest

Public or synthetic files only. No bank, client or personal document ever enters this repository (PRODUCT-SPEC Section 12, 30-09-2026). Local-only real files go in `tests/corpus/private/`, which is git-ignored.

| # | File | Category | Source URL | Licence |
|---|---|---|---|---|
| 1 | pdfjs-fillable-acroform-2.pdf | Fillable AcroForm | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/160F-2019.pdf | Apache-2.0 |
| 2 | synthetic-scan-5p.pdf | Scanned, image-only | Synthetic — generated with reportlab + Pillow; all text is fictional | CC0-1.0 |
| 3 | synthetic-encrypted-aes256.pdf | Encrypted (AES-256) | Synthetic — pikepdf re-save of pdfjs-basicapi.pdf with AES-256 (R=6); user password: `testpass`, owner password: `ownerpass` | Apache-2.0 (source) / CC0-1.0 (modification) |
| 4 | synthetic-board-pack-310p.pdf | 300+ pages | Synthetic — 310-page board paper generated with reportlab; all names, figures and dates are entirely fictional | CC0-1.0 |
| 5 | synthetic-image-heavy-8p.pdf | Image-heavy | Synthetic — 8 pages, 4 JPEG images per page, generated with reportlab + Pillow | CC0-1.0 |
| 6 | pdfjs-thuluth-rtl.pdf | Right-to-left text | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/ThuluthFeatures.pdf | Apache-2.0 |
| 7 | pdfjs-damaged-xref.pdf | Damaged xref | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/issue1002.pdf | Apache-2.0 |
| 8 | synthetic-pdf20.pdf | PDF 2.0 | Synthetic — pikepdf re-save of pdfjs-basicapi.pdf with min_version=2.0 | Apache-2.0 (source) / CC0-1.0 (modification) |
| 9 | pdfjs-annotation-text-widget.pdf | Fillable AcroForm | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/annotation-text-widget.pdf | Apache-2.0 |
| 10 | pdfjs-annotation-acroform.pdf | Fillable AcroForm | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/annotation-button-widget.pdf | Apache-2.0 |
| 11 | pdfjs-annotation-choice.pdf | Fillable AcroForm | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/annotation-choice-widget.pdf | Apache-2.0 |
| 12 | pdfjs-encrypted.pdf | Encrypted (password unknown) | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/encrypted-attachment.pdf | Apache-2.0 |
| 13 | pdfjs-encrypted-rc4.pdf | Encrypted (password unknown) | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/pr6531_1.pdf | Apache-2.0 |
| 14 | pdfjs-arabic-cid.pdf | Right-to-left text | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/ArabicCIDTrueType.pdf | Apache-2.0 |
| 15 | pdfjs-damaged-pdf-2.pdf | Damaged xref | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/issue215.pdf | Apache-2.0 |
| 16 | pdfjs-basicapi.pdf | Mixed text/graphics | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/basicapi.pdf | Apache-2.0 |
| 17 | pdfjs-tracemonkey-text.pdf | Multi-page text (14 pages) | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/tracemonkey.pdf | Apache-2.0 |
| 18 | pdfjs-alphatrans.pdf | Transparency/graphics | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/alphatrans.pdf | Apache-2.0 |
| 19 | pdfjs-s2.pdf | Image-heavy | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/S2.pdf | Apache-2.0 |
| 20 | pdfjs-annotation-border-styles.pdf | Annotation styles | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/annotation-border-styles.pdf | Apache-2.0 |
| 21 | pdfjs-attachment.pdf | File attachment | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/attachment.pdf | Apache-2.0 |
| 22 | pdfjs-stamp.pdf | Annotation stamp | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/annotation-stamp.pdf | Apache-2.0 |
| 23 | pdfjs-issue1045.pdf | Mixed content | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/issue1045.pdf | Apache-2.0 |
| 24 | pdfjs-issue2176.pdf | Mixed content | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/issue2176.pdf | Apache-2.0 |
| 25 | pdfjs-issue2461.pdf | Mixed content | https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/issue2462.pdf | Apache-2.0 |
