/**
 * The test cases, run by test/run.js against test/fixture.html.
 * Each test gets the page driver: load(url), eval(js), key(k, mods),
 * type(text), click(x, y, opts), drag(…), frames(n), shot(name).
 */
"use strict";
const fs = require("fs");
const path = require("path");

module.exports = function ({ test, eq, ok, center }) {

    /** A right-click (the column and row menus). */
    const rclick = async (p, x, y) => {
        await p.mouse("mouseMoved", x, y, { buttons: 0 });
        await p.mouse("mousePressed", x, y, { button: "right", buttons: 2 });
        await p.mouse("mouseReleased", x, y, { button: "right", buttons: 0 });
    };

    /* ------------------------------------------------------ static checks -- */

    test("no raw colors in the grid's own styles", async () => {
        const dir = path.join(__dirname, "..", "js");
        for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js"))) {
            const src = fs.readFileSync(path.join(dir, f), "utf8")
                .replace(/url\("data:image\/svg\+xml[^"]*"\)/g, "")       // mask shapes, not colors
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/^\s*\/\/.*$/gm, "");
            const hit = /#[0-9a-f]{3,8}\b(?![-\w])|\brgba?\(|\bhsla?\(/i.exec(src);
            ok(!hit, `${f}: raw color "${hit && hit[0]}"`);
        }
    });

    /* -------------------------------------------------------------- render -- */

    test("boots with header, rows and status", async (p) => {
        await p.load("/test/fixture.html?rows=1000");
        const s = await p.eval("fx.state()");
        eq(s.rows, 1000, "row count");
        eq((await p.eval("fx.headerText()")).slice(0, 3), ["ID", "Name", "Num"], "header labels");
        eq(await p.eval("fx.cell(0, 1)"), "Anna 1", "first name cell");
        eq(await p.eval("fx.cell(1, 2)"), "3.7", "number cell formatted");
        ok((await p.eval("fx.status()")).includes("1,000 rows"), "status count");
        eq(await p.eval("fx.errors"), [], "no page errors");
    });

    test("virtualizes 100k rows and paints fast", async (p) => {
        await p.load("/test/fixture.html?rows=100000");
        eq((await p.eval("fx.state()")).rows, 100000);
        const dom = await p.eval("fx.domRows()");
        ok(dom < 90, `DOM rows ${dom} should stay small`);
        const ms = await p.eval("fx.timeRender()");
        ok(ms < 100, `full re-render took ${ms.toFixed(1)} ms`);
        const perf = await p.eval("fx.scrollPerf(60)");
        ok(perf.p95 < 12, `scroll frame p95 ${perf.p95.toFixed(2)} ms (mean ${perf.mean.toFixed(2)}, max ${perf.max.toFixed(2)})`);
        const rows = await p.eval("fx.renderedRows()");
        eq(rows[rows.length - 1], 100000, "scrolled to the end (the new-row line)");
        eq(await p.eval("fx.cell(99999, 0)"), "100000", "last data row shows its data");
    });

    test("frozen columns stay put while scrolling sideways", async (p) => {
        await p.load("/test/fixture.html?rows=200");
        const before = await p.eval("fx.rect(fx.cellEl(0, 1))");
        const other = await p.eval("fx.rect(fx.cellEl(0, 5))");
        await p.eval("fx.grid._scroller.scrollLeft = 400");
        await p.frames(2);
        const after = await p.eval("fx.rect(fx.cellEl(0, 1))");
        const moved = await p.eval("fx.rect(fx.cellEl(0, 5))");
        eq(after.x, before.x, "frozen cell x");
        ok(Math.abs(moved.x - (other.x - 400)) < 1, "scrolling cell moved by 400");
        await p.shot("frozen");
    });

    /* ------------------------------------------------------------ keyboard -- */

    test("keyboard navigation and range selection", async (p) => {
        await p.load("/test/fixture.html?rows=1000");
        ok(await p.eval("fx.focusGrid()"), "grid focused");
        for (let i = 0; i < 3; i++) await p.key("ArrowDown");
        await p.key("ArrowRight");
        eq((await p.eval("fx.state()")).cur, { r: 3, c: 1 }, "arrows");
        await p.key("ArrowDown", ["Shift"]);
        await p.key("ArrowDown", ["Shift"]);
        await p.key("ArrowRight", ["Shift"]);
        let s = await p.eval("fx.state()");
        eq([s.cur, s.anchor, s.end], [{ r: 3, c: 1 }, { r: 3, c: 1 }, { r: 5, c: 2 }], "shift extends");
        await p.key("Escape");
        s = await p.eval("fx.state()");
        eq(s.end, { r: 3, c: 1 }, "escape collapses");
        await p.key("End", ["Control"]);
        s = await p.eval("fx.state()");
        eq(s.cur, { r: 999, c: 13 }, "ctrl+end");
        ok(s.st > 30000, "scrolled to the bottom");
        await p.key("Home", ["Control"]);
        eq((await p.eval("fx.state()")).cur, { r: 0, c: 0 }, "ctrl+home");
        await p.key("End");
        eq((await p.eval("fx.state()")).cur, { r: 0, c: 13 }, "end");
        await p.key("Tab");
        eq((await p.eval("fx.state()")).cur, { r: 1, c: 0 }, "tab wraps");
        await p.key("Tab", ["Shift"]);
        eq((await p.eval("fx.state()")).cur, { r: 0, c: 13 }, "shift+tab wraps back");
        await p.key("PageDown");
        ok((await p.eval("fx.state()")).cur.r > 5, "page down");
        await p.key("a", ["Control"]);
        s = await p.eval("fx.state()");
        eq([s.anchor, s.end], [{ r: 0, c: 0 }, { r: 999, c: 13 }], "ctrl+a");
        ok((await p.eval("fx.status()")).includes("Count:"), "selection info");
        await p.key(" ", ["Shift"]);
        s = await p.eval("fx.state()");
        eq([s.anchor.c, s.end.c, s.anchor.r, s.end.r], [0, 13, s.cur.r, s.cur.r], "shift+space selects the row");
        await p.key(" ", ["Control"]);
        s = await p.eval("fx.state()");
        eq([s.anchor.r, s.end.r], [0, 999], "ctrl+space selects the column");
        eq(await p.eval("fx.grid._scroller.getAttribute('aria-activedescendant') === fx.cellEl(fx.state().cur.r, fx.state().cur.c).id"), true, "activedescendant");
    });

    test("ctrl+arrow jumps to the data edge", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        await p.eval("fx.focusGrid()");
        await p.key("ArrowRight", ["Control"]);
        eq((await p.eval("fx.state()")).cur, { r: 0, c: 13 }, "right edge");
        await p.key("ArrowDown", ["Control"]);
        eq((await p.eval("fx.state()")).cur, { r: 49, c: 13 }, "bottom edge");
        // tags are empty on rows 2, 3 (mod 4): from row 0 down, the run ends at row 1
        await p.eval("fx.grid.focusCell(1, 'tags')");
        await p.key("ArrowDown", ["Control"]);
        eq((await p.eval("fx.state()")).cur, { r: 1, c: 8 }, "end of a data run");
        await p.key("ArrowDown", ["Control"]);
        eq((await p.eval("fx.state()")).cur, { r: 4, c: 8 }, "next non-empty");
    });

    test("tab leaves the grid past the last cell", async (p) => {
        await p.load("/test/fixture.html?rows=3");
        await p.eval("fx.focusGrid()");
        await p.key("End", ["Control"]);
        await p.key("Tab");
        eq((await p.eval("fx.state()")).cur, { r: 3, c: 0 }, "tab goes on to the new-row line");
        await p.key("End");
        await p.key("Tab");
        eq(await p.eval("fx.grid.shadowRoot.activeElement === fx.grid._scroller"), false, "then leaves the grid");
    });

    /* ---------------------------------------------------------------- mouse -- */

    test("click, shift+click and drag select", async (p) => {
        await p.load("/test/fixture.html?rows=500");
        let c = await center(p, "fx.cellEl(2, 2)");
        await p.click(c.x, c.y);
        eq((await p.eval("fx.state()")).cur, { r: 2, c: 2 }, "click");
        c = await center(p, "fx.cellEl(4, 3)");
        await p.click(c.x, c.y, { mods: ["Shift"] });
        let s = await p.eval("fx.state()");
        eq([s.anchor, s.end], [{ r: 2, c: 2 }, { r: 4, c: 3 }], "shift+click");
        const a = await center(p, "fx.cellEl(1, 2)");
        const b = await center(p, "fx.cellEl(6, 4)");
        await p.drag(a.x, a.y, b.x, b.y);
        s = await p.eval("fx.state()");
        eq([s.cur, s.end], [{ r: 1, c: 2 }, { r: 6, c: 4 }], "drag");
        const rh = await p.eval("fx.center(fx.cellEl(3, 0).parentElement.firstChild)");
        await p.click(rh.x, rh.y);
        s = await p.eval("fx.state()");
        eq([s.anchor, s.end], [{ r: 3, c: 0 }, { r: 3, c: 13 }], "row header selects the row");
        ok(await p.eval("fx.focusGrid()"), "grid keeps focus");
        await p.shot("selection");
    });

    /* ------------------------------------------------------ sort / filter -- */

    test("header click sorts; shift+click adds a key", async (p) => {
        await p.load("/test/fixture.html?rows=300");
        let h = await center(p, "fx.header(2)");
        await p.click(h.x, h.y);
        await p.eval("fx.ready()");
        const col = async (c) => p.eval(`[0,1,2,3,4].map(r => fx.cell(r, ${c}))`);
        const want = await p.eval("fx.data.map(r => r.n).sort((a, b) => a - b).slice(0, 2).map(n => n.toFixed(1))");
        eq((await col(2)).slice(0, 2), want, "ascending: smallest first");
        eq(await p.eval("fx.header(2).getAttribute('aria-sort')"), "ascending");
        await p.click(h.x, h.y);
        await p.eval("fx.ready()");
        eq((await col(2))[0], "99.9", "descending");
        h = await center(p, "fx.header(3)");
        await p.click(h.x, h.y, { mods: ["Shift"] });
        await p.eval("fx.ready()");
        eq(await p.eval("fx.grid.view.sort"), [{ field: "n", dir: "desc" }, { field: "d", dir: "asc" }], "two keys");
        eq(await p.eval("fx.header(3)._sort.textContent"), "2", "priority shown");
        ok((await p.eval("fx.events.filter(e => e.type === 'sac:view').length")) >= 3, "sac:view fired");
    });

    test("filter from the column menu", async (p) => {
        await p.load("/test/fixture.html?rows=300");
        const mb = await center(p, "fx.header(1)");
        await rclick(p, mb.x, mb.y);
        await p.frames(2);
        ok(await p.eval("fx.grid._menu.hasAttribute('open')"), "menu open");
        await p.eval(`fx.grid._menu.querySelector('[data-action="filter"]').click()`);
        await p.frames(2);
        ok(await p.eval("fx.grid._pop.matches(':popover-open')"), "filter popover open");
        await p.type("anna");
        await p.key("Enter");
        await p.eval("fx.ready()");
        const s = await p.eval("fx.state()");
        eq(s.rows, 43, "43 of 300 names contain anna");
        eq(await p.eval("fx.grid.view.filter"), { name: { op: "contains", value: "anna" } });
        ok(await p.eval("fx.header(1).classList.contains('filtered')"), "filter indicator");
        await p.eval("fx.grid.view = { filter: {} }");
        await p.eval("fx.ready()");
        eq((await p.eval("fx.state()")).rows, 300, "cleared");
    });

    test("typed filters: range, any, bool", async (p) => {
        await p.load("/test/fixture.html?rows=300");
        await p.eval(`fx.grid.view = { filter: { n: { op: "range", min: 10, max: 20 } } }`);
        await p.eval("fx.ready()");
        const inRange = await p.eval("fx.data.filter(r => r.n >= 10 && r.n <= 20).length");
        eq((await p.eval("fx.state()")).rows, inRange, "number range");
        await p.eval(`fx.grid.view = { filter: { tags: { op: "any", values: ["x"] } } }`);
        await p.eval("fx.ready()");
        eq((await p.eval("fx.state()")).rows, 75, "tags any");
        await p.eval(`fx.grid.view = { filter: { b: { op: "is", value: true } } }`);
        await p.eval("fx.ready()");
        eq((await p.eval("fx.state()")).rows, 100, "bool");
        await p.eval(`fx.grid.view = { filter: { d: { op: "range", min: "2026-03-01", max: "2026-03-31" } } }`);
        await p.eval("fx.ready()");
        eq((await p.eval("fx.state()")).rows, 25, "date range");
    });

    test("header: the title never moves; the sort mark sits above or below it", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        const geo = (c) => p.eval(`(() => { const h = fx.header(${c}), l = h._lbl.getBoundingClientRect(), s = h._sort.getBoundingClientRect();
            return { right: Math.round(l.right), left: Math.round(l.left), top: Math.round(l.top), bottom: Math.round(l.bottom),
                sTop: Math.round(s.top), sBottom: Math.round(s.bottom), sHidden: h._sort.hidden }; })()`);
        const cellRight = await p.eval("Math.round(fx.cellEl(0, 2).getBoundingClientRect().right)");
        const pad = await p.eval("parseFloat(getComputedStyle(fx.cellEl(0, 2)).paddingRight)");
        const rest = await geo(2);
        eq(rest.right, cellRight - pad, "a right-aligned title ends where its values end");
        ok(rest.sHidden, "no mark unsorted");
        const h = await center(p, "fx.header(2)");
        await p.click(h.x, h.y);
        await p.eval("fx.ready()");
        const asc = await geo(2);
        eq([asc.left, asc.right, asc.top], [rest.left, rest.right, rest.top], "ascending: title unmoved");
        ok(asc.sBottom <= asc.top, "ascending: the mark is above the title");
        await p.click(h.x, h.y);
        await p.eval("fx.ready()");
        const desc = await geo(2);
        eq([desc.left, desc.right, desc.top], [rest.left, rest.right, rest.top], "descending: title unmoved");
        ok(desc.sTop >= desc.bottom, "descending: the mark is below the title");
        await p.eval(`fx.grid.view = { filter: { n: { op: "range", min: 1, max: 20 } } }`);
        await p.eval("fx.ready()");
        const filtered = await geo(2);
        eq([filtered.left, filtered.right], [rest.left, rest.right], "filtered: title unmoved");
        eq(await p.eval("[fx.header(2).classList.contains('filtered'), fx.header(2).getAttribute('aria-description')]"), [true, "Filtered"], "filtered: marked");
    });

    test("row-header: marks (default), numbers, none", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        const rh = () => p.eval("[fx.cellEl(0, 0).closest('.row')._rh.textContent, Math.round(fx.cellEl(0, 0).closest('.row')._rh.getBoundingClientRect().width), Math.round(fx.cellEl(0, 0).getBoundingClientRect().left - fx.grid._scroller.getBoundingClientRect().left)]");
        const marks = await rh();
        eq([marks[0], marks[1]], ["", 24], "marks: narrow, no number");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'name')");
        await p.key("Delete");
        await settle(p);
        ok(await p.eval("fx.cellEl(1, 1).closest('.row')._rh.classList.contains('err')"), "a row with errors is marked");
        await p.eval("fx.grid.setAttribute('row-header', 'numbers')");
        await p.frames(2);
        eq((await rh())[0], "1", "numbers: the position");
        await p.eval("fx.grid.setAttribute('row-header', 'none')");
        await p.frames(2);
        eq((await rh())[2], 0, "none: the data starts at the edge");
        // Header, body and footer cells: in line, each as wide as its column.
        const cols = await p.eval(`[0, 1, 2].map((c) => [fx.header(c), fx.cellEl(0, c), fx.grid._fcells[c]]
            .map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width)]; })
            .every(([l, w], i, all) => l === all[0][0] && w === fx.grid._w[c]))`);
        eq(cols, [true, true, true], "none: every cell stays in its column");
        const c = await center(p, "fx.cellEl(3, 1)");
        await p.click(c.x, c.y);
        eq((await p.eval("fx.state()")).cur, { r: 3, c: 1 }, "clicks still hit the right cell");
    });

    test("a column with sortable / filterable false offers neither", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        await p.eval(`fx.grid.columns = fx.grid.columns.map((c, i) => i === 2 ? { ...c, sortable: false, filterable: false } : c)`);
        await p.frames(2);
        const h = await center(p, "fx.header(2)");
        await p.click(h.x, h.y);
        await p.frames(2);
        eq(await p.eval("fx.grid.view.sort"), [], "a header click does not sort");
        await p.eval(`fx.grid.view = { sort: [{ field: "n", dir: "asc" }], filter: { n: { op: "range", min: 1 } } }`);
        await p.frames(2);
        eq(await p.eval("[fx.grid.view.sort, fx.grid.view.filter]"), [[], {}], "nor does the view");
        await p.eval("fx.grid._openColumnMenu(2)");
        await p.frames(2);
        eq(await p.eval("[...fx.grid._menu.querySelectorAll('[data-action]')].map((b) => b.dataset.action).filter((a) => /sort|filter/.test(a))"), [],
            "the menu offers no sort or filter");
    });

    test("the resize line sits on the column edge, on the grid line when shown", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        const at = () => p.eval(`(() => { const rs = fx.header(2)._rs, a = getComputedStyle(rs, "::after"), cell = fx.cellEl(0, 2);
            return [Math.round(rs.getBoundingClientRect().right - parseFloat(a.right) - parseFloat(a.width)),
                Math.round(cell.getBoundingClientRect().right - 1)]; })()`);
        const quiet = await at();
        eq(quiet[0], quiet[1], "quiet: on the column's last pixel");
        await p.eval("fx.grid.setAttribute('lines', 'grid')");
        await p.frames(2);
        const grid = await at();
        eq(grid[0], grid[1], "grid: on the grid line");
    });

    test("tags show as the kit's chips, in the cell as in the editor", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        const c = await p.eval("fx.grid._cols.findIndex((x) => x.typeName === 'tags')");
        const r = await p.eval(`(() => { let r = 0; while (!(fx.grid._get(fx.grid._rowAt(r), fx.grid._cols[${c}]) || []).length) r++; return r; })()`);
        const view = await p.eval(`[...fx.cellEl(${r}, ${c}).querySelectorAll("sac-chip")].map((x) => [x.getAttribute("label"), x.getAttribute("color")])`);
        ok(view.length > 0, "chips in the cell");
        await p.eval(`fx.focusGrid(); fx.grid.focusCell(fx.grid._idOf(fx.grid._rowAt(${r})), fx.grid._cols[${c}].field)`);
        await p.key("Enter");
        await p.frames(3);
        const edit = await p.eval("[...fx.grid._editor.el.shadowRoot.querySelectorAll('sac-chip')].map((x) => [x.getAttribute('label'), x.getAttribute('color')])");
        eq(edit, view, "the editor shows the same chips");
    });

    /* -------------------------------------------------------------- columns -- */

    test("hide and show columns", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        const mb = await center(p, "fx.header(3)");
        await rclick(p, mb.x, mb.y);
        await p.frames(2);
        await p.eval(`fx.grid._menu.querySelector('[data-action="hide"]').click()`);
        await p.frames(2);
        eq((await p.eval("fx.state()")).cols.includes("d"), false, "hidden");
        eq(await p.eval("fx.grid.view.columns.d.hidden"), true, "in the view");
        await p.eval("fx.grid.view = { columns: { d: { hidden: false } } }");
        await p.frames(2);
        eq((await p.eval("fx.state()")).cols[3], "d", "shown again");
    });

    test("resize by dragging, fit on double-click", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        const r = await p.eval("fx.rect(fx.header(2)._rs)");
        const x = r.x + r.w / 2, y = r.y + r.h / 2;
        await p.drag(x, y, x + 80, y, 5);
        await p.frames(2);
        eq(await p.eval("fx.grid.view.columns.n.width"), 200, "dragged +80");
        eq(Math.round((await p.eval("fx.rect(fx.header(2))")).w), 200, "header follows");
        eq(Math.round((await p.eval("fx.rect(fx.cellEl(0, 2))")).w), 200, "cells follow");
        eq(await p.eval("fx.grid.view.sort"), [], "no sort from the resize click");
        const r2 = await p.eval("fx.rect(fx.header(2)._rs)");
        await p.click(r2.x + r2.w / 2, r2.y + r2.h / 2, { count: 2 });
        await p.frames(2);
        const w = await p.eval("fx.grid.view.columns.n.width");
        ok(w < 120 && w >= 48, `fit width ${w}`);
    });

    /* ------------------------------------------------------------- paging -- */

    test("pages mode with pager", async (p) => {
        await p.load("/test/fixture.html?rows=250&paging=pages&page-size=100");
        eq((await p.eval("fx.state()")).rows, 100, "first page");
        ok((await p.eval("fx.status()")).includes("Page 1 of 3"), "pager label");
        await p.eval(`fx.grid.shadowRoot.querySelector('.pager [data-act="next"]').click()`);
        await p.eval("fx.ready()");
        eq(await p.eval("fx.cell(0, 0)"), "101", "second page starts at 101");
        await p.eval(`fx.grid.shadowRoot.querySelector('.pager [data-act="last"]').click()`);
        await p.eval("fx.ready()");
        eq((await p.eval("fx.state()")).rows, 50, "last page has 50");
        await p.eval("fx.focusGrid()");
        await p.key("PageUp", ["Alt"]);
        await p.eval("fx.ready()");
        eq((await p.eval("fx.state()")).page, 1, "alt+pgup goes back");
    });

    test("async source: incremental loading, total unknown", async (p) => {
        await p.load("/test/fixture.html?rows=180&source=server");
        let s = await p.eval("fx.state()");
        eq([s.rows, s.total], [100, null], "first block");
        ok((await p.eval("fx.status()")).includes("100+ rows"), "status says more");
        await p.eval("fx.grid._scroller.scrollTop = 1e6");
        await p.eval("fx.ready()");
        await p.eval("fx.grid._scroller.scrollTop = 1e6");
        await p.eval("fx.ready()");
        s = await p.eval("fx.state()");
        eq([s.rows, s.total], [180, 180], "end found");
        ok((await p.eval("fx.status()")).includes("180 rows"), "status total");
    });

    test("stale loads are aborted", async (p) => {
        await p.load("/test/fixture.html?rows=2000&source=server");
        await p.eval(`(async () => {
            fx.grid.view = { sort: [{ field: "n", dir: "asc" }] };
            await fx.frame();
            await fx.frame();
            fx.grid.view = { sort: [{ field: "n", dir: "desc" }] };
            await fx.ready();
        })()`);
        eq(await p.eval("fx.cell(0, 2)"), "99.9", "the last query wins");
        ok((await p.eval("fx.log.filter(l => l[0] === 'load').length")) >= 3, "the stale query was started");
    });

    test("failed load shows a retry row", async (p) => {
        await p.load("/test/fixture.html?rows=100&source=fail");
        ok((await p.eval("fx.note()")).includes("Couldn't load rows"), "error row");
        eq(await p.eval("fx.events.filter(e => e.type === 'sac:load-error').length"), 1, "sac:load-error");
        await p.eval("fx.grid.shadowRoot.querySelector('button.retry').click()");
        await p.eval("fx.ready()");
        eq((await p.eval("fx.state()")).rows, 100, "loaded after retry");
    });

    /* ------------------------------------------------------ copy / footer -- */

    test("copy a range as TSV", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        await p.eval("fx.focusGrid()");
        await p.eval("fx.grid.focusCell(1, 'name')");
        await p.key("ArrowDown", ["Shift"]);
        await p.key("ArrowRight", ["Shift"]);
        eq(await p.eval("fx.copyText()"), "Anna 1\t0.0\r\nBen 2\t3.7", "TSV");
        await p.eval("fx.grid.focusCell(1, 'note')");
        eq(await p.eval("fx.copyText()"), "\"first line 0\nsecond line\"", "quoted multi-line field");
    });

    test("footer aggregates and selection stats", async (p) => {
        await p.load("/test/fixture.html?rows=100");
        const sum = await p.eval("fx.data.reduce((a, r) => a + r.n, 0)");
        const shown = await p.eval("fx.foot(2)");
        ok(shown.replace(/,/g, "").includes(sum.toFixed(1)), `footer ${shown} vs ${sum}`);
        await p.eval("fx.focusGrid()");
        await p.eval("fx.grid.focusCell(1, 'n')");
        await p.key("ArrowDown", ["Shift"]);
        await p.key("ArrowDown", ["Shift"]);
        ok((await p.eval("fx.status()")).includes("Sum: 11.1"), "0 + 3.7 + 7.4");
    });

    /* ---------------------------------------------------- i18n / regional -- */

    test("German and regional formats relabel live", async (p) => {
        await p.load("/test/fixture.html?rows=1200");
        await p.eval("sac.regional.set({ number: '1.234,5', date: 'dmy.' })");
        await p.frames(2);
        eq(await p.eval("fx.cell(1, 2)"), "3,7", "decimal comma");
        eq(await p.eval("fx.cell(0, 3)"), "01.01.2026", "dmy. date");
        await p.eval("sac.lang.set('de')");
        await p.frames(2);
        ok((await p.eval("fx.status()")).includes("1.200 Zeilen"), "German status");
        eq(await p.eval("fx.grid._scroller.getAttribute('aria-label')"), "Fixture");
        await p.eval("sac.lang.set('en'); sac.regional.set({ number: '1,234.5', date: 'iso' })");
    });

    test("light and dark themes use tokens", async (p) => {
        await p.load("/test/fixture.html?rows=10");
        const dark = await p.eval("getComputedStyle(fx.grid).backgroundColor");
        await p.eval("document.documentElement.dataset.theme = 'light'");
        await p.frames(1);
        const light = await p.eval("getComputedStyle(fx.grid).backgroundColor");
        ok(dark !== light, `ground changes: ${dark} → ${light}`);
        await p.shot("light");
        await p.eval("delete document.documentElement.dataset.theme");
    });

    test("ARIA grid pattern", async (p) => {
        await p.load("/test/fixture.html?rows=40");
        const a = await p.eval(`(() => {
            const sc = fx.grid._scroller;
            const cell = fx.cellEl(2, 3);
            return {
                role: sc.getAttribute("role"),
                rowcount: sc.getAttribute("aria-rowcount"),
                colcount: sc.getAttribute("aria-colcount"),
                rowindex: cell.parentElement.getAttribute("aria-rowindex"),
                colindex: cell.getAttribute("aria-colindex"),
                cellRole: cell.getAttribute("role"),
                tab: sc.tabIndex,
            };
        })()`);
        eq(a, { role: "grid", rowcount: "42", colcount: "15", rowindex: "4", colindex: "5", cellRole: "gridcell", tab: 0 });
    });

    /* ------------------------------------------------------------- editing -- */

    const settle = (p) => p.eval("fx.ready()");
    const saves = (p) => p.eval("fx.log.filter(l => l[0] === 'save').map(l => l[1])");

    test("edit a text cell: Enter keeps, typing replaces, Esc cancels", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(3, 'w1')");
        await p.key("Enter");
        ok((await p.eval("fx.state()")).editing, "editing");
        eq(await p.eval("fx.activeTag()"), "input.cell-input", "plain input focused");
        await p.type("X");
        await p.key("Enter");
        await settle(p);
        let s = await p.eval("fx.state()");
        eq([s.editing, s.cur], [false, { r: 3, c: 11 }], "committed, moved down");
        eq(await p.eval("fx.cell(2, 11)"), "wide 2X");
        eq(await p.eval("fx.events.filter(e => e.type === 'sac:change').map(e => e.detail)"),
            [{ id: 3, field: "w1", value: "wide 2X", old: "wide 2" }], "sac:change");
        eq(await p.eval("fx.data[2].w1"), "wide 2X", "row mode saved on leaving the row");
        eq(await p.eval("fx.grid.dirty"), 0);
        await p.type("Qrs");
        ok((await p.eval("fx.state()")).editing, "typing starts editing");
        await p.key("Tab");
        await settle(p);
        eq(await p.eval("fx.cell(3, 11)"), "Qrs", "typing replaced the value");
        eq((await p.eval("fx.state()")).cur, { r: 3, c: 12 }, "tab moved right");
        await p.type("Z");
        await p.key("Escape");
        await settle(p);
        eq(await p.eval("fx.cell(3, 12)"), "wider 3", "escape cancelled");
        eq((await p.eval("fx.state()")).editing, false);
        ok(await p.eval("fx.focusGrid()"), "focus back on the grid");
    });

    test("kit cell editors: number, date, select, bool", async (p) => {
        await p.load("/test/fixture.html?rows=20&save-mode=batch");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'n')");
        await p.type("42");
        eq(await p.eval("fx.activeTag()"), "input.num", "sac-number-field");
        await p.key("Enter");
        await settle(p);
        eq(await p.eval("fx.cell(0, 2)"), "42.0", "number");
        eq((await p.eval("fx.state()")).cur, { r: 1, c: 2 }, "enter moved down");
        await p.eval("fx.grid.focusCell(1, 'd')");
        await p.type("2026-05-06");
        await p.key("Enter");
        await settle(p);
        eq(await p.eval("fx.cell(0, 3)"), "2026-05-06", "date");
        await p.eval("fx.grid.focusCell(1, 's')");
        await p.type("Gam");
        await p.key("Enter");
        await p.key("Enter");
        await settle(p);
        eq(await p.eval("fx.cell(0, 7)"), "Gamma", "select");
        await p.eval("fx.grid.focusCell(1, 'b')");
        await p.key(" ");
        await settle(p);
        eq(await p.eval("fx.grid._get(fx.data[0], fx.grid._cols[6])"), false, "space toggled the bool");
        eq(await saves(p), [], "batch mode: nothing sent yet");
        eq(await p.eval("fx.grid.dirty"), 1);
        ok((await p.eval("fx.status()")).includes("1 unsaved row"), "status: unsaved");
        await p.eval("fx.grid.save()");
        await settle(p);
        eq((await saves(p))[0][0].fields, { n: 42, d: "2026-05-06", s: "c", b: false }, "one update with every field");
        eq(await p.eval("fx.grid.dirty"), 0);
        eq(await p.eval("fx.data[0].n"), 42);
    });

    test("datetime and longtext editors", async (p) => {
        await p.load("/test/fixture.html?rows=20&save-mode=batch");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'dt')");
        await p.key("Enter");
        eq(await p.eval("fx.activeTag()"), "input.date", "date half");
        await p.key("Tab");
        ok((await p.eval("fx.state()")).editing, "tab stays inside the pair");
        ok((await p.eval("fx.activeTag()")).startsWith("input.seg"), "time half");
        await p.type("0930");
        await p.key("Tab");
        await settle(p);
        eq(await p.eval("fx.grid._get(fx.data[1], fx.grid._cols[5])"), "2026-02-02T09:30", "datetime");
        await p.eval("fx.grid.focusCell(2, 'note')");
        await p.key("Enter");
        ok(await p.eval("!!fx.grid.shadowRoot.querySelector('.long-pop:popover-open')"), "popover textarea");
        await p.type("A");
        await p.key("Enter");
        await p.type("B");
        ok((await p.eval("fx.state()")).editing, "enter is a new line");
        await p.key("Enter", ["Control"]);
        await settle(p);
        eq(await p.eval("fx.grid._get(fx.data[1], fx.grid._cols[10])"), "note 1A\nB", "ctrl+enter commits");
        eq(await p.eval("fx.cell(1, 10)"), "note 1A …", "first line shown");
    });

    test("delete clears the range; undo and redo", async (p) => {
        await p.load("/test/fixture.html?rows=20&save-mode=batch");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'w1')");
        await p.key("ArrowDown", ["Shift"]);
        await p.key("ArrowRight", ["Shift"]);
        await p.key("Delete");
        await settle(p);
        eq(await p.eval("[fx.cell(0, 11), fx.cell(1, 12)]"), ["", ""], "cleared");
        eq(await p.eval("fx.grid.dirty"), 2);
        await p.key("z", ["Control"]);
        await settle(p);
        eq(await p.eval("[fx.cell(0, 11), fx.cell(1, 12)]"), ["wide 0", "wider 1"], "undone");
        eq(await p.eval("fx.grid.dirty"), 0, "back to saved values: not dirty");
        await p.key("y", ["Control"]);
        await settle(p);
        eq(await p.eval("fx.cell(0, 11)"), "", "redone");
        await p.eval("fx.grid.revert()");
        await settle(p);
        eq(await p.eval("[fx.cell(0, 11), fx.grid.dirty]"), ["wide 0", 0], "revert");
    });

    test("required and validate mark cells; invalid rows are held back", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'name')");
        await p.key("Delete");
        await settle(p);
        ok(await p.eval("fx.cellEl(1, 1).classList.contains('invalid')"), "marked invalid");
        eq(await p.eval("fx.cellEl(1, 1).getAttribute('aria-description')"), "Required");
        eq(await p.eval("fx.cellEl(1, 1).getAttribute('aria-invalid')"), "true");
        await p.key("ArrowDown");
        await settle(p);
        eq(await saves(p), [], "not sent");
        ok((await p.eval("fx.status()")).includes("1 row with errors"), "status");
        await p.eval("fx.grid.focusCell(5, 'n')");
        await p.type("-5");
        await p.key("Enter");
        await settle(p);
        eq(await p.eval("fx.cellEl(4, 2).getAttribute('aria-description')"), "negative", "validate()");
        await p.key("z", ["Control"]);
        await p.key("z", ["Control"]);
        await settle(p);
        eq(await p.eval("[fx.cellEl(1, 1).classList.contains('invalid'), fx.grid.dirty]"), [false, 0], "undo clears it");
    });

    test("double-click edits the cell and keeps its value", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        const c = await center(p, "fx.cellEl(2, 1)");
        await p.click(c.x, c.y, { count: 2 });
        await p.frames(3);
        eq(await p.eval("[fx.grid._editor && fx.grid._editor.col.field, fx.grid._editor && fx.grid._editor.el.value]"), ["name", "Clara 3"], "editor with the value");
        await p.key("Escape");
        await p.frames(2);
        const h = await center(p, "fx.cellEl(2, 1).closest('.row')._rh");
        await p.click(h.x, h.y, { count: 2 });
        await p.frames(3);
        ok(await dialogOpen(p), "on the row header: the record form");
    });

    test("the error bubble shows on the cursor cell and on hover", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        const tip = (cell) => p.eval(`(() => { const t = fx.grid._tip, b = t.shadowRoot.querySelector(".bubble");
            return [b.classList.contains("shown"), b.textContent, ${cell ? `t._anchorEl === ${cell}` : "null"}]; })()`);
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'name')");
        await p.key("Delete");
        await settle(p);
        eq(await tip("fx.cellEl(1, 1)"), [true, "Required", true], "on the invalid cursor cell");
        eq(await p.eval("fx.cellEl(1, 1).title"), "", "no native tooltip");
        await p.key("ArrowRight");
        await p.frames(2);
        eq((await tip())[0], false, "gone on a valid cell");
        await p.key("ArrowLeft");
        await p.frames(2);
        eq(await tip("fx.cellEl(1, 1)"), [true, "Required", true], "back on it");
        await p.key("Enter");
        await p.frames(2);
        eq((await tip())[0], false, "hidden while editing");
        await p.key("Escape");
        await p.frames(2);
        eq((await tip())[0], true, "back after the editor closes");
        await p.eval("fx.grid._scroller.blur()");
        await p.frames(2);
        eq((await tip())[0], false, "hidden when the grid loses focus");
        const c = await center(p, "fx.cellEl(1, 1)");
        await p.mouse("mouseMoved", c.x, c.y, { buttons: 0 });
        await p.eval("new Promise(r => setTimeout(r, 500))");
        eq(await tip("fx.cellEl(1, 1)"), [true, "Required", true], "on hover");
        const o = await center(p, "fx.cellEl(5, 3)");
        await p.mouse("mouseMoved", o.x, o.y, { buttons: 0 });
        await p.frames(2);
        eq((await tip())[0], false, "gone when the pointer leaves");
    });

    test("a new source drops the old one's unsaved edits", async (p) => {
        await p.load("/test/fixture.html?rows=20&save-mode=batch");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(5, 'name')");
        await p.type("Changed");
        await p.key("Enter");
        await p.eval("fx.grid.addRow({ name: 'Extra' })");
        await settle(p);
        eq(await p.eval("fx.grid.dirty"), 2, "two unsaved rows");
        await p.eval("fx.grid.source = SacDataGrid.arraySource(fx.data.map((r) => Object.assign({}, r)), { key: 'id' })");
        await settle(p);
        eq(await p.eval("[fx.grid.dirty, fx.cell(4, 1), fx.state().rows]"), [0, "Emma 5", 20], "nothing carried over");
        await p.key("z", ["Control"]);
        await settle(p);
        eq(await p.eval("fx.cell(4, 1)"), "Emma 5", "no undo steps carried over");
    });

    test("an edit made while its row is saving is saved after it", async (p) => {
        await p.load("/test/fixture.html?rows=20&source=server&save-mode=cell");
        await p.eval(`(() => {
            const g = fx.grid, row = g._rowAt(0), col = (f) => g._cols.find((c) => c.field === f);
            g._applyChanges([{ row, col: col("name"), value: "First" }]);
            g._save([row.id]);
            g._applyChanges([{ row, col: col("w1"), value: "second" }]);
            g._save([row.id]);
        })()`);
        await p.eval("new Promise((r) => setTimeout(r, 300))");
        await settle(p);
        eq(await p.eval("fx.grid.dirty"), 0, "nothing left unsaved");
        eq(await p.eval("fx.log.filter((l) => l[0] === 'save').map((l) => l[1].map((c) => Object.keys(c.fields)))"), [[["name"]], [["w1"]]],
            "the second change went out after the first");
    });

    test("confirming a valid value clears a rejected text's error", async (p) => {
        await p.load("/test/fixture.html?rows=20&save-mode=batch");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'n')");
        await p.eval(`fx.grid._entryFor(fx.grid._rowAt(1)).errors.n = "Not a valid value: abc"`);
        await p.eval("fx.grid._stamp++; fx.grid._scheduleRender()");
        await p.frames(2);
        ok(await p.eval("fx.cellEl(1, 2).classList.contains('invalid')"), "marked");
        await p.key("Enter");
        await p.frames(2);
        await p.key("Enter");
        await settle(p);
        eq(await p.eval("[fx.cellEl(1, 2).classList.contains('invalid'), fx.grid.dirty]"), [false, 0], "the held value is fine again");
        await p.eval(`fx.grid._entryFor(fx.grid._rowAt(3)).errors.n = "Not a valid value: x"`);
        await p.eval("fx.grid._applyChanges([{ row: fx.grid._rowAt(3), col: fx.grid._cols[1], value: 'Other' }], true)");
        const res = await p.eval("fx.grid.save().then((r) => [r.invalid.length, r.saved.length])");
        eq(res, [0, 1], "a stale error does not hold back a save");
    });

    test("paste skips columns with inline: false", async (p) => {
        await p.load("/test/fixture.html?rows=20&save-mode=batch");
        await p.eval("fx.grid.columns = fx.grid.columns.map((c) => c.field === 'w1' ? { ...c, inline: false } : c)");
        await p.frames(2);
        const before = await p.eval("fx.cell(0, 11)");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'w1')");
        await p.eval(`fx.pasteText("pasted")`);
        await settle(p);
        eq([await p.eval("fx.cell(0, 11)"), await p.eval("fx.grid.dirty")], [before, 0], "the form-only column is untouched");
    });

    test("touch: a bool cell flips on a tap, not when a scroll starts on it", async (p) => {
        await p.load("/test/fixture.html?rows=20&save-mode=batch");
        const val = () => p.eval("fx.grid._get(fx.grid._rowAt(0), fx.grid._cols[6])");
        const start = await val();
        const touch = (type) => p.eval(`(() => { const type = ${JSON.stringify(type)}, c = fx.cellEl(0, 6), r = c.getBoundingClientRect();
            const o = { pointerType: "touch", pointerId: 7, isPrimary: true, button: 0, bubbles: true, composed: true, clientX: r.x + 8, clientY: r.y + 8 };
            c.dispatchEvent(type === "click" ? new MouseEvent("click", o) : new PointerEvent(type, o)); })()`);
        await touch("pointerdown");
        await touch("pointercancel");             // the browser took the gesture for a scroll
        await p.frames(2);
        eq(await val(), start, "a scroll leaves it alone");
        await touch("pointerdown");
        await touch("pointerup");
        await touch("click");
        await p.frames(2);
        eq(await val(), !start, "a tap flips it");
    });

    test("the new line drops a pooled row's error marks", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        const res = await p.eval(`(() => { const row = fx.cellEl(0, 1).closest(".row");
            fx.grid._cellError(row._cells[1], "Required");
            row._rh.classList.add("err");
            fx.grid._fillNewLine(row);
            return [row._cells[1]._err, row._cells[1].getAttribute("aria-description"), row._rh.classList.contains("err")]; })()`);
        eq(res, ["", null, false]);
    });

    test("a long press on a header leaves the next tap alone", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        await p.eval(`(() => { const h = fx.header(2), r = h.getBoundingClientRect();
            h.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", pointerId: 9, isPrimary: true, button: 0,
                bubbles: true, composed: true, clientX: r.x + 10, clientY: r.y + 10 })); })()`);
        await p.eval("new Promise((r) => setTimeout(r, 600))");
        ok(await p.eval("fx.grid._menu.hasAttribute('open')"), "the long press opened the menu");
        await p.key("Escape");
        await p.eval("new Promise((r) => setTimeout(r, 1100))");
        const h = await center(p, "fx.header(2)");
        await p.click(h.x, h.y);
        await settle(p);
        eq(await p.eval("fx.grid.view.sort"), [{ field: "n", dir: "asc" }], "the next tap sorts");
    });

    test("the row header's error dot counts hidden columns", async (p) => {
        await p.load("/test/fixture.html?rows=20&save-mode=batch");
        await p.eval("fx.grid.view = { columns: { w1: { hidden: true } } }");
        await p.frames(2);
        await p.eval(`fx.grid._entryFor(fx.grid._rowAt(0)).errors.w1 = "Server says no"; fx.grid._stamp++; fx.grid._scheduleRender()`);
        await p.frames(2);
        ok(await p.eval("fx.cellEl(0, 1).closest('.row')._rh.classList.contains('err')"), "marked");
    });

    test("switching row-header re-checks how many columns stay frozen", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        await p.eval("fx.grid.setAttribute('row-header', 'none'); fx.grid.style.width = '420px'");
        await p.eval("new Promise((r) => setTimeout(r, 200))");
        await p.frames(2);
        eq(await p.eval("fx.grid._nf"), 2, "none: both frozen columns fit");
        await p.eval("fx.grid.setAttribute('row-header', 'numbers')");
        await p.frames(2);
        eq(await p.eval("fx.grid._nf"), 1, "numbers: the wider header leaves room for one");
    });

    test("fit width leaves no room for a header button", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        await p.eval("fx.grid.columns = fx.grid.columns.map((c) => c.field === 'n' ? { ...c, label: 'A rather long header label' } : c)");
        await p.frames(2);
        await p.eval("fx.grid._fitColumn(2)");
        await p.frames(2);
        const [sw, cw, w] = await p.eval("[fx.header(2)._lbl.scrollWidth, fx.header(2)._lbl.clientWidth, fx.grid.view.columns.n.width]");
        ok(sw <= cw, `the title fits (${sw} of ${cw})`);
        ok(w - sw <= 22, `no spare room: column ${w}, title ${sw}`);
    });

    test("an aborted first load hands the footer totals on to the next", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        await p.eval(`(() => {
            window.__asked = [];
            const inner = SacDataGrid.arraySource(fx.data, { key: "id", pageSize: 50 });
            fx.grid.source = { key: "id", pageSize: 50, load(q) {
                __asked.push(q.aggregate.length);
                return new Promise((resolve, reject) => {
                    const timer = setTimeout(() => resolve(inner.load(q)), 80);
                    q.signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); });
                });
            } };
        })()`);
        await p.eval(`new Promise((r) => requestAnimationFrame(() => {
            const g = fx.grid, blk = g._blocks.get(0);
            blk.ctrl.abort();                 // what _request does to a block nobody looks at
            g._blocks.delete(0);
            r();
        }))`);
        await p.eval("new Promise((r) => setTimeout(r, 50))");
        await p.eval("fx.grid._stamp++; fx.grid._scheduleRender()");
        await settle(p);
        const asked = await p.eval("__asked");
        ok(asked.length >= 2 && asked[asked.length - 1] > 0, `the next load asks for the totals (${JSON.stringify(asked)})`);
        ok(await p.eval("fx.grid._aggs != null"), "the footer has its totals");
    });

    test("tags: a repaint reuses the chips a cell holds", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        const c = await p.eval("fx.grid._cols.findIndex((x) => x.typeName === 'tags')");
        const r = await p.eval(`(() => { let r = 0; while (!(fx.grid._get(fx.grid._rowAt(r), fx.grid._cols[${c}]) || []).length) r++; return r; })()`);
        await p.eval(`window.__chip = fx.cellEl(${r}, ${c}).querySelector("sac-chip")`);
        await p.eval("fx.grid._stamp++; fx.grid._scheduleRender()");
        await p.frames(2);
        ok(await p.eval(`fx.cellEl(${r}, ${c}).querySelector("sac-chip") === __chip`), "the same chip element");
    });

    test("tags: without sac-chip the cell shows the labels as text", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        const res = await p.eval(`(() => {
            const get = customElements.get;
            customElements.get = (n) => (n === "sac-chip" ? undefined : get.call(customElements, n));
            try {
                const col = fx.grid._cols.find((x) => x.typeName === "tags"), div = document.createElement("div");
                col.type.render(div, ["x", "y"], col);
                return div.textContent;
            } finally { customElements.get = get; }
        })()`);
        eq(res, "Ex, Why");
        await p.frames(1);
        const warned = p.console.filter((m) => /<sac-chip> is not loaded/.test(m));
        eq(warned.length, 1, "one console warning");
        p.console = p.console.filter((m) => !warned.includes(m));      // expected, not a failure
    });

    test("arraySource: saving many updates does not rebuild its index per row", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        const ms = await p.eval(`(async () => {
            const rows = Array.from({ length: 100000 }, (_, i) => ({ id: i + 1, v: i }));
            const src = SacDataGrid.arraySource(rows, { key: "id" });
            const changes = Array.from({ length: 1000 }, (_, i) => ({ id: i * 50 + 1, op: "update", fields: { v: -1 } }));
            const t0 = performance.now();
            const res = await src.save(changes);
            return [Math.round(performance.now() - t0), res.saved.length];
        })()`);
        eq(ms[1], 1000, "all saved");
        ok(ms[0] < 1000, `fast enough (${ms[0]} ms)`);
    });

    test("pasting a huge block does not overflow the stack", async (p) => {
        await p.load("/test/fixture.html?rows=20&save-mode=batch");
        await p.eval("fx.grid._newLine = () => 0");          // no rows added: only the size matters
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'w1')");
        await p.eval(`fx.pasteText("v\\n".repeat(200000))`);
        await settle(p);
        eq(await p.eval("[fx.cell(0, 11), fx.cell(19, 11)]"), ["v", "v"], "pasted down to the last row");
    });

    test("datetime editor: the date is not cut short by its calendar button", async (p) => {
        await p.load("/test/fixture.html?rows=20");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'dt')");
        await p.key("Enter");
        await p.frames(3);
        const fit = await p.eval(`(() => {
            const [date, time] = fx.grid._editor.el.children;
            const input = date.shadowRoot.querySelector("input"), field = time.shadowRoot.querySelector(".field");
            return [input.scrollWidth <= input.clientWidth, field.scrollWidth <= time.getBoundingClientRect().width + 0.5]; })()`);
        eq(fit, [true, true], "date and time both show in full");
    });

    /* A lifted editor: geometry of the editor (ed.pop) against its cell. */
    const lifted = (p) => p.eval(`(() => { const ed = fx.grid._editor; if (!ed) return null;
        const c = ed.cell.getBoundingClientRect(), r = ed.pop && ed.pop.getBoundingClientRect();
        const input = ed.el.shadowRoot && ed.el.shadowRoot.querySelector("input");
        return { lifted: !!ed.pop, cell: [Math.round(c.left), Math.round(c.right), Math.round(c.top)],
            pop: r ? [Math.round(r.left), Math.round(r.right), Math.round(r.top)] : null,
            fits: input ? input.scrollWidth <= input.clientWidth : null,
            clip: ed.pop ? ed.pop.style.clipPath : "", hidden: ed.pop ? ed.pop.style.opacity === "0" : false }; })()`);

    test("lifted editor: a narrow date column edits over its neighbour", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(3, 'd')");
        await p.key("Enter");
        await p.frames(3);
        eq((await lifted(p)).lifted, false, "a wide enough column edits in place");
        await p.key("Escape");
        await p.eval("fx.grid.view = { columns: { d: { width: 80 } } }");
        await p.frames(2);
        await p.eval("fx.focusGrid(); fx.grid.focusCell(3, 'd')");
        await p.key("Enter");
        await p.frames(3);
        const g = await lifted(p);
        ok(g.lifted && g.pop[1] - g.pop[0] > g.cell[1] - g.cell[0], "lifted, wider than the cell");
        eq([g.pop[0], g.pop[2], g.fits], [g.cell[0], g.cell[2], true], "anchored at the cell, the date in full");
        eq(await p.eval("fx.grid.view.columns.d.width"), 80, "the column keeps its width");
        await p.key("Escape");
        await p.frames(2);
        eq(await p.eval("[!!fx.grid._editor, fx.grid.shadowRoot.querySelectorAll('.lift-pop').length]"), [false, 0], "gone with the editor");
    });

    test("lifted editor: an empty cell has room for a full date", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        await p.eval("fx.grid.view = { columns: { d: { width: 80 } } }");
        await p.frames(2);
        await p.eval("fx.focusGrid(); fx.grid.focusCell(3, 'd')");
        await p.key("Delete");
        await p.key("Enter");
        await p.frames(3);
        ok((await lifted(p)).lifted, "lifted although empty");
    });

    test("lifted editor: a right-aligned column grows to the left", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        await p.eval("fx.grid.columns = fx.grid.columns.map((c) => c.field === 'd' ? { ...c, align: 'right', width: 80 } : c)");
        await p.frames(2);
        await p.eval("fx.focusGrid(); fx.grid.focusCell(3, 'd')");
        await p.key("Enter");
        await p.frames(3);
        const g = await lifted(p);
        eq([g.lifted, g.pop[1]], [true, g.cell[1]], "its right edge stays on the cell's");
        ok(g.pop[0] < g.cell[0], "and it grows left");
    });

    test("lifted editor: follows its cell while scrolling, hidden under the header", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        await p.eval("fx.grid.view = { columns: { d: { width: 80 } } }");
        await p.frames(2);
        await p.eval("fx.focusGrid(); fx.grid.focusCell(4, 'd')");
        await p.key("Enter");
        await p.frames(3);
        await p.eval("fx.grid._scroller.scrollTop = 40");
        await p.frames(3);
        const g = await lifted(p);
        eq(g.pop[2], g.cell[2], "moved with the cell");
        await p.eval("fx.grid._scroller.scrollTop = 110");      // the cell now half under the header
        await p.frames(3);
        const h = await lifted(p);
        eq(h.pop[2], h.cell[2], "still on its cell");
        ok(/^inset\([1-9]\d*px 0px 0px( 0px)?\)$/.test(h.clip), `clipped under the header (${h.clip})`);
        await p.eval("fx.grid._scroller.scrollTop = 400");
        await p.frames(3);
        const gone = await lifted(p);
        ok(gone && gone.hidden, "hidden once its cell is out of view");
        ok(await p.eval("fx.grid._editorHasFocus()"), "the field keeps the focus");
    });

    test("lifted editor: a select has room for its longest option, and its list works", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        await p.eval("fx.grid.columns = fx.grid.columns.map((c) => c.field === 's' ? { ...c, width: 60 } : c)");
        await p.frames(2);
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 's')");
        await p.key("Enter");
        await p.frames(3);
        ok((await lifted(p)).lifted, "lifted");
        await p.key("ArrowDown", ["Alt"]);
        await p.frames(3);
        ok(await p.eval("fx.grid._editor.el.open"), "the list is open");
        await p.key("End");
        await p.key("Enter");
        await p.frames(3);
        await p.key("Enter");
        await settle(p);
        eq(await p.eval("fx.grid._get(fx.grid._rowAt(1), fx.grid._cols[7])"), "c", "picked the last option");
    });

    test("save errors from the source keep cells dirty and marked", async (p) => {
        await p.load("/test/fixture.html?rows=20&save-error=1");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'w2')");
        await p.type("oops");
        await p.key("Enter");
        await settle(p);
        eq((await saves(p)).length, 1, "sent");
        eq(await p.eval("fx.cellEl(0, 12).getAttribute('aria-description')"), "Server says no");
        eq(await p.eval("fx.grid.dirty"), 1, "still dirty");
        const ev = await p.eval("fx.events.filter(e => e.type === 'sac:save').map(e => e.detail.errors.length)");
        eq(ev, [1], "sac:save carries the errors");
    });

    test("cell save mode saves every commit", async (p) => {
        await p.load("/test/fixture.html?rows=20&save-mode=cell");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'w1')");
        await p.type("a");
        await p.key("Tab");
        await p.type("b");
        await p.key("Tab");
        await settle(p);
        eq((await saves(p)).map((s) => s.map((c) => c.fields)), [[{ w1: "a" }], [{ w2: "b" }]]);
    });

    test("new row line: type to add, saved when leaving it", async (p) => {
        await p.load("/test/fixture.html?rows=5");
        await p.eval("fx.focusGrid()");
        await p.key("End", ["Control"]);
        await p.key("ArrowDown");
        await p.key("Home");
        await p.key("ArrowRight");
        eq((await p.eval("fx.state()")).cur, { r: 5, c: 1 }, "on the new-row line");
        eq(await p.eval("fx.cell(5, 1)"), "New row");
        await p.type("Neo");
        await p.key("Enter");
        await settle(p);
        eq(await p.eval("[fx.data.length, fx.data[5].name, fx.data[5].id]"), [6, "Neo", 6], "created at the source");
        eq((await saves(p))[0][0].op, "create");
        eq(await p.eval("fx.cell(5, 0)"), "6", "real id shown");
        eq(await p.eval("fx.grid.dirty"), 0);
        eq((await p.eval("fx.state()")).cur, { r: 6, c: 1 }, "enter moved onto the new-row line");
        await p.type("x");
        await p.key("Escape");
        await p.key("ArrowUp");
        await settle(p);
        eq((await p.eval("fx.state()")).rows, 6, "an untouched new row goes away");
        await p.eval("fx.grid.addRow({ name: 'Api' })");
        await settle(p);
        eq((await p.eval("fx.state()")).cur.r, 6, "addRow moves the cursor");
        eq(await p.eval("fx.cell(6, 1)"), "Api");
    });

    test("delete rows: request-delete, undo, removal after the toast", async (p) => {
        await p.load("/test/fixture.html?rows=10");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(3, 'name')");
        await p.key("ArrowDown", ["Shift"]);
        await p.key("F10", ["Shift"]);
        await p.frames(2);
        await p.eval(`fx.grid._menu.querySelector('[data-action="delete-rows"]').click()`);
        await settle(p);
        eq(await p.eval("fx.events.filter(e => e.type === 'sac:request-delete').map(e => e.detail.ids)"), [[3, 4]]);
        ok(await p.eval("fx.cellEl(2, 1).parentElement.classList.contains('deleted')"), "marked");
        await p.eval("fx.focusGrid()");
        await p.key("z", ["Control"]);
        await settle(p);
        ok(!(await p.eval("fx.cellEl(2, 1).parentElement.classList.contains('deleted')")), "undone");
        await p.eval("fx.grid.addEventListener('sac:request-delete', e => { if (window.block) e.preventDefault(); }); window.block = true");
        await p.eval("fx.grid.focusCell(6, 'name'); fx.grid._deleteRows([5])");
        await settle(p);
        ok(!(await p.eval("fx.cellEl(5, 1).parentElement.classList.contains('deleted')")), "cancelable");
        await p.eval("window.block = false; fx.grid._deleteRows([5])");
        await p.eval("fx.grid._undo[fx.grid._undo.length - 1].toast.dismiss()");
        await p.eval("new Promise(r => setTimeout(r, 50))");
        await settle(p);
        eq(await p.eval("[fx.source.rows.length, fx.state().rows]"), [9, 9], "removed after the toast");
        eq(await p.eval("fx.log.filter(l => l[0] === 'remove').map(l => l[1])"), [[6]], "via source.remove");
    });

    test("read mode has no editing affordances", async (p) => {
        await p.load("/test/fixture.html?rows=5&mode=read");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'name')");
        await p.type("x");
        await p.key("Delete");
        await p.key(" ");
        await settle(p);
        eq([(await p.eval("fx.state()")).editing, await p.eval("fx.grid.dirty"), await p.eval("fx.cell(0, 1)")], [false, 0, "Anna 1"]);
        eq(await p.eval("fx.grid._scroller.getAttribute('aria-readonly')"), "true");
        eq((await p.eval("fx.state()")).rows, 5, "no new-row line");
        await p.eval("fx.grid.mode = 'sheet'");
        await settle(p);
        eq(await p.eval("fx.cell(5, 1)"), "New row", "switching mode at runtime");
    });

    test("the editor survives scrolling away", async (p) => {
        await p.load("/test/fixture.html?rows=5000");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'w1')");
        await p.type("far");
        await p.eval("fx.grid._scroller.scrollTop = 50000");
        await settle(p);
        ok((await p.eval("fx.state()")).editing, "still editing");
        eq(await p.eval("fx.grid._editor.el.isConnected"), true);
        await p.key("Enter");
        await settle(p);
        eq(await p.eval("fx.data[0].w1"), "far");
    });
    /* ------------------------------------------------- paste, cut, the form -- */

    const dialogOpen = (p) => p.eval("!!document.querySelector('sac-dialog[open]')");

    test("paste TSV: fill, block, parse, reject, extend, one undo", async (p) => {
        await p.load("/test/fixture.html?rows=6&save-mode=batch");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'w1')");
        await p.key("ArrowDown", ["Shift"]);
        await p.key("ArrowRight", ["Shift"]);
        ok(await p.eval("fx.pasteText('same')"), "paste handled");
        await settle(p);
        eq(await p.eval("[fx.cell(0, 11), fx.cell(0, 12), fx.cell(1, 11), fx.cell(1, 12)]"), ["same", "same", "same", "same"], "one value fills the range");
        await p.eval("sac.regional.set({ number: '1.234,5', date: 'dmy.' })");
        await p.eval("fx.grid.focusCell(1, 'n')");
        await p.eval(`fx.pasteText("1.234,5\\t2026-03-04\\r\\nabc\\t04.05.2026\\r\\n")`);
        await settle(p);
        eq(await p.eval("[0, 1].map(i => [fx.grid._get(fx.data[i], fx.grid._cols[2]), fx.grid._get(fx.data[i], fx.grid._cols[3])])"),
            [[1234.5, "2026-03-04"], [3.7, "2026-05-04"]], "parsed per type; the bad number not applied");
        ok(await p.eval("fx.cellEl(1, 2).classList.contains('invalid')"), "bad cell marked");
        ok((await p.eval("fx.cellEl(1, 2).getAttribute('aria-description')")).includes("abc"), "with the rejected text");
        await p.eval("sac.regional.set({ number: '1,234.5', date: 'iso' })");
        await p.eval("fx.grid.focusCell(6, 'name')");
        await p.eval(`fx.pasteText("x1\\ny1\\nz1")`);
        await settle(p);
        eq((await p.eval("fx.state()")).rows, 8, "two rows added past the end");
        eq(await p.eval("[fx.cell(5, 1), fx.cell(6, 1), fx.cell(7, 1)]"), ["x1", "y1", "z1"]);
        await p.key("z", ["Control"]);
        await settle(p);
        eq([(await p.eval("fx.state()")).rows, await p.eval("fx.cell(5, 1)")], [6, "Felix 6"], "one undo takes the paste back");
    });

    test("paste saves the other rows at once in row mode", async (p) => {
        await p.load("/test/fixture.html?rows=6");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'w1')");
        await p.eval(`fx.pasteText("a\\nb\\nc")`);
        await settle(p);
        eq((await saves(p)).map((s) => s.map((c) => c.id)), [[2, 3]], "rows 2 and 3 saved, the cursor's row waits");
        await p.key("ArrowDown");
        await settle(p);
        eq(await p.eval("fx.grid.dirty"), 0);
    });

    test("cut copies and clears", async (p) => {
        await p.load("/test/fixture.html?rows=6&save-mode=batch");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'w1')");
        const text = await p.eval(`(() => {
            let t = null;
            const grab = (e) => { t = e.clipboardData.getData("text/plain"); };
            document.addEventListener("cut", grab);
            document.execCommand("cut");
            document.removeEventListener("cut", grab);
            return t;
        })()`);
        eq(text, "wide 1");
        await settle(p);
        eq(await p.eval("fx.cell(1, 11)"), "");
    });

    test("form mode: a record in a sac-dialog, one changes entry", async (p) => {
        await p.load("/test/fixture.html?rows=10&mode=form");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'name')");
        await p.key("Enter");
        await p.frames(3);
        ok(await dialogOpen(p), "dialog open");
        eq(await p.eval("document.querySelector('sac-dialog').getAttribute('title')"), "Ben 2");
        eq(await p.eval("fx.grid._formState.fields.length"), 14, "every column");
        eq(await p.eval("fx.activeTag()"), "input", "first editable field focused");
        await p.key("a", ["Control"]);
        await p.type("Bea");
        await p.eval("fx.grid._formState.fields[2].focus.value = 5");
        await p.key("Enter", ["Control"]);
        await settle(p);
        ok(!(await dialogOpen(p)), "closed after saving");
        eq(await p.eval("[fx.data[1].name, fx.data[1].n]"), ["Bea", 5]);
        const s = await saves(p);
        eq([s.length, s[0].length, s[0][0].fields], [1, 1, { name: "Bea", n: 5 }], "one save, one entry");
        ok(await p.eval("fx.grid.shadowRoot.activeElement === fx.grid._scroller"), "focus back on the grid");
    });

    test("form validation, previous / next and new", async (p) => {
        await p.load("/test/fixture.html?rows=10&mode=form");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'name')");
        await p.key("Enter");
        await p.frames(3);
        await p.eval("fx.grid._formState.fields[1].focus.value = ''");
        await p.eval("document.querySelector('sac-dialog').trigger('save')");
        await settle(p);
        ok(await dialogOpen(p), "stays open");
        eq(await p.eval("fx.grid._formState.fields[1].err.textContent"), "Required");
        await p.eval("fx.grid._formState.fields[1].focus.value = 'Ben two'");
        await p.eval("fx.grid._formState.nav.querySelectorAll('button')[1].click()");
        await settle(p);
        eq(await p.eval("document.querySelector('sac-dialog').getAttribute('title')"), "Clara 3", "next record");
        eq(await p.eval("fx.data[1].name"), "Ben two", "saved on the way");
        eq((await p.eval("fx.state()")).cur.r, 2, "the grid's cursor follows");
        await p.eval("fx.grid._formState.nav.querySelectorAll('button')[2].click()");
        await settle(p);
        eq(await p.eval("document.querySelector('sac-dialog').getAttribute('title')"), "New record");
        await p.eval("fx.grid._formState.fields[1].focus.value = 'Newbie'");
        await p.eval("document.querySelector('sac-dialog').trigger('save')");
        await settle(p);
        eq(await p.eval("[fx.source.rows.length, fx.source.rows[10].name]"), [11, "Newbie"], "created");
    });

    test("read mode opens the record read-only", async (p) => {
        await p.load("/test/fixture.html?rows=5&mode=read");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'name')");
        await p.key("Enter");
        await p.frames(3);
        eq(await p.eval("fx.grid._formState.readOnly"), true);
        eq(await p.eval("document.querySelector('sac-dialog').buttons.map(b => b.action)"), ["close"]);
        eq(await p.eval("fx.grid._formState.fields[1].focus.disabled"), true);
        await p.key("Escape");
        await p.frames(3);
        ok(!(await dialogOpen(p)), "closed");
        ok(await p.eval("fx.grid.shadowRoot.activeElement === fx.grid._scroller"), "focus back");
    });

    test("sheet mode: Shift+Enter opens the record", async (p) => {
        await p.load("/test/fixture.html?rows=5");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(3, 'name')");
        await p.key("Enter", ["Shift"]);
        await p.frames(3);
        ok(await dialogOpen(p));
        eq(await p.eval("fx.grid._formState.readOnly"), false);
        await p.key("Escape");
    });

    test("phones: no inline editing, the form is the way to edit", async (p) => {
        await p.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 800, deviceScaleFactor: 2, mobile: true });
        try {
            await p.load("/test/fixture.html?rows=5");
            ok(await p.eval("fx.grid._compact()"), "compact");
            await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'name')");
            await p.type("x");
            eq((await p.eval("fx.state()")).editing, false, "typing does not edit inline");
            eq((await p.eval("fx.state()")).rows, 5, "no new-row line");
            await p.key("Enter");
            await p.frames(3);
            ok(await dialogOpen(p), "Enter opens the form");
            await p.key("Escape");
            await p.frames(3);
            const c = await center(p, "fx.cellEl(0, 1)");
            await p.click(c.x, c.y);
            await p.frames(3);
            ok(await dialogOpen(p), "a tap on the active cell opens it");
            await p.key("Escape");
            await p.eval("fx.grid.setAttribute('compact-edit', 'read')");
            await p.key("Enter");
            await p.frames(3);
            eq(await p.eval("fx.grid._formState.readOnly"), true, "compact-edit=read");
            await p.key("Escape");
        } finally {
            await p.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
        }
    });

    test("mode-toggle shows a switch", async (p) => {
        await p.load("/test/fixture.html?rows=5");
        eq(await p.eval("fx.grid.shadowRoot.querySelector('.modes').hidden"), true, "off by default");
        await p.eval("fx.grid.setAttribute('mode-toggle', '')");
        await settle(p);
        eq(await p.eval("fx.grid.shadowRoot.querySelector('.modes').hidden"), false);
        await p.eval("fx.grid.shadowRoot.querySelector('.modes [data-value=form]').click()");
        await settle(p);
        eq(await p.eval("fx.grid.mode"), "form");
    });
    test("form: Tab reaches every field, kit fields included", async (p) => {
        await p.load("/test/fixture.html?rows=5&mode=form");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'name')");
        await p.key("Enter");
        await p.frames(3);
        // The dialog's trap steps through the kit fields' own inputs (a date
        // field is its text and its calendar button): one entry per field.
        const hosts = [];
        let inside = true;
        for (let i = 0; i < 40 && hosts[hosts.length - 1] !== "textarea"; i++) {
            await p.key("Tab");
            const [host, inner] = await p.eval(`(() => {
                const a = document.activeElement, d = fx.deepActive();
                return [a.localName, !a.localName.startsWith("sac-") || d !== a];
            })()`);
            inside = inside && inner;
            if (hosts[hosts.length - 1] !== host) hosts.push(host);
        }
        eq(hosts, ["sac-number-field", "sac-date-field", "sac-time-field", "sac-date-field", "sac-time-field",
            "input", "sac-select", "sac-chip-input", "sac-color-field", "textarea"]);
        ok(inside, "focus lands on the inputs inside the kit fields");
        await p.key("Tab", ["Shift"]);
        eq(await p.eval("document.activeElement.localName"), "sac-color-field", "Shift+Tab goes back");
        await p.key("Escape");
    });
    test("source.create saves new rows and hands back the real id", async (p) => {
        await p.load("/test/fixture.html?rows=3&create=1");
        await p.eval("fx.focusGrid()");
        await p.key("End", ["Control"]);
        await p.key("ArrowDown");
        await p.key("Home");
        await p.key("ArrowRight");
        await p.type("Cre");
        await p.key("Enter");
        await settle(p);
        eq(await p.eval("[fx.source.rows.length, fx.source.rows[3].name, fx.source.rows[3].id]"), [4, "Cre", 4]);
        eq(await saves(p), [], "create(), not save()");
        eq(await p.eval("fx.cell(3, 0)"), "4", "the real id shown");
        eq(await p.eval("fx.grid.dirty"), 0);
    });

    test("async source: an edit saves after the round trip", async (p) => {
        await p.load("/test/fixture.html?rows=120&source=server");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'w1')");
        await p.type("srv");
        await p.key("Enter");
        await p.eval("new Promise(r => setTimeout(r, 120))");
        await settle(p);
        eq(await p.eval("[fx.data[1].w1, fx.grid.dirty, fx.cell(1, 11)]"), ["srv", 0, "srv"]);
    });

    test("custom column types and inline: false", async (p) => {
        await p.load("/test/fixture.html?rows=5&save-mode=batch");
        await p.eval(`fx.grid.columns = [
            { field: "id", label: "ID", type: "readonly", width: 60 },
            { field: "stars", label: "Stars", type: {
                render: (v) => "★".repeat(v || 0),
                format: (v) => String(v || 0),
                parse: (t) => { const n = parseInt(t, 10); if (!(n >= 0 && n <= 5)) throw new Error("0-5"); return n; },
                editor: (cell) => { const i = document.createElement("input"); i.className = "cell-input"; i.value = String(cell.value || 0); return i; },
            } },
            { field: "name", label: "Name", type: "text", inline: false },
        ]`);
        await settle(p);
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'stars')");
        await p.key("Enter");
        eq(await p.eval("fx.activeTag()"), "input.cell-input", "the custom editor");
        await p.key("a", ["Control"]);
        await p.type("3");
        await p.key("Enter");
        await settle(p);
        eq(await p.eval("fx.grid._get(fx.data[0], fx.grid._cols[1])"), 3, "parse() made it a number");
        eq(await p.eval("fx.cell(0, 1)"), "★★★", "render()");
        await p.eval("fx.grid.focusCell(1, 'stars')");
        eq(await p.eval("fx.copyText()"), "3", "format() for the clipboard");
        await p.eval(`fx.pasteText("9")`);
        await settle(p);
        eq(await p.eval("[fx.grid._get(fx.data[0], fx.grid._cols[1]), fx.cellEl(0, 1).classList.contains('invalid')]"), [3, true], "parse() rejects");
        await p.eval("fx.grid.focusCell(2, 'name')");
        await p.key("Enter");
        await p.frames(3);
        ok(await dialogOpen(p), "inline: false edits in the record form");
        await p.key("Escape");
    });
    /* ------------------------------------------------------------- polish -- */

    test("column menu works from the keyboard", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'n')");
        await p.key("ArrowDown", ["Alt"]);
        await p.frames(2);
        ok(await p.eval("fx.grid._menu.hasAttribute('open')"), "Alt+↓ opens the column menu");
        await p.key("ArrowDown");
        await p.key("ArrowDown");
        eq(await p.eval("fx.deepActive().dataset.action"), "sort-desc", "arrows move through the items");
        await p.key("Enter");
        await settle(p);
        eq(await p.eval("fx.grid.view.sort"), [{ field: "n", dir: "desc" }]);
        ok(await p.eval("fx.grid.shadowRoot.activeElement === fx.grid._scroller"), "focus back on the grid");
        eq((await p.eval("fx.state()")).cur.r, 0, "the grid's cursor did not move");
    });

    test("filter popover: follows its column, closes when focus leaves", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        await p.eval("fx.grid._openFilter(3)");
        await p.frames(3);
        const before = await p.eval("fx.rect(fx.grid._pop).x");
        await p.eval("fx.grid._scroller.scrollLeft = 60");
        await p.frames(3);
        const after = await p.eval("fx.rect(fx.grid._pop).x");
        ok(Math.abs(before - 60 - after) < 2, `moved with the header: ${before} → ${after}`);
        ok(await p.eval("fx.grid._pop.matches(':popover-open')"), "still open while focus is inside");
        await p.eval("fx.grid._scroller.focus()");
        await p.frames(2);
        eq(await p.eval("fx.grid._pop.matches(':popover-open')"), false, "focus leaving closed it");
    });

    test("form: Escape with changes asks, Keep editing restores them", async (p) => {
        await p.load("/test/fixture.html?rows=10&mode=form");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'name')");
        await p.key("Enter");
        await p.frames(3);
        await p.key("a", ["Control"]);
        await p.type("Changed");
        await p.key("Escape");
        await p.frames(4);
        eq(await p.eval("document.querySelector('sac-dialog[open]').getAttribute('title')"), "Discard your changes?", "asks");
        await p.eval("document.querySelector('sac-dialog[open]').trigger('keep')");
        await p.eval("new Promise(r => setTimeout(r, 250))");   // sac.dialog answers after its fade-out
        await p.frames(2);
        eq(await p.eval("fx.grid._formState && fx.grid._formState.fields[1].focus.value"), "Changed", "reopened with the typed text");
        await p.key("Escape");
        await p.frames(4);
        await p.eval("document.querySelector('sac-dialog[open]').trigger('discard')");
        await p.eval("new Promise(r => setTimeout(r, 250))");
        await p.frames(2);
        eq([await dialogOpen(p), await p.eval("fx.data[1].name")], [false, "Ben 2"], "discard drops them");
        await p.key("Enter");
        await p.frames(3);
        await p.eval("document.querySelector('sac-dialog[open]').trigger('cancel')");
        await p.frames(3);
        ok(!(await dialogOpen(p)), "an explicit Cancel does not ask");
    });

    test("form: a language switch relabels it and keeps the typed text", async (p) => {
        await p.load("/test/fixture.html?rows=10&mode=form");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'name')");
        await p.key("Enter");
        await p.frames(3);
        await p.key("a", ["Control"]);
        await p.type("Typed");
        await p.eval("sac.lang.set('de')");
        await p.frames(3);
        try {
            eq(await p.eval("fx.grid._formState.nav.querySelector('button').textContent"), "Vorheriger", "German");
            eq(await p.eval("fx.grid._formState.fields[1].focus.value"), "Typed", "kept");
            eq(await p.eval("document.activeElement === fx.grid._formState.fields[1].focus"), true, "focus kept");
        } finally {
            await p.eval("sac.lang.set('en')");
        }
        await p.eval("document.querySelector('sac-dialog[open]').trigger('cancel')");
    });

    test("removing the grid closes its form and menu", async (p) => {
        await p.load("/test/fixture.html?rows=5&mode=form");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'name')");
        await p.key("Enter");
        await p.frames(3);
        await p.eval("fx.grid.remove()");
        await p.frames(2);
        eq(await p.eval("!!document.querySelector('sac-dialog')"), false, "the form is gone");
        await p.eval("void document.body.appendChild(fx.grid)");
        await settle(p);
        await p.eval("fx.focusGrid()");
        await p.key("ArrowDown", ["Alt"]);
        await p.frames(2);
        ok(await p.eval("fx.grid._menu.hasAttribute('open')"), "menu open");
        await p.eval("fx.grid.remove()");
        await p.eval("void document.body.appendChild(fx.grid)");
        await settle(p);
        eq(await p.eval("fx.grid._menu.hasAttribute('open')"), false, "closed, and it stays closed when the grid comes back");
    });

    test("an empty grid still shows focus", async (p) => {
        await p.load("/test/fixture.html?rows=5&mode=read");
        await p.eval(`fx.grid.view = { filter: { name: { op: "contains", value: "nobody" } } }`);
        await settle(p);
        eq(await p.eval("fx.note()"), "No rows");
        ok(await p.eval("fx.grid._scroller.classList.contains('empty')"), "empty class for the focus ring");
    });
    test("row mode saves the row when focus leaves the grid", async (p) => {
        await p.load("/test/fixture.html?rows=10");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(2, 'w1')");
        await p.type("away");
        await p.key("Tab");
        await settle(p);
        eq(await saves(p), [], "still in the row: not saved yet");
        await p.eval("document.body.appendChild(Object.assign(document.createElement('input'), { id: 'outside' })).focus()");
        await p.eval("new Promise(r => setTimeout(r, 50))");
        await settle(p);
        eq([(await saves(p)).length, await p.eval("fx.data[1].w1"), await p.eval("fx.grid.dirty")], [1, "away", 0]);
    });

    test("column menu: a right-click on the header hands focus back to the grid", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'n')");
        await p.type("7");
        ok((await p.eval("fx.state()")).editing, "editing");
        const b = await p.eval("fx.center(fx.header(2))");
        await rclick(p, b.x, b.y);
        await p.frames(2);
        ok(await p.eval("fx.grid._menu.hasAttribute('open')"), "menu open");
        eq([(await p.eval("fx.state()")).editing, await p.eval("fx.grid._get(fx.data[0], fx.grid._cols[2])")], [false, 7],
            "the edit was committed");
        await p.key("Escape");
        await p.frames(2);
        ok(await p.eval("fx.grid.shadowRoot.activeElement === fx.grid._scroller"), "Escape: focus on the grid");
        await rclick(p, b.x, b.y);
        await p.frames(2);
        const item = await p.eval("fx.center(fx.grid._menu.querySelector('[data-action=sort-desc]'))");
        await p.click(item.x, item.y);
        await settle(p);
        eq(await p.eval("fx.grid.view.sort"), [{ field: "n", dir: "desc" }]);
        ok(await p.eval("fx.grid.shadowRoot.activeElement === fx.grid._scroller"), "a picked item: focus on the grid");
        await p.key("ArrowRight");
        eq((await p.eval("fx.state()")).cur.c, 3, "the keyboard drives the grid again");
    });

    test("form: Escape closes an open list first, then the form", async (p) => {
        await p.load("/test/fixture.html?rows=5&mode=form");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'name')");
        await p.key("Enter");
        await p.frames(3);
        await p.eval("document.querySelector('sac-dialog sac-select').focus()");
        await p.key("ArrowDown");
        await p.frames(2);
        ok(await p.eval("document.querySelector('sac-dialog sac-select').open"), "list open");
        await p.key("Escape");
        await p.frames(2);
        eq([await p.eval("document.querySelector('sac-dialog sac-select').open"), await dialogOpen(p)], [false, true],
            "the list closed, the form stays");
        await p.key("Escape");
        await p.eval("new Promise(r => setTimeout(r, 250))");
        await p.frames(2);
        eq(await dialogOpen(p), false, "the next Escape closes the form");
        ok(await p.eval("fx.grid.shadowRoot.activeElement === fx.grid._scroller"), "focus back on the grid");
    });

    test("tags: labels in the chip editor and the form; copy and paste use them", async (p) => {
        await p.load("/test/fixture.html?rows=6&save-mode=batch");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'tags')");
        eq(await p.eval("fx.copyText()"), "Ex, Why", "copy writes the labels");
        await p.key("Enter");
        await p.frames(2);
        const chips = "(el) => [...el.shadowRoot.querySelectorAll('sac-chip')].map((c) => c.getAttribute('label'))";
        eq(await p.eval(`(${chips})(fx.grid._editor.el)`), ["Ex", "Why"], "the cell editor's chips");
        await p.key("Escape");
        await settle(p);
        await p.eval("fx.grid.focusCell(3, 'tags')");
        await p.eval(`fx.pasteText("why, Fresh\\nHello World")`);
        await settle(p);
        eq(await p.eval("[fx.grid._get(fx.data[2], fx.grid._cols[8]), fx.grid._get(fx.data[3], fx.grid._cols[8])]"),
            [["y", "fresh"], []], "labels and names read back; a new name the chip editor can hold");
        ok(await p.eval("fx.cellEl(3, 8).classList.contains('invalid')"), "an impossible tag name is rejected");
        await p.eval("fx.grid.focusCell(1, 'name')");
        await p.key("Enter", ["Shift"]);
        await p.frames(3);
        eq(await p.eval(`(${chips})(document.querySelector('sac-dialog sac-chip-input'))`), ["Ex", "Why"], "the form's chips");
        await p.key("Escape");
    });

    test("dates and times read and show text the kit's way", async (p) => {
        await p.load("/test/fixture.html?rows=3");
        const r = await p.eval(`(() => {
            const T = SacDataGridTypes, out = {};
            try {
                sac.regional.set({ date: "iso", hourCycle: "h23" });
                out.iso = [T.parseDate("2026-9-5"), T.parseDate("05.09.2026"), T.parseDate("")];
                sac.regional.set({ date: "dmy." });
                out.dmy = [T.parseDate("5.9.26"), T.parseDate("05 . 09 . 2026"), T.parseDate("31.02.2026"), T.formatDate("2026-09-05")];
                sac.regional.set({ date: "mdy/", hourCycle: "h12" });
                out.mdy = [T.parseDate("9/5/2026"), T.formatDate("2026-09-05"), T.formatTime("14:30"), T.formatTime("00:05")];
                out.time = [T.parseTime("2 PM"), T.parseTime("14.30"), T.parseTime("9:5"), T.parseTime("14:30:15"), T.parseTime("14"), T.parseTime("")];
                out.dt = [T.parseDateTime("9/25/2026 2:30 PM"), T.parseDateTime("9/25/2026"), T.parseDateTime("2026-09-25T14:30"), T.parseDateTime("9/25/2026 25:00")];
                sac.regional.set({ date: "dmy.", hourCycle: "h23" });
                out.dt2 = [T.parseDateTime("25. 9. 2026 14:30"), T.formatDateTime("2026-09-25T14:30")];
            } finally {
                sac.regional.set({ date: "iso", hourCycle: "h23" });
            }
            return out;
        })()`);
        eq(r.iso, ["2026-09-05", null, ""], "iso: ISO only");
        eq(r.dmy, ["2026-09-05", "2026-09-05", null, "05.09.2026"], "day first; no 31 February");
        eq(r.mdy, ["2026-09-05", "09/05/2026", "02:30 PM", "12:05 AM"], "month first; 12-hour clock");
        eq(r.time, ["14:00", "14:30", "09:05", "14:30", null, ""], "both cycles; a bare hour is not a time");
        eq(r.dt, ["2026-09-25T14:30", "2026-09-25T00:00", "2026-09-25T14:30", null], "datetimes");
        eq(r.dt2, ["2026-09-25T14:30", "25.09.2026 14:30"], "spaces inside the date");
    });
};
