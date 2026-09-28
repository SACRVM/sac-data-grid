/**
 * The test cases, run by test/run.js against test/fixture.html.
 * Each test gets the page driver: load(url), eval(js), key(k, mods),
 * type(text), click(x, y, opts), drag(…), frames(n), shot(name).
 */
"use strict";
const fs = require("fs");
const path = require("path");

module.exports = function ({ test, eq, ok, center }) {

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
        const last = rows[rows.length - 1];
        eq(await p.eval(`fx.cell(${last}, 0)`), String(last + 1), "last rendered row shows its data");
        eq(last, 99999, "scrolled to the end");
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
        eq(await p.eval("fx.grid.shadowRoot.activeElement === fx.grid._scroller"), false, "focus moved on");
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
        const mb = await center(p, "fx.header(1)._mb");
        await p.click(mb.x, mb.y);
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
        ok(!(await p.eval("fx.header(1)._filt.hidden")), "filter indicator");
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

    /* -------------------------------------------------------------- columns -- */

    test("hide and show columns", async (p) => {
        await p.load("/test/fixture.html?rows=50");
        const mb = await center(p, "fx.header(3)._mb");
        await p.click(mb.x, mb.y);
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
};
