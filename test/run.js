#!/usr/bin/env node
/**
 * sac-data-grid — headless-Chrome tests. No dependencies, no build.
 *
 *   node test/run.js            run everything
 *   node test/run.js sort       only tests whose name contains "sort"
 *
 * Serves the repository on a random local port, starts Chrome / Chromium
 * with remote debugging, drives test/fixture.html over the DevTools
 * protocol (real key and mouse input) and prints one line per test.
 * CHROME=/path/to/chrome picks the browser; SHOTS=dir saves screenshots.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const FILTER = process.argv[2] || "";
const SHOTS = process.env.SHOTS || "";
const debug = (...a) => { if (process.env.DEBUG) console.error("[debug]", ...a); };

/* ---------------------------------------------------------------- server -- */

const MIME = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".woff2": "font/woff2", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
};

function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
            if (p.endsWith("/")) p += "index.html";
            const file = path.join(ROOT, p);
            if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
            fs.readFile(file, (err, buf) => {
                if (err) { res.writeHead(404); res.end(); return; }
                res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
                res.end(buf);
            });
        });
        srv.listen(0, "127.0.0.1", () => resolve(srv));
    });
}

/* --------------------------------------------------------------- browser -- */

function findChrome() {
    const list = [process.env.CHROME, "/opt/pw-browsers/chromium", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
    for (const c of list) {
        if (c.includes("/") ? fs.existsSync(c) : (() => { try { execFileSync("which", [c], { stdio: "ignore" }); return true; } catch (e) { return false; } })()) return c;
    }
    throw new Error("No Chrome found — set CHROME=/path/to/chrome");
}

function launch() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sac-data-grid-"));
    const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "--no-first-run",
        "--no-default-browser-check", "--disable-gpu", "--window-size=1280,900", "--lang=en-US", "about:blank"];
    if (process.getuid && process.getuid() === 0) args.unshift("--no-sandbox");
    const proc = spawn(findChrome(), args, { stdio: ["ignore", "ignore", "pipe"] });
    return new Promise((resolve, reject) => {
        let buf = "";
        const timer = setTimeout(() => reject(new Error("Chrome did not start:\n" + buf)), 30000);
        proc.stderr.on("data", (d) => {
            buf += d;
            const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
            if (m) { clearTimeout(timer); resolve({ proc, ws: m[1], dir }); }
        });
        proc.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Chrome exited (${code}):\n${buf}`)); });
    });
}

class CDP {
    constructor(url) {
        this.id = 0;
        this.pending = new Map();
        this.listeners = new Set();
        this.ws = new WebSocket(url);
        this.open = new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });
        this.ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
            } else if (msg.method) {
                for (const fn of this.listeners) fn(msg);
            }
        };
    }
    send(method, params, sessionId) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
        return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    }
}

const KEYS = {
    ArrowUp: [38, "ArrowUp"], ArrowDown: [40, "ArrowDown"], ArrowLeft: [37, "ArrowLeft"], ArrowRight: [39, "ArrowRight"],
    Home: [36, "Home"], End: [35, "End"], PageUp: [33, "PageUp"], PageDown: [34, "PageDown"], Tab: [9, "Tab"],
    Enter: [13, "Enter"], Escape: [27, "Escape"], Backspace: [8, "Backspace"], Delete: [46, "Delete"],
    F2: [113, "F2"], F10: [121, "F10"], " ": [32, "Space"], ContextMenu: [93, "ContextMenu"],
};
const MODS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };

class Page {
    constructor(cdp, sessionId, base) {
        this.cdp = cdp;
        this.sid = sessionId;
        this.base = base;
        this.console = [];
    }
    send(method, params) { return this.cdp.send(method, params, this.sid); }

    async load(url) {
        this.console = [];
        const loaded = new Promise((resolve) => {
            const fn = (msg) => {
                if (msg.sessionId === this.sid && msg.method === "Page.loadEventFired") { this.cdp.listeners.delete(fn); resolve(); }
            };
            this.cdp.listeners.add(fn);
        });
        await this.send("Page.navigate", { url: this.base + url });
        await loaded;
        await this.eval("window.fx ? fx.ready() : true");
    }

    async eval(expr) {
        const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
        if (r.exceptionDetails) {
            const d = r.exceptionDetails;
            throw new Error("page: " + ((d.exception && d.exception.description) || d.text));
        }
        return r.result.value;
    }

    /** Press a key. key: "ArrowDown", "a", "Enter" …; mods: ["Shift", "Control"]. */
    async key(key, mods, extra) {
        const modifiers = (mods || []).reduce((m, k) => m | MODS[k], 0);
        let code, vk, text;
        if (KEYS[key]) { [vk, code] = KEYS[key]; if (key === " ") text = " "; if (key === "Enter") text = "\r"; }
        else if (key.length === 1) {
            const up = key.toUpperCase();
            vk = up.charCodeAt(0);
            code = /[a-z]/i.test(key) ? "Key" + up : (/\d/.test(key) ? "Digit" + key : "");
            text = key;
        } else throw new Error("unknown key " + key);
        if (modifiers & (MODS.Control | MODS.Meta | MODS.Alt)) text = undefined;
        const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
        await this.send("Input.dispatchKeyEvent", Object.assign({ type: text ? "keyDown" : "rawKeyDown", text, unmodifiedText: text }, base, extra || {}));
        await this.send("Input.dispatchKeyEvent", Object.assign({ type: "keyUp" }, base));
    }

    async type(text) {
        for (const ch of text) await this.key(ch);
    }

    async mouse(type, x, y, opts) {
        const o = opts || {};
        await this.send("Input.dispatchMouseEvent", {
            type, x, y, button: o.button || "left", buttons: o.buttons != null ? o.buttons : (type === "mouseReleased" ? 0 : 1),
            clickCount: o.clickCount || 1, modifiers: (o.mods || []).reduce((m, k) => m | MODS[k], 0),
        });
    }

    async click(x, y, opts) {
        const o = opts || {};
        await this.mouse("mouseMoved", x, y, { buttons: 0, mods: o.mods });
        for (let i = 1; i <= (o.count || 1); i++) {
            await this.mouse("mousePressed", x, y, { clickCount: i, mods: o.mods, button: o.button });
            await this.mouse("mouseReleased", x, y, { clickCount: i, mods: o.mods, button: o.button });
        }
    }

    async drag(x1, y1, x2, y2, steps) {
        await this.mouse("mouseMoved", x1, y1, { buttons: 0 });
        await this.mouse("mousePressed", x1, y1);
        const n = steps || 8;
        for (let i = 1; i <= n; i++) {
            await this.mouse("mouseMoved", x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n);
        }
        await this.mouse("mouseReleased", x2, y2);
    }

    async frames(n) { await this.eval(`(async () => { for (let i = 0; i < ${n || 2}; i++) await fx.frame(); })()`); }

    async shot(name) {
        if (!SHOTS) return;
        fs.mkdirSync(SHOTS, { recursive: true });
        const r = await this.send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(SHOTS, name + ".png"), Buffer.from(r.data, "base64"));
    }
}

/* ----------------------------------------------------------------- tests -- */

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function eq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error(`${msg || "expected equal"}: got ${sa}, want ${sb}`);
}
function ok(v, msg) { if (!v) throw new Error(msg || "expected truthy"); }

async function center(p, expr) { return p.eval(`fx.center(${expr})`); }

require(process.env.TESTS ? path.resolve(process.env.TESTS) : "./tests.js")({ test, eq, ok, center });

/* ------------------------------------------------------------------- run -- */

(async () => {
    const srv = await serve();
    debug("serving", srv.address().port);
    const base = `http://127.0.0.1:${srv.address().port}`;
    const chrome = await launch();
    debug("chrome", chrome.ws);
    const cdp = new CDP(chrome.ws);
    await cdp.open;
    debug("cdp open");
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    // One tab only: a background tab gets no animation frames, and the grid
    // renders in them.
    const { targetInfos } = await cdp.send("Target.getTargets");
    for (const ti of targetInfos) {
        if (ti.type === "page" && ti.targetId !== targetId) await cdp.send("Target.closeTarget", { targetId: ti.targetId }).catch(() => {});
    }
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new Page(cdp, sessionId, base);
    debug("attached", sessionId);
    await page.send("Page.bringToFront");
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Browser.grantPermissions", { origin: base, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }).catch(() => {});
    cdp.listeners.add((msg) => {
        if (msg.sessionId !== sessionId) return;
        if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
            page.console.push(msg.params.args.map((a) => a.value !== undefined ? a.value : a.description).join(" "));
        }
        if (msg.method === "Runtime.exceptionThrown") {
            const d = msg.params.exceptionDetails;
            page.console.push("exception: " + ((d.exception && d.exception.description) || d.text));
        }
    });

    let pass = 0, fail = 0;
    const started = Date.now();
    for (const tc of tests) {
        if (FILTER && !tc.name.includes(FILTER)) continue;
        const t0 = Date.now();
        debug("test", tc.name);
        try {
            let timer;
            await Promise.race([
                tc.fn(page),
                new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error("timed out after 30 s")), 30000); }),
            ]).finally(() => clearTimeout(timer));
            const errs = page.console.filter((m) => !/favicon/.test(m));
            if (errs.length) throw new Error("console: " + errs.join(" | "));
            pass++;
            console.log(`  ok   ${tc.name} (${Date.now() - t0} ms)`);
        } catch (err) {
            fail++;
            console.log(`  FAIL ${tc.name}\n       ${String(err && err.message || err).split("\n").join("\n       ")}`);
            await page.shot("fail-" + tc.name.replace(/\W+/g, "-")).catch(() => {});
        }
    }
    console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    try { cdp.ws.close(); } catch (e) { /* closing anyway */ }
    chrome.proc.kill("SIGKILL");
    srv.close();
    try { fs.rmSync(chrome.dir, { recursive: true, force: true }); } catch (e) { /* temp dir */ }
    process.exit(fail ? 1 : 0);
})().catch((err) => {
    console.error(err);
    process.exit(2);
});
