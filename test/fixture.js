/**
 * Test fixture: one grid with deterministic data, driven by test/run.js.
 * URL: ?rows=N&source=array|server|fail&paging=pages&mode=read|sheet|form
 */
(function () {
    const params = new URLSearchParams(location.search);
    const n = parseInt(params.get("rows"), 10) || 1000;
    const NAMES = ["Anna", "Ben", "Clara", "David", "Emma", "Felix", "Greta"];
    const pad = (x) => String(x).padStart(2, "0");

    function makeRows(count) {
        const rows = new Array(count);
        for (let i = 0; i < count; i++) {
            rows[i] = {
                id: i + 1,
                name: `${NAMES[i % NAMES.length]} ${i + 1}`,
                n: ((i * 37) % 1000) / 10,
                d: `2026-${pad((i % 12) + 1)}-${pad((i % 28) + 1)}`,
                t: `${pad(i % 24)}:${pad((i * 5) % 60)}`,
                dt: `2026-${pad((i % 12) + 1)}-${pad((i % 28) + 1)}T${pad(i % 24)}:${pad((i * 5) % 60)}`,
                b: i % 3 === 0,
                s: ["a", "b", "c"][i % 3],
                tags: i % 4 === 0 ? ["x", "y"] : (i % 4 === 1 ? ["y"] : []),
                color: ["#3b82f6", "#ef4444", "#22c55e"][i % 3],
                note: i % 5 === 0 ? `first line ${i}\nsecond line` : `note ${i}`,
                w1: `wide ${i}`,
                w2: `wider ${i}`,
                w3: `widest ${i}`,
            };
        }
        return rows;
    }

    const columns = [
        { field: "id", label: "ID", type: "readonly", width: 70, align: "right", frozen: true },
        { field: "name", label: "Name", type: "text", width: 140, frozen: true, required: true },
        { field: "n", label: "Num", type: "number", decimals: 1, aggregate: "sum", validate: (v) => (v != null && v < 0 ? "negative" : null) },
        { field: "d", label: "Date", type: "date" },
        { field: "t", label: "Time", type: "time" },
        { field: "dt", label: "When", type: "datetime" },
        { field: "b", label: "Flag", type: "bool" },
        { field: "s", label: "Pick", type: "select", options: [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }, { value: "c", label: "Gamma" }] },
        { field: "tags", label: "Tags", type: "tags", options: [{ value: "x", label: "Ex", color: "blue" }, { value: "y", label: "Why", color: "red" }] },
        { field: "color", label: "Color", type: "color" },
        { field: "note", label: "Note", type: "longtext" },
        { field: "w1", label: "W1", type: "text", width: 200 },
        { field: "w2", label: "W2", type: "text", width: 200 },
        { field: "w3", label: "W3", type: "text", width: 200 },
    ];

    const data = makeRows(n);
    const log = [];
    const kind = params.get("source") || "array";
    let source;
    if (kind === "array") {
        source = SacDataGrid.arraySource(data, { key: "id" });
    } else {
        const inner = SacDataGrid.arraySource(data, { key: "id", pageSize: 50 });
        let calls = 0;
        const wait = (ms, signal) => new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, ms);
            if (signal) signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
        });
        source = {
            key: "id",
            calls: () => calls,
            async load(q) {
                calls++;
                log.push(["load", q.offset, q.limit]);
                await wait(40, q.signal);
                if (kind === "fail" && calls === 1) throw new Error("boom");
                const res = await inner.load(Object.assign({}, q, { aggregate: null }));
                return { rows: res.rows };
            },
            async save(changes) { await wait(20); log.push(["save", changes]); return inner.save(changes); },
            async create(row) { await wait(20); return inner.create(row); },
            async remove(ids) { await wait(20); log.push(["remove", ids]); return inner.remove(ids); },
        };
    }

    const grid = document.getElementById("grid");
    if (params.get("paging")) grid.setAttribute("paging", params.get("paging"));
    if (params.get("page-size")) grid.setAttribute("page-size", params.get("page-size"));
    if (params.get("mode")) grid.setAttribute("mode", params.get("mode"));
    if (params.get("save-mode")) grid.setAttribute("save-mode", params.get("save-mode"));
    grid.columns = columns;
    grid.source = source;

    const events = [];
    for (const type of ["sac:change", "sac:selection", "sac:save", "sac:view", "sac:load-error", "sac:request-delete"]) {
        grid.addEventListener(type, (e) => events.push({ type, detail: e.detail }));
    }
    const errors = [];
    window.addEventListener("error", (e) => errors.push(String(e.message)));
    window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason && e.reason.stack || e.reason)));

    const root = () => grid.shadowRoot;
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

    window.fx = {
        grid, data, source, events, errors, log, columns,
        frame,
        async ready() { await grid._settled(); await frame(); await frame(); return true; },
        state() {
            return {
                cur: grid._cur, anchor: grid._anchor, end: grid._end,
                rows: grid._rowCount(), total: grid._total, known: grid._known,
                st: grid._st, sl: grid._sl, page: grid._page,
                cols: grid._cols.map((c) => c.field),
                editing: !!grid._editor,
                dirty: grid.dirty,
            };
        },
        /** Rendered text of display cell (r, c), or null when not rendered. */
        cell(r, c) {
            for (const row of grid._pool) {
                if (row._r === r && !row.classList.contains("msg")) return row._cells[c] ? row._cells[c].textContent : null;
            }
            return null;
        },
        cellEl(r, c) { return grid._cellEl(r, c); },
        renderedRows() { return grid._pool.filter((row) => row._r >= 0).map((row) => row._r).sort((a, b) => a - b); },
        domRows() { return root().querySelectorAll(".body .row").length; },
        header(c) { return grid._hcells[c]; },
        headerText() { return grid._hcells.map((h) => h._lbl.textContent); },
        status() { return root().querySelector(".status").textContent.replace(/\s+/g, " ").trim(); },
        foot(c) { return grid._fcells[c] ? grid._fcells[c].textContent : null; },
        note() { const m = root().querySelector(".row.msg:not([hidden])"); return m ? m.textContent.trim() : null; },
        rect(elm) { const r = elm.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
        center(elm) { const r = elm.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
        focusGrid() { grid._scroller.focus(); return root().activeElement === grid._scroller; },
        activeTag() {
            let a = document.activeElement;
            while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
            return a ? a.tagName.toLowerCase() + (a.className ? "." + String(a.className).split(" ")[0] : "") : null;
        },
        /** Time a full re-render of the visible rows. */
        timeRender() {
            grid._stamp++;
            const t0 = performance.now();
            grid._renderNow();
            return performance.now() - t0;
        },
        /** Scroll through the grid in steps, one per frame; worst / mean render ms. */
        async scrollPerf(steps) {
            const sc = grid._scroller;
            const max = sc.scrollHeight - sc.clientHeight;
            const times = [];
            const orig = grid._renderNow.bind(grid);
            grid._renderNow = function () { const t0 = performance.now(); orig(); times.push(performance.now() - t0); };
            for (let i = 1; i <= steps; i++) {
                sc.scrollTop = Math.round((max * i) / steps);
                await frame();
            }
            grid._renderNow = orig;
            times.sort((a, b) => a - b);
            const mean = times.reduce((a, b) => a + b, 0) / (times.length || 1);
            return { frames: times.length, mean, p95: times[Math.floor(times.length * 0.95)] || 0, max: times[times.length - 1] || 0 };
        },
        copyText() {
            let text = null;
            const grab = (e) => { text = e.clipboardData.getData("text/plain"); };
            document.addEventListener("copy", grab);
            document.execCommand("copy");
            document.removeEventListener("copy", grab);
            return text;
        },
        pasteText(text) {
            const dt = new DataTransfer();
            dt.setData("text/plain", text);
            const e = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
            document.dispatchEvent(e);
            return e.defaultPrevented;
        },
    };
})();
