/**
 * SACRVM APPKIT — global namespace.
 * Load FIRST (classic deferred script). Populated incrementally by the other
 * lib scripts: icons.js, router.js, scope.js, dialog.js, pan-zoom.js,
 * apps.js, hotkeys.js, color.js, fs.js, identity.js, files.js.
 *
 * Consumers (and mods) use window.sac to interact with the system without
 * rebuilding a component (e.g. sac.icons.register, sac.router.navigate).
 */
(function () {
    if (window.sac) return; // idempotent

    // Per-language string tables: { de: { "window.close": "Schließen" } }.
    const TABLES = Object.create(null);
    window.sac = {
        router:   null, // populated by router.js
        icons:    null, // populated by icons.js
        scope:    null, // populated by scope.js (optional)
        dialog:   null, // populated by dialog.js
        toast:    null, // installed by sac-toast.js
        hotkeys:  null, // populated by hotkeys.js
        color:    null, // populated by color.js (shared color math)
        fs:       null, // populated by fs.js (per-app storage behind context.fs)
        identity: null, // populated by identity.js (who is at this desktop)
        files:    null, // populated by files.js (the user's files — open / save)
        apps:     null, // populated by apps.js (app registry, windows, deep links)
        commands: null, // installed by sac-command-palette.js (app command registry)
        palette:  null, // installed by sac-command-palette.js (the connected instance)

        /**
         * i18n — every UI string the kit (and any app) shows, per language.
         *
         *   sac.t(key, fallback)          the string in the CURRENT language;
         *                                 the inline English fallback when no
         *                                 table has the key — zero setup.
         *   sac.i18n.add(lang, table)     merge a flat { key: string } table
         *                                 for one language. The kit ships
         *                                 kit/js/i18n/de.js; an app adds its
         *                                 own keys (namespaced: "atelier.save")
         *                                 for every language it speaks.
         *
         * Legacy: a flat key table assigned straight onto sac.i18n
         * (Object.assign(sac.i18n, {…})) is still honoured, for every
         * language, after the current language's table.
         * Key list: style guide → Helpers → sac.lang / sac.t.
         */
        i18n: Object.create(null),
        t(key, fallback) {
            const lang = this.lang ? this.lang.get() : "en";
            const table = TABLES[lang];
            if (table && table[key] !== undefined) return table[key];
            const v = this.i18n[key];
            return v === undefined ? fallback : v;
        },

        /**
         * lang — ONE language for the whole page, switchable at runtime,
         * owned by the host exactly like the theme. Apps read it
         * (context.lang) and re-render on change; kit components do that
         * themselves.
         *
         *   get()          the current code ("en", "de", …)
         *   mode()         "auto" (follows the system) or the chosen code
         *   set(code)      "auto" or a code; persisted (localStorage
         *                  "sac-lang"), mirrored onto <html lang>, announced
         *   onChange(cb)   cb(code) on every change, incl. other tabs;
         *                  returns an unsubscribe
         *   available()    codes that have a table, "en" first
         *   name(code)     the language's own name ("Deutsch") via Intl
         *   locale()       a full locale for Intl date / number output: the
         *                  browser's own entry for this language when it has
         *                  one ("de-AT"), else the code
         *
         * Default ("auto"): the system language as far as a page can see it.
         * No web API exposes the OS language, so this is the first entry of
         * navigator.languages the kit has a table for — else English.
         *
         * Event: sac:lang on document, detail { lang }.
         */
        lang: null,
        /* Event naming — one convention across every component:
         *
         *   • Every custom event is `sac:`-prefixed. The event name never
         *     repeats the component name (the event's `target` already says
         *     which element fired) — so it is `sac:change`, not
         *     `sac:color-change`; `sac:resize`, not `sac:split-change`.
         *
         *   • A DATA-VALUE control (toggle, slider, stepper, segmented-control,
         *     color-picker/-field, calendar, date-field, chip-input, swatch-grid,
         *     theme-toggle) fires `sac:change` on user commit — plus `sac:input`
         *     for live/intermediate updates (slider). detail ALWAYS carries
         *     `value` (it may carry more, e.g. swatch-grid adds `swatch`).
         *     These mirror native change/input: they BUBBLE but are NOT
         *     composed (they stay inside the consumer's tree), and a
         *     PROGRAMMATIC `.value`/`.checked`/`.theme` set fires nothing —
         *     only real interaction does.
         *
         *   • An ACTION / lifecycle / UI-state event keeps a descriptive verb
         *     (`sac:select`, `sac:copy`, `sac:open`, `sac:close`, `sac:minimize`,
         *     `sac:remove`, `sac:toggle`, `sac:resize`, `sac:files`, …) and
         *     bubbles + composed, so suite-level coordination (command palette,
         *     toasts, host injection) can hear it across shadow boundaries.
         */

        /* There is deliberately NO toolbar or sidebar projection here. An
         * app is complete: it draws its own chrome — toolbar (the .toolbar
         * recipe) and rail (<sac-sidebar> with the `items` property) — in
         * its own markup. A host injects context INTO the app
         * (context.host: jump-home, suite navigation, toolbar controls —
         * the way identity already works); it never offers the app a hull to
         * project fragments into. Actions the command palette should reach
         * are registered on sac.commands. */
    };

    /* ------------------------------------------------------ language -- */

    const KEY = "sac-lang";
    const listeners = new Set();
    const norm = (code) => String(code || "").trim().toLowerCase().split(/[-_]/)[0];

    Object.defineProperty(window.sac.i18n, "add", {
        enumerable: false,
        value(lang, table) {
            const code = norm(lang);
            if (!code || !table || typeof table !== "object") return;
            TABLES[code] = Object.assign(TABLES[code] || Object.create(null), table);
            // A new table can change what "auto" resolves to (a German
            // system, the German table just arrived): follow it. Strings in
            // an already-current language are picked up by whoever renders
            // next — announce() fires only on a real language change.
            if (typeof announce === "function") announce();
        },
    });

    // The explicit choice: localStorage, with an in-memory copy for when
    // storage refuses (private mode) — the switch still holds for this page.
    let chosen;
    function choice() {
        if (chosen !== undefined) return chosen;
        try { chosen = norm(localStorage.getItem(KEY)); } catch (err) { chosen = ""; }
        return chosen;
    }

    /** The system language, as far as the browser tells a page. */
    function detect() {
        const prefs = (navigator.languages && navigator.languages.length)
            ? navigator.languages : [navigator.language || "en"];
        for (const p of prefs) {
            const code = norm(p);
            if (code === "en" || TABLES[code]) return code;
        }
        return "en";
    }

    const current = () => choice() || detect();

    let last = null;
    function announce() {
        const now = current();
        document.documentElement.lang = now;
        if (now === last) return;
        last = now;
        for (const cb of listeners) {
            try { cb(now); }
            catch (err) { console.error("[sac.lang] a listener threw:", err); }
        }
        document.dispatchEvent(new CustomEvent("sac:lang", { detail: { lang: now }, bubbles: true }));
    }

    window.sac.lang = {
        get: current,
        mode() { return choice() || "auto"; },
        set(code) {
            chosen = code === "auto" ? "" : norm(code);
            try {
                if (chosen) localStorage.setItem(KEY, chosen);
                else localStorage.removeItem(KEY);
            } catch (err) { /* the in-memory choice still applies */ }
            announce();
        },
        onChange(cb) {
            if (typeof cb !== "function") return () => {};
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        available() {
            return ["en", ...Object.keys(TABLES).filter((c) => c !== "en").sort()];
        },
        name(code) {
            const c = norm(code);
            try {
                const n = new Intl.DisplayNames([c], { type: "language" }).of(c);
                return n ? n.charAt(0).toLocaleUpperCase(c) + n.slice(1) : c.toUpperCase();
            } catch (err) { return c.toUpperCase(); }
        },
        locale() {
            const c = current();
            const prefs = navigator.languages || [navigator.language || ""];
            return prefs.find((p) => norm(p) === c) || c;
        },
    };

    // Another tab switched: follow it.
    window.addEventListener("storage", (e) => {
        if (e.key !== KEY) return;
        chosen = undefined;
        announce();
    });
    last = current();
    document.documentElement.lang = last;

    /* ----------------------------------------------------- regional -- */

    /**
     * regional — the page-wide date, time and number FORMAT, separate from the
     * language: an English UI with German dates is a normal wish. No web API
     * exposes the OS regional format (anti-fingerprinting — Intl follows the
     * browser's UI language), so this is an explicit app / host setting.
     * Fields without their own `format` / `hour-cycle` attribute follow it,
     * and so does every <sac-number-field>.
     * Not persisted by the kit: the app (or the host) owns the user setting
     * and calls set() on load.
     *
     *   get()          { date, hourCycle, number } — date: "iso" | "dmy." |
     *                  "dmy/" | "mdy/"; hourCycle: "h23" | "h12"; number:
     *                  "1,234.5" | "1.234,5" | "1 234,5" | "1'234.5" (the
     *                  identifier IS the pattern: group, then decimal
     *                  separator). Default iso / h23 / "1,234.5".
     *   set(partial)   merge, e.g. set({ date: "dmy.", number: "1.234,5" });
     *                  unknown values are ignored
     *   onChange(cb)   cb({ date, hourCycle, number }); returns an unsubscribe
     *   separators()   { decimal, group } of the current number format (the
     *                  "1 234,5" group is a no-break space, U+00A0)
     *   formatNumber(n, opts)  n → text in the current number format. opts:
     *                  decimals (exact fraction digits), minFractionDigits,
     *                  maxFractionDigits (default 0 / 20 = as many as the
     *                  number needs), group (default true). Not finite → "".
     *   parseNumber(text)  text → number, NaN for empty text or garbage.
     *                  Tolerant: either separator is understood (see below).
     *
     * Event: sac:regional on document, detail { date, hourCycle, number }.
     */
    const DATE_FORMATS = ["iso", "dmy.", "dmy/", "mdy/"];
    const HOUR_CYCLES = ["h23", "h12"];
    const NUMBER_FORMATS = {
        "1,234.5": { decimal: ".", group: "," },
        "1.234,5": { decimal: ",", group: "." },
        "1 234,5": { decimal: ",", group: " " },
        "1'234.5": { decimal: ".", group: "'" },
    };
    const regional = { date: "iso", hourCycle: "h23", number: "1,234.5" };
    const regionalListeners = new Set();

    /**
     * Tolerant number parse. Spaces (any kind) and apostrophes are always
     * grouping. Of "." and ",": both present → the LAST one is the decimal
     * separator; one of them repeated → grouping; a single one → the
     * format's decimal separator is decimal, the format's group separator is
     * grouping only in a real thousands position ("1,234" under "1,234.5"),
     * anything else is read as a decimal ("1,5" → 1.5 whatever the format).
     * Grouping must sit in thousands positions, or the text is garbage (NaN).
     */
    function parseNumber(text, fmt) {
        let s = String(text == null ? "" : text).trim().replace(/−/g, "-");
        let sign = "";
        if (s[0] === "-" || s[0] === "+") { sign = s[0] === "-" ? "-" : ""; s = s.slice(1).trim(); }
        if (!/^[\d.,\s'’]+$/.test(s) || !/\d/.test(s)) return NaN;
        const sep = NUMBER_FORMATS[fmt] || NUMBER_FORMATS["1,234.5"];
        const dots = s.split(".").length - 1;
        const commas = s.split(",").length - 1;
        const soft = /[\s'’]/.test(s);                // space / apostrophe grouping
        let decimal = "", group = "";
        if (soft) {
            if (dots + commas > 1) return NaN;             // then "." or "," can only be the decimal
            decimal = dots ? "." : commas ? "," : "";
            group = "soft";
        } else if (dots && commas) {
            decimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
            group = decimal === "." ? "," : ".";
        } else if (dots + commas > 1) {
            group = dots ? "." : ",";                      // "1.234.567"
        } else if (dots + commas === 1) {
            const c = dots ? "." : ",";
            if (c !== sep.decimal && c === sep.group && /^\d{1,3}[.,]\d{3}$/.test(s)) group = c;
            else decimal = c;
        }
        const [intPart, frac = "", extra] = decimal ? s.split(decimal) : [s];
        if (extra !== undefined || !/^\d*$/.test(frac)) return NaN;
        const groups = group ? intPart.split(group === "soft" ? /[\s'’]/ : group) : [intPart];
        if (groups.length > 1 && !groups.every((g, i) => (i === 0 ? /^\d{1,3}$/ : /^\d{3}$/).test(g))) return NaN;
        const digits = groups.join("");
        if (!/^\d*$/.test(digits) || (!digits && !frac)) return NaN;
        return Number(`${sign}${digits || "0"}.${frac || "0"}`);
    }

    /** Intl does the digits (shortest round-trip, correct rounding); the
     *  current format's separators are swapped in afterwards. */
    function formatNumber(n, opts, fmt) {
        const num = typeof n === "string" ? Number(n) : n;
        if (typeof num !== "number" || !Number.isFinite(num)) return "";
        const o = opts || {};
        const clamp = (v, d) => {
            const i = Math.round(Number(v));
            return Number.isFinite(i) ? Math.max(0, Math.min(20, i)) : d;
        };
        let min = clamp(o.minFractionDigits, 0);
        let max = clamp(o.maxFractionDigits, 20);
        if (o.decimals != null && o.decimals !== "") min = max = clamp(o.decimals, 0);
        if (max < min) max = min;
        const text = new Intl.NumberFormat("en-US", {
            minimumFractionDigits: min,
            maximumFractionDigits: max,
            useGrouping: o.group !== false,
        }).format(num);
        const sep = NUMBER_FORMATS[fmt] || NUMBER_FORMATS["1,234.5"];
        return text.replace(/[.,]/g, (c) => (c === "." ? sep.decimal : sep.group));
    }

    window.sac.regional = {
        get() { return { date: regional.date, hourCycle: regional.hourCycle, number: regional.number }; },
        set(partial) {
            const p = partial || {};
            const date = DATE_FORMATS.includes(p.date) ? p.date : regional.date;
            const hourCycle = HOUR_CYCLES.includes(p.hourCycle) ? p.hourCycle : regional.hourCycle;
            const number = Object.prototype.hasOwnProperty.call(NUMBER_FORMATS, p.number) ? p.number : regional.number;
            if (date === regional.date && hourCycle === regional.hourCycle && number === regional.number) return;
            regional.date = date;
            regional.hourCycle = hourCycle;
            regional.number = number;
            const now = this.get();
            for (const cb of regionalListeners) {
                try { cb(now); }
                catch (err) { console.error("[sac.regional] a listener threw:", err); }
            }
            document.dispatchEvent(new CustomEvent("sac:regional", { detail: now, bubbles: true }));
        },
        onChange(cb) {
            if (typeof cb !== "function") return () => {};
            regionalListeners.add(cb);
            return () => regionalListeners.delete(cb);
        },
        separators() {
            const sep = NUMBER_FORMATS[regional.number];
            return { decimal: sep.decimal, group: sep.group };
        },
        formatNumber(n, opts) { return formatNumber(n, opts, regional.number); },
        parseNumber(text) { return parseNumber(text, regional.number); },
    };
})();
