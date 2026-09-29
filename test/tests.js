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
        eq(await p.eval("fx.cellEl(1, 1).title"), "Required");
        eq(await p.eval("fx.cellEl(1, 1).getAttribute('aria-invalid')"), "true");
        await p.key("ArrowDown");
        await settle(p);
        eq(await saves(p), [], "not sent");
        ok((await p.eval("fx.status()")).includes("1 row with errors"), "status");
        await p.eval("fx.grid.focusCell(5, 'n')");
        await p.type("-5");
        await p.key("Enter");
        await settle(p);
        eq(await p.eval("fx.cellEl(4, 2).title"), "negative", "validate()");
        await p.key("z", ["Control"]);
        await p.key("z", ["Control"]);
        await settle(p);
        eq(await p.eval("[fx.cellEl(1, 1).classList.contains('invalid'), fx.grid.dirty]"), [false, 0], "undo clears it");
    });

    test("save errors from the source keep cells dirty and marked", async (p) => {
        await p.load("/test/fixture.html?rows=20&save-error=1");
        await p.eval("fx.focusGrid(); fx.grid.focusCell(1, 'w2')");
        await p.type("oops");
        await p.key("Enter");
        await settle(p);
        eq((await saves(p)).length, 1, "sent");
        eq(await p.eval("fx.cellEl(0, 12).title"), "Server says no");
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
        await p.eval("sac.regional.set({ number: '1.234,5' })");
        await p.eval("fx.grid.focusCell(1, 'n')");
        await p.eval(`fx.pasteText("1.234,5\\t2026-03-04\\r\\nabc\\t04.05.2026\\r\\n")`);
        await settle(p);
        eq(await p.eval("[0, 1].map(i => [fx.grid._get(fx.data[i], fx.grid._cols[2]), fx.grid._get(fx.data[i], fx.grid._cols[3])])"),
            [[1234.5, "2026-03-04"], [3.7, "2026-05-04"]], "parsed per type; the bad number not applied");
        ok(await p.eval("fx.cellEl(1, 2).classList.contains('invalid')"), "bad cell marked");
        ok((await p.eval("fx.cellEl(1, 2).title")).includes("abc"), "with the rejected text");
        await p.eval("sac.regional.set({ number: '1,234.5' })");
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
        const hosts = [];
        for (let i = 0; i < 10; i++) {
            await p.key("Tab");
            hosts.push(await p.eval("document.activeElement.localName"));
        }
        await p.key("Escape");
        eq(hosts, ["sac-number-field", "sac-date-field", "sac-time-field", "sac-date-field", "sac-time-field",
            "input", "sac-select", "sac-chip-input", "sac-color-field", "textarea"]);
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
        eq(await p.eval("document.activeElement.dataset.action"), "sort-desc", "arrows move through the items");
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
        eq(await p.eval("[!!document.querySelector('sac-dialog'), !!document.querySelector('sac-menu')]"), [false, false]);
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
};
