# sac-data-grid

A spreadsheet-grade, editable data table for [SACRVM APPKIT](https://github.com/SACRVM/sacrvm-appkit) apps.

**Features:**
- Virtualized rows (100k+ scroll smoothly), fixed header and footer, frozen columns.
- Pagination or incremental loading from any async source.
- Sort (multi-column), type-aware filters, resizable and hideable columns, a persistable `view`.
- Excel-style keyboard, range selection and TSV copy.
- Inline editing with the kit's own fields (in progress).

**Status:** v1 in progress. The binding specification is [`SPEC.md`](SPEC.md).
Zero build: plain files, the kit vendored in `kit/` (≥ 2.21.0).

## Use

```html
<link rel="stylesheet" href="kit/css/ui.css">
<!-- the kit: kit/js/all.js, or the scripts you need (see index.html) -->
<script defer src="kit/js/all.js"></script>
<!-- the grid, in this order -->
<script defer src="js/sac-data-grid-types.js"></script>
<script defer src="js/sac-data-grid.js"></script>
<script defer src="js/sac-data-grid-edit.js"></script>
<script defer src="js/sac-data-grid-source.js"></script>
<script defer src="js/sac-data-grid.de.js"></script>

<sac-data-grid id="orders" label="Orders"></sac-data-grid>
```

```js
const grid = document.getElementById("orders");
grid.columns = [
    { field: "name", label: "Name", type: "text", frozen: true, required: true },
    { field: "amount", label: "Amount", type: "number", decimals: 2, aggregate: "sum" },
    { field: "due", label: "Due", type: "date" },
];
grid.source = SacDataGrid.arraySource(rows, { key: "id" });   // or your own { key, load, save? }
grid.addEventListener("sac:view", (e) => localStorage.setItem("orders-view", JSON.stringify(e.detail)));
```

The element's full API (attributes, properties, events, keyboard, filter
descriptors) is documented at the top of `js/sac-data-grid.js`; column types
in `js/sac-data-grid-types.js`; the array source in `js/sac-data-grid-source.js`.

## Develop

- `npx serve .` and open `index.html` — the demo is the manual test bed
  (`?rows=N`, `?fail=N` to make every Nth server load fail).
- `node test/run.js [filter]` — headless-Chrome tests over the DevTools
  protocol. No dependencies; `CHROME=/path/to/chrome` picks the browser.

MIT License.
