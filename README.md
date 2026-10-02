# sac-data-grid

A spreadsheet-grade, editable data table for [SACRVM APPKIT](https://github.com/SACRVM/sacrvm-appkit) apps:
one custom element, `<sac-data-grid>`, built from the kit's own tokens and fields.

**API reference and live demo: https://sacrvm.github.io/sac-data-grid/**
The binding specification is [`SPEC.md`](SPEC.md).

- Virtualized rows (100k+ scroll smoothly), fixed header and footer, frozen columns.
- Pagination or incremental loading from any async source.
- Multi-column sort, type-aware filters, resizable and hideable columns, a persistable `view`.
- Three edit modes, switchable at runtime: `read`, `sheet` (inline editing with the kit's
  cell editors) and `form` (a record form in a `<sac-dialog>`; the way to edit on phones).
- Excel-style keyboard, range selection, TSV copy / cut / paste (round-trips with Excel,
  Google Sheets and SharePoint), undo / redo.
- Validation, dirty tracking, save per cell, per row or in batches; row add and delete with an
  Undo toast; footer totals and selection stats.
- Light / dark / per-app accent through tokens, EN / DE, live `sac.regional` formats, ARIA grid.

Zero build: plain classic scripts, the kit vendored in `kit/` (needs **kit ≥ 2.22.0**).

## Use in an app

Each [release](https://github.com/SACRVM/sac-data-grid/releases) has a ZIP,
`sac-data-grid-<version>.zip`, holding one folder, `sac-data-grid/`, with `js/`, `LICENSE` and
`VERSION`. Vendor it the way you vendor the kit: drop the folder in verbatim, never edit it, and
upgrade by replacing it with the next release. Load the scripts from it in the order shown under
the API page's Use section. The app supplies the kit itself (kit >= 2.22.0).

## Develop

- `npx serve .` and open `index.html`: the API page; its live demo is the manual test bed
  with a 100k-row array source, a paged "server" with latency (`?fail=N` fails every Nth load), and switches for mode,
  save mode, paging, lines, regional format, language and theme.
- `node test/run.js [filter]` runs the headless-Chrome tests over the DevTools protocol.
  Needs Node >= 22 (built-in WebSocket), no dependencies; `CHROME=/path/to/chrome` picks the browser.
- `kit/` is the vendored kit release. Never edit it here; upgrade by replacing the folder.

MIT License.
