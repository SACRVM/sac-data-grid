# `<sac-data-grid>` — specification v1

The goal: a data-entry experience that is at least as good as SharePoint
lists, without its headaches. A spreadsheet-grade editable table for SACRVM
APPKIT apps, fast with 100k+ rows, fully keyboard-driven, built from the kit's
own fields so it looks and behaves like the rest of every app.

Everything under **Decided** is binding. **Open** items are the owner's call:
build them configurable, pick the provisional default, and ask the owner (a
GitHub issue in this repo) before treating the default as final.

---

## 1. Shape

- One custom element, `<sac-data-grid>`, in `js/sac-data-grid.js` (split into
  a few classic scripts under `js/` if one file gets unwieldy — no modules, no
  build). Shadow DOM, kit tokens only.
- It **consumes the vendored SACRVM APPKIT** (`kit/`, the release ZIP dropped
  in verbatim) and requires **kit ≥ 2.21.0** — the release that ships the cell
  editors this grid needs (see §6). It never copies kit code.
- Demo page `index.html`: a 100k-row array source, a paged "server" source
  (a fake async source with latency), every column type, frozen columns,
  footer totals, light/dark, EN/DE.

## 2. Edit modes (Decided — the core of the product)

Both ways of editing have their use case, so the grid supports all of them,
switchable at runtime (`mode` attribute/property, and optionally a toggle the
host can show):

| `mode` | What the user gets |
|---|---|
| `read` | A pure read view: selection, copy, sort, filter, but no editing affordances at all. |
| `sheet` | The full spreadsheet mode: inline cell editing, range selection, paste, fill, undo (§3, §5). |
| `form` | The classic record editing: the list stays read-only, and a row opens as a **form in a `<sac-dialog>`** (Enter or double-click on a row, or an Edit action). The form shows all editable fields with labels (`size="regular"` kit fields), validation, and Save/Cancel. It also offers Previous/Next record and "New" for adding rows. |

- `sheet` and `form` coexist. In `sheet` mode the row dialog is still
  available as "Open record" (Shift+Enter or the row menu), for fields that
  are awkward inline (long text, many columns off-screen).
- A column can opt out of inline editing (`inline: false`) and is then only
  editable in the form.
- The same validation, dirty tracking, `save-mode` and `source.save()` path
  apply in every mode. The form commits one record (one `changes` entry).
- On phones the form dialog (a bottom sheet) is the way to edit, whatever the
  mode (see §7-4).

## 2b. Features — v1 (Decided)

| Area | v1 |
|---|---|
| Rendering | Row virtualization (100k rows smooth; only visible rows + a small overscan in the DOM). Fixed header and fixed footer. Freeze N left columns (`frozen` on a column). |
| Data | Pagination **or** incremental loading — one attribute switches (see §4). Sort (multi-column: Shift+click adds a key). Per-column filter (type-aware: text contains, number/date range, select/tags "any of", bool). |
| Columns | Resize by dragging the header edge (double-click = fit content). Show/hide columns (header menu). Column order fixed in v1. Widths/visibility/sort/filter reportable as a `view` object so a host can persist it. |
| Editing | Inline, with the kit's editors per column type (§5). Row add (a "new row" line at the end, or `grid.addRow()`), row delete (with `sac.toast` Undo). Dirty cells marked (subtle `--accent-warm` tint, never a thick border). Validation per column (`required`, `validate(value, row) → message|null`); invalid cells marked with `--danger`, message on hover/focus. |
| Selection | Cell cursor, rectangular range selection, whole row/column via headers, Ctrl+A. |
| Clipboard | Copy / cut / paste as TSV — round-trips with Excel, Google Sheets, SharePoint. Paste into a range; paste larger than the selection extends from the cursor; values parsed per column type (dates/numbers via `sac.regional`); cells that fail validation are marked and not applied. |
| Undo | Ctrl+Z / Ctrl+Y over every edit, paste, fill, row add/delete — until saved. |
| Footer | Row count, selection info (count / sum / avg of a numeric range), per-column aggregates (`aggregate: "sum" | "avg" | "count" | "min" | "max"`). |
| i18n | Every string via `sac.t()`, relabels live on `sac.lang` change; numbers/dates follow `sac.regional` live. |
| Theming | Tokens only; light + dark; per-app `--accent`. |

**Later (not v1):** column virtualization, grouping + subtotals, column/row
drag reorder, fill handle, formulas, CSV/XLSX export, real-time
collaboration, row detail expansion.

## 3. Keyboard model (Decided — Excel-like)

| Key | Navigation mode (cursor on a cell) | Edit mode (editor open) |
|---|---|---|
| Arrows | Move cursor | Handled by the editor (caret, steps) |
| Shift+Arrows | Extend range | editor |
| Ctrl+Arrows | Jump to data edge | editor |
| Home / End, Ctrl+Home / Ctrl+End | Row start/end, grid start/end | editor |
| PgUp / PgDn | Page | — |
| Tab / Shift+Tab | Next/previous cell, wraps to next/previous row | Commit, then move |
| Enter | `sheet`: start editing (keep value) · `form`/`read`: open the record form (read-only in `read`) | Commit, move down |
| Shift+Enter | Open the record form (every mode) | Commit, move up |
| F2 | Start editing (keep value, caret at end) | — |
| Printable key | Start editing, **replace** value with the key | editor |
| Esc | Clear range to cursor | Cancel edit, restore value |
| Delete / Backspace | Clear selected cells (validated, undoable) | editor |
| Ctrl+C / X / V | Clipboard (TSV) | editor's own |
| Ctrl+Z / Y | Undo / redo | editor's own undo first |
| Space (bool cell) | Toggle | — |

Focus never leaves the grid on navigation; the grid is one tab stop.
Screen readers: ARIA grid pattern (`role=grid`, `aria-rowcount` with
virtualization, `aria-rowindex`/`aria-colindex`, `aria-selected`,
`aria-readonly`, live region for save errors).

## 4. Data source contract (Decided)

```js
grid.source = {
    key: "id",                                  // row identity field
    load({ offset, limit, sort, filter, signal }) → Promise<{ rows, total? }>,
    save(changes) → Promise<{ saved: [ids], errors: [{ id, field?, message }] }>,  // optional: read-only grid without it
    create?(row) → Promise<row>,                // optional: server assigns ids
    remove?(ids) → Promise<{ removed: [ids], errors }>,
};
grid.columns = [{
    field, label, labelKey?, type, width?, minWidth?, frozen?, editable?,
    required?, validate?, options?, format?, parse?, aggregate?, align?,
}];
```

- `sort`: `[{ field, dir: "asc" | "desc" }]`; `filter`: `{ field: descriptor }`
  (type-specific descriptor, documented).
- `signal` is an `AbortSignal`: a new sort/filter/scroll aborts the stale load.
- `total` known → real scrollbar height / page count. `total` unknown →
  incremental loading until a page returns fewer than `limit` rows.
- `changes`: `[{ id, row, fields: { field: newValue }, op: "update" | "create" | "delete" }]`.
- Built-in `SacDataGrid.arraySource(rows, { key })` does sort/filter/paging
  locally (the demo and small tables use it).
- Errors from `save` mark the cells and keep them dirty; a failed `load`
  shows an inline retry row, never a broken grid.

**Events** (bubble + composed unless noted): `sac:change` (one cell, detail
`{ id, field, value, old }`), `sac:selection`, `sac:save` (detail = result),
`sac:request-delete` (cancelable), `sac:view` (widths/visibility/sort/filter
changed — persist it if you like), `sac:load-error`.

**Methods:** `reload()`, `save()`, `revert()`, `addRow(values?)`,
`focusCell(id, field)`, `view` (get/set), `dirty` (read-only count).

## 5. Column types → kit editors (Decided)

| `type` | Display | Editor (kit ≥ 2.21.0) |
|---|---|---|
| `text` | text, ellipsis | plain kit input in `size="cell"` |
| `longtext` | first line | kit textarea in a popover (Enter = newline, Ctrl+Enter = commit) |
| `number` | `sac.regional` number format | `<sac-number-field size="cell">` |
| `date` | `sac.regional` date format | `<sac-date-field size="cell">` |
| `time` | `sac.regional` hour cycle | `<sac-time-field size="cell">` |
| `datetime` | both | date + time editors side by side |
| `bool` | check mark | toggles in place (Space / click), no editor |
| `select` | label | `<sac-select size="cell">` (searchable) |
| `tags` | chips | `<sac-chip-input size="cell">` |
| `color` | swatch | `<sac-color-field size="cell">` |
| `readonly` / computed | `format(value, row)` | none |

Custom types: `{ render(value, row), editor(cell) → HTMLElement, parse, format }`.

## 6. What the grid relies on from the kit (provided by kit 2.21.0)

- **The cell-editor contract** every field above implements in
  `size="cell"`: borderless, fills its cell, no label; `value` get/set;
  `focus({ select })`; `sac:change` on commit; it lets **Tab** and
  **Enter/Esc** bubble when it has nothing to do with them, and fires
  `sac:commit` / `sac:cancel` so the grid moves or restores. (See the kit's
  style guide → "Cell editors".)
- `sac.regional` number format (decimal/thousands separators) and
  `sac.regional.formatNumber / parseNumber`, plus date/time formatting.
- `sac.lang` / `sac.t`, `sac.hotkeys`, `sac.toast` (Undo action),
  `sac-menu` (header menus), `sac-spinner`.

If a gap in the kit shows up: open an issue on SACRVM/sacrvm-appkit instead
of working around it inside the grid.

## 7. Open — owner decides (build configurable, ask before finalizing)

| # | Question | Provisional default |
|---|---|---|
| 1 | Save mode default: per cell, per row on leaving the row (SharePoint), or batched with a Save button | `save-mode="row"`; all three supported |
| 2 | Loading default: incremental scroll or pages with a pager in the footer | `paging="scroll"`; `paging="pages"` supported |
| 3 | Look: spreadsheet-dense with cell grid lines, or quiet like kit lists (row lines only, cell outline on the cursor) | quiet; `lines="grid"` option |
| 4 | Phones: editable or read-only | editable through the form dialog (bottom sheet), no inline editing |

## 8. Quality bar

- 100k rows: scrolling at 60 fps, first paint < 100 ms after rows arrive;
  keyboard navigation never waits on layout.
- No raw colors; no thick colored borders on rounded surfaces; 44px touch
  targets; `prefers-reduced-motion` respected.
- Tested in headless Chrome (a CDP driver script is fine); the demo page is
  the manual test bed. No test framework build chain.
