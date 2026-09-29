/**
 * The demo page: a 100k-row array source, a paged "server" source with
 * latency, every column type, frozen columns, footer totals, light / dark,
 * EN / DE, and the grid's modes and options as switches.
 *
 * URL options: ?fail=N makes every Nth server load fail (to see the retry
 * row), ?rows=N changes the array source's size.
 */
(function () {
    const t = (key, fallback) => (window.sac && sac.t) ? sac.t(key, fallback) : fallback;
    const params = new URLSearchParams(location.search);

    sac.i18n.add("de", {
        "demo.source-array": "100k Zeilen",
        "demo.source-server": "Server",
        "demo.mode-read": "Lesen",
        "demo.mode-sheet": "Tabelle",
        "demo.mode-form": "Formular",
        "demo.save-cell": "Speichern je Zelle",
        "demo.save-row": "je Zeile",
        "demo.save-batch": "gesammelt",
        "demo.paging-scroll": "Scrollen",
        "demo.paging-pages": "Seiten",
        "demo.lines-quiet": "Ruhig",
        "demo.lines-grid": "Gitterlinien",
        "demo.regional": "Regionales Format",
        "demo.grid": "Bestellungen",
        "demo.col.id": "Nr.",
        "demo.col.customer": "Kunde",
        "demo.col.city": "Ort",
        "demo.col.status": "Status",
        "demo.col.tags": "Merkmale",
        "demo.col.amount": "Betrag",
        "demo.col.qty": "Menge",
        "demo.col.total": "Gesamt",
        "demo.col.due": "Fällig",
        "demo.col.slot": "Zeitfenster",
        "demo.col.updated": "Geändert",
        "demo.col.paid": "Bezahlt",
        "demo.col.color": "Farbe",
        "demo.col.notes": "Notizen",
        "demo.status.new": "Neu",
        "demo.status.open": "Offen",
        "demo.status.shipped": "Versandt",
        "demo.status.closed": "Abgeschlossen",
        "demo.status.cancelled": "Storniert",
        "demo.tag.urgent": "Dringend",
        "demo.tag.vip": "VIP",
        "demo.tag.gift": "Geschenk",
        "demo.tag.fragile": "Zerbrechlich",
        "demo.tag.export": "Export",
        "demo.tag.b2b": "B2B",
        "demo.amount-negative": "Der Betrag darf nicht negativ sein.",
        "demo.hint": "Pfeiltasten bewegen · Umschalt erweitert · Strg+A alles · Enter oder Tippen bearbeitet · Strg+C / Strg+V · Strg+Z rückgängig · Umschalt+Enter öffnet den Datensatz",
    });

    /* ------------------------------------------------------------- data -- */

    function rng(seed) {
        return function () {
            seed = (seed + 0x6D2B79F5) | 0;
            let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
    }
    const pad = (n) => String(n).padStart(2, "0");
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const FIRST = ["Anna", "Ben", "Clara", "David", "Emma", "Felix", "Greta", "Hannes", "Ida", "Jonas", "Katrin", "Lukas",
        "Mia", "Noah", "Olivia", "Paul", "Quentin", "Rosa", "Sven", "Tara", "Uwe", "Vera", "Wim", "Yara", "Zoe"];
    const LAST = ["Meier", "Schmidt", "Keller", "Weber", "Fischer", "Wagner", "Becker", "Hoffmann", "Schulz", "Koch",
        "Richter", "Klein", "Wolf", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hartmann", "Lange"];
    const CITIES = ["Berlin", "Hamburg", "München", "Köln", "Frankfurt", "Stuttgart", "Düsseldorf", "Leipzig", "Dortmund",
        "Bremen", "Dresden", "Hannover", "Nürnberg", "Wien", "Graz", "Zürich", "Basel", "Bern", "Linz", "Salzburg"];
    const STATUS = [["new", "New"], ["open", "Open"], ["shipped", "Shipped"], ["closed", "Closed"], ["cancelled", "Cancelled"]];
    const TAGS = [["urgent", "Urgent", "red"], ["vip", "VIP", "purple"], ["gift", "Gift", "pink"],
        ["fragile", "Fragile", "orange"], ["export", "Export", "blue"], ["b2b", "B2B", "teal"]];
    const COLORS = ["#3b82f6", "#f97316", "#ef4444", "#10b981", "#8b5cf6", "#ec4899", "#eab308", "#14b8a6"];
    const NOTES = ["", "", "", "Leave at the door", "Call before delivery\nGate code 4711", "Invoice to head office", "Fragile — handle with care"];

    function makeRows(n, seed) {
        const r = rng(seed);
        const pick = (a) => a[Math.floor(r() * a.length)];
        const rows = new Array(n);
        for (let i = 0; i < n; i++) {
            const due = new Date(2026, 0, 1 + Math.floor(r() * 365));
            const upd = new Date(2026, 0, 1 + Math.floor(r() * 270), Math.floor(r() * 24), Math.floor(r() * 60));
            rows[i] = {
                id: i + 1,
                customer: `${pick(FIRST)} ${pick(LAST)}`,
                city: pick(CITIES),
                status: pick(STATUS)[0],
                tags: TAGS.filter(() => r() < 0.16).map((x) => x[0]),
                amount: Math.round(r() * 250000) / 100,
                qty: 1 + Math.floor(r() * 20),
                due: iso(due),
                slot: `${pad(8 + Math.floor(r() * 10))}:${pad(Math.floor(r() * 4) * 15)}`,
                updated: `${iso(upd)}T${pad(upd.getHours())}:${pad(upd.getMinutes())}`,
                paid: r() < 0.6,
                color: pick(COLORS),
                notes: pick(NOTES),
            };
        }
        return rows;
    }

    /** Status sorts by what it shows ("Abgeschlossen" before "Neu" in German),
     *  not by its stored value. */
    const byStatusLabel = (() => {
        let lang = null, rank = null;
        return (a, b) => {
            if (lang !== sac.lang.get()) {
                lang = sac.lang.get();
                const coll = new Intl.Collator(sac.lang.locale());
                const labels = STATUS.map(([v, en]) => [v, t(`demo.status.${v}`, en)]).sort((x, y) => coll.compare(x[1], y[1]));
                rank = new Map(labels.map(([v], i) => [v, i]));
            }
            return (rank.get(a) ?? 99) - (rank.get(b) ?? 99);
        };
    })();
    const compare = { status: byStatusLabel };

    /** A paged "server": latency, no total (incremental loading), optional
     *  failures — backed by an array source. */
    function serverSource(rows) {
        const inner = SacDataGrid.arraySource(rows, { key: "id", compare });
        const failEvery = parseInt(params.get("fail"), 10) || 0;
        let calls = 0;
        const wait = (ms, signal) => new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, ms);
            if (signal) {
                signal.addEventListener("abort", () => {
                    clearTimeout(timer);
                    reject(new DOMException("Aborted", "AbortError"));
                }, { once: true });
            }
        });
        return {
            key: "id",
            async load(q) {
                await wait(250 + Math.random() * 450, q.signal);
                if (failEvery && ++calls % failEvery === 0) throw new Error("Simulated network error");
                const res = await inner.load(Object.assign({}, q, { aggregate: null }));
                return { rows: res.rows };
            },
            async save(changes) { await wait(300 + Math.random() * 300); return inner.save(changes); },
            async create(row) { await wait(200); return inner.create(row); },
            async remove(ids) { await wait(200); return inner.remove(ids); },
        };
    }

    /* ---------------------------------------------------------- columns -- */

    const money = (n) => Number.isFinite(n) ? sac.regional.formatNumber(n, { decimals: 2 }) : "";

    const columns = [
        { field: "id", label: "No.", labelKey: "demo.col.id", type: "readonly", width: 80, align: "right", frozen: true },
        { field: "customer", label: "Customer", labelKey: "demo.col.customer", type: "text", width: 170, frozen: true, required: true },
        { field: "city", label: "City", labelKey: "demo.col.city", type: "text", width: 130 },
        {
            field: "status", label: "Status", labelKey: "demo.col.status", type: "select", width: 140,
            options: STATUS.map(([value, label]) => ({ value, label, labelKey: `demo.status.${value}` })),
        },
        {
            field: "tags", label: "Tags", labelKey: "demo.col.tags", type: "tags", width: 210,
            options: TAGS.map(([value, label, color]) => ({ value, label, labelKey: `demo.tag.${value}`, color })),
        },
        {
            field: "amount", label: "Amount", labelKey: "demo.col.amount", type: "number", width: 170,
            decimals: 2, min: 0, aggregate: "sum",
            validate: (v) => (v != null && v < 0 ? t("demo.amount-negative", "The amount can't be negative.") : null),
        },
        { field: "qty", label: "Qty", labelKey: "demo.col.qty", type: "number", width: 90, decimals: 0, min: 0, aggregate: "avg" },
        {
            field: "total", label: "Total", labelKey: "demo.col.total", type: "readonly", width: 130, align: "right",
            format: (v, row) => (row ? money(row.amount * row.qty) : ""),
        },
        { field: "due", label: "Due", labelKey: "demo.col.due", type: "date", aggregate: "min" },
        { field: "slot", label: "Slot", labelKey: "demo.col.slot", type: "time", step: 15 },
        { field: "updated", label: "Updated", labelKey: "demo.col.updated", type: "datetime", aggregate: "max" },
        { field: "paid", label: "Paid", labelKey: "demo.col.paid", type: "bool" },
        { field: "color", label: "Color", labelKey: "demo.col.color", type: "color" },
        { field: "notes", label: "Notes", labelKey: "demo.col.notes", type: "longtext", width: 240 },
    ];

    /* ------------------------------------------------------------- boot -- */

    const grid = document.getElementById("grid");
    const size = Math.max(1, Math.min(1000000, parseInt(params.get("rows"), 10) || 100000));
    const sources = {
        array: SacDataGrid.arraySource(makeRows(size, 42), { key: "id", compare }),
        server: serverSource(makeRows(5000, 7)),
    };

    grid.columns = columns;
    grid.source = sources.array;
    try {
        const saved = JSON.parse(localStorage.getItem("sac-data-grid-demo-view") || "null");
        if (saved) grid.view = saved;
    } catch (err) { /* no storage */ }
    grid.addEventListener("sac:view", (e) => {
        try { localStorage.setItem("sac-data-grid-demo-view", JSON.stringify(e.detail)); } catch (err) { /* no storage */ }
    });

    const on = (id, fn) => document.getElementById(id).addEventListener("sac:change", (e) => fn(e.detail.value));
    on("source", (v) => { grid.source = sources[v]; });
    on("mode", (v) => { grid.mode = v; });
    on("save-mode", (v) => grid.setAttribute("save-mode", v));
    on("paging", (v) => grid.setAttribute("paging", v));
    on("lines", (v) => grid.setAttribute("lines", v));

    const REGIONAL = {
        iso: { date: "iso", hourCycle: "h23", number: "1,234.5" },
        us: { date: "mdy/", hourCycle: "h12", number: "1,234.5" },
        de: { date: "dmy.", hourCycle: "h23", number: "1.234,5" },
        ch: { date: "dmy.", hourCycle: "h23", number: "1'234.5" },
    };
    const regionalSelect = document.getElementById("regional");
    regionalSelect.addEventListener("change", () => sac.regional.set(REGIONAL[regionalSelect.value]));
    sac.regional.set(REGIONAL[regionalSelect.value]);

    function relabel() {
        for (const b of document.querySelectorAll("[data-key]")) {
            b.dataset.en = b.dataset.en || b.textContent;
            b.textContent = t(b.dataset.key, b.dataset.en);
        }
        regionalSelect.setAttribute("aria-label", t("demo.regional", "Regional format"));
        grid.setAttribute("label", t("demo.grid", "Orders"));
        document.getElementById("hint").textContent = t("demo.hint",
            "Arrows move · Shift extends · Ctrl+A all · Enter or typing edits · Ctrl+C / Ctrl+V · Ctrl+Z undo · Shift+Enter opens the record");
    }
    sac.lang.onChange(relabel);
    relabel();

    window.demo = { grid, sources, makeRows };
})();
