/**
 * The API page's reference part, written with the kit's sac.showcase so it
 * reads like the style guide. index.html holds the lead and the live demo;
 * this fills #api below them.
 */
(function () {
    const { code, table, compact, note } = sac.showcase;
    const root = document.getElementById("api");

    root.innerHTML = `
        <h2 id="use">Use</h2>
        <p>Each <a href="https://github.com/SACRVM/sac-data-grid/releases">release</a> has a ZIP,
           <code>sac-data-grid-&lt;version&gt;.zip</code>, holding one folder, <code>sac-data-grid/</code>
           (<code>js/</code>, <code>LICENSE</code>, <code>VERSION</code>). Vendor it beside your
           <code>kit/</code> the way you vendor the kit: drop it in verbatim, never edit it, upgrade by
           replacing it. Load it after the kit, in this order:</p>
        ${code(`<link rel="stylesheet" href="kit/css/ui.css">
<script defer src="kit/js/all.js"><\/script>   <!-- or the kit scripts you need -->

<script defer src="sac-data-grid/js/sac-data-grid-types.js"><\/script>
<script defer src="sac-data-grid/js/sac-data-grid.js"><\/script>
<script defer src="sac-data-grid/js/sac-data-grid-edit.js"><\/script>   <!-- editing; without it the grid is read-only -->
<script defer src="sac-data-grid/js/sac-data-grid-form.js"><\/script>   <!-- the record form -->
<script defer src="sac-data-grid/js/sac-data-grid-source.js"><\/script> <!-- SacDataGrid.arraySource -->
<script defer src="sac-data-grid/js/sac-data-grid.de.js"><\/script>     <!-- German strings -->

<sac-data-grid id="orders" label="Orders" style="height: 480px"></sac-data-grid>`)}
        ${code(`const grid = document.getElementById("orders");
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
if (saved) grid.view = saved;`)}
        <p>The grid fills the height you give it (default 420px). From the kit it uses the cell-editor
           fields, <code>sac-chip</code>, <code>sac-menu</code>, <code>sac-dialog</code>,
           <code>sac-tooltip</code> and <code>sac-segmented-control</code>; all are in
           <code>kit/js/all.js</code>.</p>

        <h2 id="attributes">Attributes</h2>
        ${table("Attribute", [
            ["label", "The grid's accessible name."],
            ["mode", "<code>read</code> · <code>sheet</code> (default) · <code>form</code>. See <a href=\"#edit-modes\">Edit modes</a>. A source without <code>save()</code> is read-only in every mode."],
            ["save-mode", "<code>cell</code> · <code>row</code> (default) · <code>batch</code>: when changes go to <code>source.save()</code>. After each cell, when the cursor leaves the row (or focus leaves the grid), or on <code>save()</code> / the footer's Save."],
            ["paging", "<code>scroll</code> (default) · <code>pages</code>: incremental / virtual scrolling, or a pager in the footer."],
            ["page-size", "Rows per page for <code>paging=\"pages\"</code> (default 100)."],
            ["lines", "<code>quiet</code> (default) · <code>grid</code>: row lines only, or cell grid lines."],
            ["mode-toggle", "Presence: a Read · Sheet · Form switch in the footer."],
            ["compact-edit", "<code>form</code> (default) · <code>read</code>: on phones, edit through the record form, or read only."],
            ["row-header", "<code>marks</code> (default) · <code>numbers</code> · <code>none</code>: the column before the data. <code>marks</code> is narrow and shows only a row's state (<code>*</code> new, <code>+</code> the new line, a dot for a row with errors); <code>numbers</code> the row's position. A click selects the row, a right-click opens the row menu."],
        ])}

        <h2 id="properties">Properties and methods</h2>
        ${table("Member", [
            ["columns", "The column definitions (<a href=\"#columns\">below</a>)."],
            ["source", "The data source (<a href=\"#source\">below</a>)."],
            ["view", "<code>{ columns: { field: { width, hidden } }, sort, filter }</code>: get it to persist, set it to restore."],
            ["mode, saveMode", "Mirror the attributes."],
            ["dirty", "Read-only: the number of rows with unsaved changes."],
            ["reload()", "Load again, keeping scroll position and selection. Resolves when loaded."],
            ["save()", "Save every dirty row. Resolves with <code>{ saved, errors, invalid }</code>."],
            ["revert()", "Throw away every unsaved change."],
            ["addRow(values?)", "Append a new, unsaved row and move the cursor to it. Returns the row."],
            ["focusCell(id, field)", "Move the cursor to a loaded row's cell and focus the grid."],
            ["focus()", "Focus the grid (it is one tab stop)."],
        ])}

        <h2 id="columns">Columns</h2>
        ${table("Column key", [
            ["field", "The row property. Required."],
            ["label, labelKey", "Header text; with <code>labelKey</code> it is <code>sac.t(labelKey, label)</code> and relabels on a language switch."],
            ["type", "A type name (below) or a <a href=\"#custom-types\">custom type</a>. Default <code>text</code>."],
            ["width, minWidth", "In px. The user can resize; a double-click on the header edge fits the content."],
            ["frozen", "The leading run of frozen columns stays put while scrolling sideways (at most 60 % of a narrow grid)."],
            ["hidden", "Starts hidden (the column menu shows it again)."],
            ["editable: false", "A read-only column. <code>inline: false</code>: editable only in the record form."],
            ["required, validate(value, row)", "Validation: <code>validate</code> returns a message or <code>null</code>. Invalid cells are marked and their row is not saved."],
            ["options", "<code>select</code> / <code>tags</code>: <code>[{ value, label?, labelKey?, color? }]</code> or plain strings. <code>color</code> is a kit palette slot (<code>blue</code>, <code>orange</code>, …). A <code>tags</code> value is a kit tag name (lower-case <code>a–z</code>, <code>0–9</code>, <code>_ : -</code>); <code>label</code> is what its chip shows."],
            ["decimals, min, max, step", "<code>number</code> (and <code>min</code> / <code>max</code> / <code>step</code> for <code>date</code> / <code>time</code>)."],
            ["allowCreate: false", "<code>tags</code>: only the listed options."],
            ["format(value, row)", "The shown text. A computed column is <code>type: \"readonly\"</code> + <code>format</code>."],
            ["sortable: false, filterable: false", "The column offers no sort / filter (header click, menu, <code>view</code>). Set both on a computed column: the source only knows real fields."],
            ["parse(text, row)", "Pasted text → value; throw or return <code>undefined</code> to reject."],
            ["aggregate", "Footer total: <code>sum</code> · <code>avg</code> · <code>count</code> · <code>min</code> · <code>max</code>."],
            ["align", "<code>left</code> · <code>right</code> · <code>center</code> (numbers default right)."],
        ])}
        ${table("Type", [
            ["text", "A string. Edited with the kit's <code>.cell-input</code>."],
            ["longtext", "A string, shown as its first line. Edited in a textarea in a popover (Enter = new line, Ctrl+Enter = commit)."],
            ["number", "A number or <code>null</code>, shown as a <code>sac.regional</code> number. Edited with <code>&lt;sac-number-field&gt;</code>."],
            ["date", "<code>\"yyyy-mm-dd\"</code>, shown as a <code>sac.regional</code> date. Edited with <code>&lt;sac-date-field&gt;</code>."],
            ["time", "<code>\"HH:MM\"</code>, shown in the <code>sac.regional</code> hour cycle. Edited with <code>&lt;sac-time-field&gt;</code>."],
            ["datetime", "<code>\"yyyy-mm-ddTHH:MM\"</code>, shown as both. Edited with a date and a time field side by side."],
            ["bool", "<code>true</code> / <code>false</code>, shown as a check box. Toggles in place (Space, click)."],
            ["select", "An option value, shown as its label. Edited with <code>&lt;sac-select&gt;</code>."],
            ["tags", "A string array, shown as chips with the labels. Edited with <code>&lt;sac-chip-input&gt;</code>."],
            ["color", "<code>\"#rrggbb\"</code>, shown as a swatch and the hex. Edited with <code>&lt;sac-color-field&gt;</code>."],
            ["readonly", "Anything, shown as <code>format(value, row)</code>. Not editable."],
        ])}
        <p>Every editor is the kit's field in <code>size="cell"</code>. A column only needs to be as wide as
           its values: when an editor does not fit its cell (a date with its calendar button, a select's
           longest option, tags with their ×), it opens over the cell, as wide as it needs, covering the
           neighbours (to the left in a right-aligned column). The column keeps its width.</p>

        <h3 id="custom-types">Custom types</h3>
        ${code(`{ field: "stars", label: "Rating", type: {
    render: (value, row) => "★".repeat(value || 0),          // a string or a Node
    format: (value, row) => String(value || 0),              // clipboard, fit width, screen readers
    parse: (text) => { const n = +text; if (!(n >= 0 && n <= 5)) throw 0; return n; },
    editor: (cell) => myFieldFollowingTheCellEditorContract(cell.value),   // cell: { value, row, field, column }
} }`)}
        <p>An editor follows the kit's cell-editor contract (<code>value</code>, <code>focus({ select })</code>,
           <code>sac:commit</code> / <code>sac:cancel</code>); a plain <code>&lt;input&gt;</code> works too
           (its text goes through <code>parse</code>). <code>SacDataGridTypes.define(name, type)</code> adds a
           named type for every grid.</p>

        <h2 id="source">Data source</h2>
        ${code(`grid.source = {
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
};`)}
        ${table("load / save", [
            ["sort", "<code>[{ field, dir: \"asc\" | \"desc\" }]</code>"],
            ["filter", "<code>{ field: descriptor }</code>, one descriptor per type family: <code>{ op: \"contains\", value }</code> (text, longtext, color), <code>{ op: \"range\", min?, max? }</code> (number, date, datetime, time; a date-only bound covers the whole day of a datetime), <code>{ op: \"any\", values }</code> (select, tags), <code>{ op: \"is\", value }</code> (bool)."],
            ["signal", "An <code>AbortSignal</code>. A new sort, filter or scroll aborts the stale load."],
            ["aggregate", "<code>[{ field, fn }]</code> for the footer. Answer with <code>aggregates: { field: value }</code> over the whole result; otherwise the grid totals once every row is loaded."],
            ["changes", "<code>[{ id, row, fields, op: \"update\" | \"create\" | \"delete\" }]</code>. <code>fields</code> holds only the changed values. A new row carries the grid's temporary id <code>new-&lt;n&gt;</code> (with <code>temp: true</code>): assign the real one and write it into <code>row[key]</code>, or answer <code>create()</code> with the saved row. Deletes go to <code>remove(ids)</code> when the source has it."],
        ])}
        <p>A failed <code>load</code> shows an inline retry row. Errors from <code>save</code> mark the cells and keep them dirty.</p>
        <p><code>SacDataGrid.arraySource(rows, { key, pageSize, newId, compare })</code> does all of this in memory:
           numeric-aware, language-aware sorting with empty values last, the filter descriptors, totals, and
           save / create / remove on the array (<code>src.rows</code>, <code>src.setRows()</code>).
           <code>compare: { status: (a, b) =&gt; … }</code> gives a field its own order, for example a select column by its label.</p>

        <h2 id="events">Events</h2>
        <p>All bubble and are composed.</p>
        ${table("Event", [
            ["sac:change", "One cell committed: <code>{ id, field, value, old }</code>."],
            ["sac:selection", "<code>{ cursor: { index, id, field }, range: { top, bottom, left, right }, fields, count }</code>"],
            ["sac:save", "The save result <code>{ saved, errors, invalid }</code>."],
            ["sac:request-delete", "<code>{ ids }</code>. Cancelable: <code>preventDefault()</code> keeps the rows."],
            ["sac:view", "The new <code>view</code> (after resize, hide / show, sort, filter)."],
            ["sac:load-error", "<code>{ error, offset, limit }</code>"],
        ])}

        <h2 id="keyboard">Keyboard</h2>
        <p>The grid is one tab stop. Tab past the last cell (or Shift+Tab before the first) leaves it.
           Moving is with the cursor on a cell; editing is with an editor open.</p>
        ${table("Key", [
            ["Arrows, Shift+Arrows, Ctrl+Arrows", "Move, extend the range, jump to the data edge. Editing: the editor's."],
            ["Home / End, Ctrl+Home / Ctrl+End", "Row start / end, grid start / last data row. Editing: the editor's."],
            ["PgUp / PgDn, Alt+PgUp / Alt+PgDn", "Page up / down, previous / next page (<code>paging=\"pages\"</code>)."],
            ["Tab / Shift+Tab", "Next / previous cell, wrapping. Editing: commit, then move."],
            ["Enter", "<code>sheet</code>: edit · <code>form</code> / <code>read</code>: open the record. Editing: commit, move down."],
            ["Shift+Enter", "Open the record (every mode). Editing: commit, move up."],
            ["F2 · a printable key", "Edit, keeping the value · edit, replacing it."],
            ["Esc", "Clear the range to the cursor. Editing: cancel the edit."],
            ["Delete / Backspace · Space", "Clear the range · toggle a bool."],
            ["Ctrl+A · Shift+Space · Ctrl+Space", "Select all · the row · the column."],
            ["Ctrl+C / X / V", "Copy / cut / paste TSV. Editing: the editor's."],
            ["Ctrl+Z / Y · Ctrl+S", "Undo / redo (until saved) · save. Editing: the editor's undo."],
            ["Alt+↓ · Shift+F10 / menu key", "Column menu · row menu."],
        ])}
        <p>Pasting one value fills the range. A block tiles a range that is a multiple of it, or lands at the
           cursor and extends from there; past the last row it adds rows. Cells that fail parsing or
           validation are marked and left unchanged. The whole paste is one undo step.</p>
        <p>Copy writes the cells as text: the labels of <code>select</code> and <code>tags</code>, a long text in
           full, numbers without grouping, <code>TRUE</code> / <code>FALSE</code>. Paste reads text back by the kit's
           <code>sac.regional</code> rules, the same as the kit's fields: a date in the regional day / month order
           (ISO always works), a time in either hour cycle, a number with either separator. It round-trips
           with Excel, Google Sheets and SharePoint.</p>

        <h2 id="headers">Headers</h2>
        <p>A click sorts, Shift+click adds a key. The sort mark sits above the title for ascending and below
           it for descending, with the key's number when there are several. Nothing sits beside the title,
           so it always lines up with its column's values. A right-click (a long press on touch, Alt+↓)
           opens the column menu: sort, filter, hide and show columns. A filtered column's title turns the
           accent colour with a dotted underline.</p>

        <h2 id="edit-modes">Edit modes</h2>
        ${table("Mode", [
            ["read", "Selection, copy, sort and filter; no editing affordances. Enter opens the record read-only."],
            ["sheet", "Inline editing with the kit's cell editors, range operations, the \"new row\" line at the end, and the row menu (right-click, Shift+F10) with Open record, New row and Delete."],
            ["form", "The list stays read-only; Enter, a double-click or Open record edits a row in a <code>&lt;sac-dialog&gt;</code>: every column with its label, validation, Save / Cancel, Previous / Next, New. The form commits one record (one <code>changes</code> entry). Escape with unsaved changes asks first."],
        ])}
        ${compact("no inline editing in the kit's compact viewport. The record form, a bottom sheet, is the way to edit (Enter, or a tap on the active cell); <code>compact-edit=\"read\"</code> makes the grid read-only there instead. Touch targets are 44 px under a coarse pointer.")}

        <h2 id="look">Language, formats, look</h2>
        <p>Every string goes through <code>sac.t()</code>; <code>sac-data-grid.de.js</code> adds German. The grid
           relabels live on <code>sac.lang</code> changes; numbers, dates and times follow <code>sac.regional</code> live.</p>
        <p>Tokens only: light, dark and a per-app <code>--accent</code> work without setup.
           <code>--grid-bg</code> (default <code>--bg</code>) is the ground frozen cells paint: set it to the surface
           the grid sits on. <code>--cell-padding-inline</code> is shared with the kit's cell editors.
           CSS parts: <code>grid</code>, <code>status</code>. Windows high contrast (forced colors) and
           <code>prefers-reduced-motion</code> are respected.</p>

        <h2 id="a11y">Accessibility</h2>
        <p>The ARIA grid pattern: <code>role="grid"</code> with <code>aria-rowcount</code> / <code>aria-colcount</code>
           (virtualized), <code>aria-rowindex</code> / <code>aria-colindex</code>, <code>aria-selected</code>,
           <code>aria-readonly</code>, <code>aria-sort</code>, <code>aria-activedescendant</code> for the cursor,
           <code>aria-invalid</code> and the message as <code>aria-description</code> on invalid cells, and a live
           region for load and save errors. The message also shows in the kit's <code>sac-tooltip</code> bubble,
           on hover and on the cursor cell while the grid has focus.</p>
        ${note("<b>Specification:</b> the binding behaviour is <a href=\"https://github.com/SACRVM/sac-data-grid/blob/master/SPEC.md\">SPEC.md</a>; the owner's decisions are in its §7.")}`;

    sac.showcase.watchCode(root);
})();
