# sac-data-grid

A spreadsheet-grade, editable data table for [SACRVM APPKIT](https://github.com/SACRVM/sacrvm-appkit) apps:
one custom element, `<sac-data-grid>`, built from the kit's own tokens and fields.
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

## Quick start

```html
<link rel="stylesheet" href="kit/css/ui.css">
<!-- the kit: kit/js/all.js, or the scripts you need (see index.html) -->
<script defer src="kit/js/all.js"></script>
<!-- the grid, in this order -->
<script defer src="js/sac-data-grid-types.js"></script>
<script defer src="js/sac-data-grid.js"></script>
<script defer src="js/sac-data-grid-edit.js"></script>   <!-- editing; without it the grid is read-only -->
<script defer src="js/sac-data-grid-form.js"></script>   <!-- the record form -->
<script defer src="js/sac-data-grid-source.js"></script> <!-- SacDataGrid.arraySource -->
<script defer src="js/sac-data-grid.de.js"></script>     <!-- German strings -->

<sac-data-grid id="orders" label="Orders" style="height: 480px"></sac-data-grid>
```

```js
const grid = document.getElementById("orders");
grid.columns = [
    { field: "id", label: "No.", type: "readonly", width: 80, frozen: true },
    { field: "name", label: "Customer", type: "text", frozen: true, required: true },
    { field: "status", label: "Status", type: "select",
      options: [{ value: "open", label: "Open" }, { value: "done", label: "Done" }] },
    { field: "amount", label: "Amount", type: "number", decimals: 2, aggregate: "sum",
      validate: (v) => (v < 0 ? "Can't be negative" : null) },
    { field: "due", label: "Due", type: "date" },
];
grid.source = SacDataGrid.arraySource(rows, { key: "id" });   // or your own source, below

// Persist what the user did to the columns:
grid.addEventListener("sac:view", (e) => localStorage.setItem("orders-view", JSON.stringify(e.detail)));
const saved = JSON.parse(localStorage.getItem("orders-view") || "null");
if (saved) grid.view = saved;
```

The grid fills the height you give it (default 420px).

## Attributes

| Attribute | Values | |
|---|---|---|
| `label` | text | The grid's accessible name. |
| `mode` | `read` · `sheet` (default) · `form` | [Edit modes](#edit-modes). A source without `save()` is read-only in every mode. |
| `save-mode` | `cell` · `row` (default) · `batch` | When changes go to `source.save()`: after each cell, when the cursor leaves the row (or focus leaves the grid), or on `save()` / the footer's Save. |
| `paging` | `scroll` (default) · `pages` | Incremental / virtual scrolling, or a pager in the footer. |
| `page-size` | number (default 100) | Rows per page for `paging="pages"`. |
| `lines` | `quiet` (default) · `grid` | Row lines only, or cell grid lines. |
| `mode-toggle` | (presence) | Shows a Read · Sheet · Form switch in the footer. |
| `compact-edit` | `form` (default) · `read` | Phones (the kit's compact viewport): edit through the record form, or read only. |

`save-mode`, `paging`, `lines` and `compact-edit` are the open owner decisions of SPEC §7
([#1](https://github.com/SACRVM/sac-data-grid/issues/1)); the defaults are provisional.

## Properties and methods

| | |
|---|---|
| `columns` | The column definitions (below). |
| `source` | The data source (below). |
| `view` | `{ columns: { field: { width, hidden } }, sort, filter }`: get it to persist, set it to restore. |
| `mode`, `saveMode` | Mirror the attributes. |
| `dirty` | Read-only: the number of rows with unsaved changes. |
| `reload()` | Load again, keeping scroll position and selection. Resolves when loaded. |
| `save()` | Save every dirty row. Resolves with `{ saved, errors, invalid }`. |
| `revert()` | Throw away every unsaved change. |
| `addRow(values?)` | Append a new, unsaved row and move the cursor to it. Returns the row. |
| `focusCell(id, field)` | Move the cursor to a loaded row's cell and focus the grid. |
| `focus()` | Focus the grid (it is one tab stop). |

## Columns

| Key | |
|---|---|
| `field` | The row property. Required. |
| `label`, `labelKey` | Header text; with `labelKey` it is `sac.t(labelKey, label)` and relabels on a language switch. |
| `type` | A type name (below) or a [custom type](#custom-types). Default `text`. |
| `width`, `minWidth` | In px. The user can resize; double-click on the header edge fits the content. |
| `frozen` | The leading run of frozen columns stays put while scrolling sideways (at most 60 % of a narrow grid). |
| `hidden` | Starts hidden (the header menu shows it again). |
| `editable: false` | Read-only column. `inline: false`: editable only in the record form. |
| `required`, `validate(value, row)` | Validation: `validate` returns a message or `null`. Invalid cells are marked and their row is not saved. |
| `options` | `select` / `tags`: `[{ value, label?, labelKey?, color? }]` or plain strings. `color` is a kit palette slot (`blue`, `orange`, …). A `tags` value is a kit tag name (lower-case `a–z`, `0–9`, `_ : -`); `label` is what its chip shows. |
| `decimals`, `min`, `max`, `step` | `number` (and `min` / `max` / `step` for `date` / `time`). |
| `allowCreate: false` | `tags`: only the listed options. |
| `format(value, row)` | The shown text (a computed column: `type: "readonly"` + `format`). |
| `parse(text, row)` | Pasted text → value; throw or return `undefined` to reject. |
| `aggregate` | Footer total: `sum` · `avg` · `count` · `min` · `max`. |
| `align` | `left` · `right` · `center` (numbers default right). |

| Type | Value | Shown as | Edited with (`size="cell"`) |
|---|---|---|---|
| `text` | string | text | the kit's `.cell-input` |
| `longtext` | string | first line | a textarea in a popover (Enter = new line, Ctrl+Enter = commit) |
| `number` | number \| null | `sac.regional` number | `<sac-number-field>` |
| `date` | `"yyyy-mm-dd"` | `sac.regional` date | `<sac-date-field>` |
| `time` | `"HH:MM"` | `sac.regional` hour cycle | `<sac-time-field>` |
| `datetime` | `"yyyy-mm-ddTHH:MM"` | both | date + time fields side by side |
| `bool` | true / false | a check box | toggles in place (Space, click) |
| `select` | an option value | its label | `<sac-select>` |
| `tags` | string[] | chips with the labels | `<sac-chip-input>` |
| `color` | `"#rrggbb"` | swatch + hex | `<sac-color-field>` |
| `readonly` | anything | `format(value, row)` | none |

### Custom types

```js
{ field: "stars", label: "Rating", type: {
    render: (value, row) => "★".repeat(value || 0),          // a string or a Node
    format: (value, row) => String(value || 0),              // clipboard, fit width, screen readers
    parse: (text) => { const n = +text; if (!(n >= 0 && n <= 5)) throw 0; return n; },
    editor: (cell) => myFieldFollowingTheCellEditorContract(cell.value),   // cell: { value, row, field, column }
} }
```

An editor follows the kit's cell-editor contract (`value`, `focus({ select })`, `sac:commit` /
`sac:cancel`); a plain `<input>` works too (its text goes through `parse`).
`SacDataGridTypes.define(name, type)` adds a named type for every grid.

## Data source

```js
grid.source = {
    key: "id",                                   // row identity
    async load({ offset, limit, sort, filter, signal, aggregate }) {
        return { rows, total };                  // total optional: unknown = incremental loading
    },
    async save(changes) {                        // optional: without it the grid is read-only
        return { saved: [ids], errors: [{ id, field?, message }] };
    },
    async create(row) { return savedRow; },      // optional: the server assigns the id
    async remove(ids) { return { removed: [ids], errors: [] }; },   // optional
    pageSize: 100,                               // optional: rows per load request
};
```

- `sort`: `[{ field, dir: "asc" | "desc" }]`.
- `filter`: `{ field: descriptor }`, with one descriptor per type family:
  `{ op: "contains", value }` (text, longtext, color), `{ op: "range", min?, max? }` (number,
  date, datetime, time; a date-only bound covers the whole day of a datetime),
  `{ op: "any", values }` (select, tags), `{ op: "is", value }` (bool).
- `signal`: an `AbortSignal`. A new sort, filter or scroll aborts the stale load.
- `aggregate`: `[{ field, fn }]` for the footer. Answer with `aggregates: { field: value }` over
  the whole result; otherwise the grid totals once every row is loaded.
- `changes`: `[{ id, row, fields, op: "update" | "create" | "delete" }]`. `fields` holds only the
  changed values. A new row carries the grid's temporary id `new-<n>` (with `temp: true`): assign
  the real one and write it into `row[key]`, or answer `create()` with the saved row. Deletes go
  to `remove(ids)` when the source has it.
- A failed `load` shows an inline retry row. Errors from `save` mark the cells and keep them dirty.

`SacDataGrid.arraySource(rows, { key, pageSize, newId, compare })` does all of this in memory:
numeric-aware, language-aware sorting with empty values last, the filter descriptors, totals,
and save / create / remove on the array (`src.rows`, `src.setRows()`).
`compare: { status: (a, b) => … }` gives a field its own order, for example a select column by its label.

## Events

All bubble and are composed.

| Event | `detail` |
|---|---|
| `sac:change` | One cell committed: `{ id, field, value, old }`. |
| `sac:selection` | `{ cursor: { index, id, field }, range: { top, bottom, left, right }, fields, count }` |
| `sac:save` | The save result `{ saved, errors, invalid }`. |
| `sac:request-delete` | `{ ids }`. Cancelable: `preventDefault()` keeps the rows. |
| `sac:view` | The new `view` (after resize, hide / show, sort, filter). |
| `sac:load-error` | `{ error, offset, limit }` |

## Keyboard

The grid is one tab stop. Tab past the last cell (or Shift+Tab before the first) leaves it.

| Key | Moving (cursor on a cell) | Editing (editor open) |
|---|---|---|
| Arrows, Shift+Arrows, Ctrl+Arrows | Move, extend the range, jump to the data edge | the editor's |
| Home / End, Ctrl+Home / Ctrl+End | Row start / end, grid start / last data row | the editor's |
| PgUp / PgDn, Alt+PgUp / Alt+PgDn | Page up / down, previous / next page (`paging="pages"`) | |
| Tab / Shift+Tab | Next / previous cell, wrapping | Commit, then move |
| Enter | `sheet`: edit · `form` / `read`: open the record | Commit, move down |
| Shift+Enter | Open the record (every mode) | Commit, move up |
| F2 · a printable key | Edit, keeping the value · edit, replacing it | |
| Esc | Clear the range to the cursor | Cancel the edit |
| Delete / Backspace · Space | Clear the range · toggle a bool | |
| Ctrl+A · Shift+Space · Ctrl+Space | Select all · the row · the column | |
| Ctrl+C / X / V | Copy / cut / paste TSV | the editor's |
| Ctrl+Z / Y · Ctrl+S | Undo / redo (until saved) · save | the editor's undo |
| Alt+↓ · Shift+F10 / menu key | Column menu · row menu | |

Pasting one value fills the range. A block tiles a range that is a multiple of it, or lands at the
cursor and extends from there; past the last row it adds rows. Cells that fail parsing or
validation are marked and left unchanged. The whole paste is one undo step.

Copy writes the cells as text: the labels of `select` and `tags`, a long text in full, numbers
without grouping, `TRUE` / `FALSE`. Paste reads text back by the kit's `sac.regional` rules, the
same as the kit's fields: a date in the regional day / month order (ISO always works), a time in
either hour cycle, a number with either separator.

## Edit modes

- **`read`**: selection, copy, sort and filter; no editing affordances. Enter opens the record read-only.
- **`sheet`**: inline editing with the kit's cell editors, range operations, the "new row" line
  at the end, and the row menu (right-click, Shift+F10) with Open record, New row and Delete.
- **`form`**: the list stays read-only; Enter, a double-click or Open record edits a row in a
  `<sac-dialog>`: every column with its label, validation, Save / Cancel, Previous / Next, New.
  The form commits one record (one `changes` entry). Escape with unsaved changes asks first.
- **Phones** (the kit's compact viewport): no inline editing. The form, a bottom sheet, is the
  way to edit (Enter, or a tap on the active cell).

## Language, formats, look

- Every string goes through `sac.t()`; `js/sac-data-grid.de.js` adds German. The grid relabels
  live on `sac.lang` changes; numbers, dates and times follow `sac.regional` live.
- Tokens only: light, dark and a per-app `--accent` work without setup. `--grid-bg` (default
  `--bg`) is the ground frozen cells paint: set it to the surface the grid sits on.
  `--cell-padding-inline` is shared with the kit's cell editors. CSS parts: `grid`, `status`.
- Windows high contrast (forced colors) and `prefers-reduced-motion` are respected; touch
  targets are 44 px under a coarse pointer.

## Accessibility

ARIA grid pattern: `role="grid"` with `aria-rowcount` / `aria-colcount` (virtualized),
`aria-rowindex` / `aria-colindex`, `aria-selected`, `aria-readonly`, `aria-sort`,
`aria-activedescendant` for the cursor, `aria-invalid` on invalid cells, and a live region for
load and save errors.

## Develop

- `npx serve .` and open `index.html`: the demo is the manual test bed. It has a 100k-row array
  source, a paged "server" with latency (`?fail=N` fails every Nth load), and switches for mode,
  save mode, paging, lines, regional format, language and theme.
- `node test/run.js [filter]` runs the headless-Chrome tests over the DevTools protocol.
  No dependencies; `CHROME=/path/to/chrome` picks the browser.
- `kit/` is the vendored kit release. Never edit it here; upgrade by replacing the folder.

MIT License.
