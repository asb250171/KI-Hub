// Prozess-Cockpit — Client. Verbindet sich per SSE mit dem Dienst (/events)
// und rendert Lagebild, Orbit-Systemkarte, Live-Feed, 24-h-Zeitleiste und die
// Workflow-Liste. Mit ?demo in der URL laufen simulierte Daten (demo.js).

const DEMO = new URLSearchParams(location.search).has("demo") || window.__COCKPIT_DEMO__ === true;
const N8N_BASE = window.__N8N_BASE__ || "https://n8n.compliancemanufaktur.online";

const SYSTEMS = ["hubspot", "n8n", "claude", "openai", "m365", "monday", "stripe", "extern"];
const SYS_NAME = { hubspot: "HubSpot", n8n: "n8n", claude: "Claude", openai: "ChatGPT / OpenAI", m365: "Microsoft 365", monday: "monday.com", stripe: "Stripe", extern: "Externe Quellen" };
const SLABEL = { success: "Erfolgreich", error: "Fehlgeschlagen", running: "Läuft", waiting: "Wartet", idle: "Bereit", inactive: "Inaktiv", unknown: "Unbekannt" };
const SORDER = { error: 0, running: 1, waiting: 2, success: 3, idle: 4, inactive: 5, unknown: 6 };
const TONE = { success: "--ok", error: "--err", running: "--run", waiting: "--warn", idle: "--idle", inactive: "--idle", unknown: "--idle" };
const SCHEMES = [
  { id: "polarnacht", name: "Polarnacht", desc: "Dunkel und kühl. Für den Leitstand und die TV-Wand.", sw: ["#0a1222", "#8aa6ff", "#35c77b", "#00a7ba"] },
  { id: "kupfer", name: "Kupfer", desc: "Warmes Dunkel mit Kupfer-Akzent. Ruhig bei langen Sitzungen.", sw: ["#140f0c", "#f2a65e", "#5cc98a", "#d3721e"] },
  { id: "porzellan", name: "Porzellan", desc: "Hell und klar. Für Büro, Beamer und Präsentationen.", sw: ["#eef1f6", "#3355e0", "#1a9455", "#0089a4"] },
];
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Icons (24er Raster, Strich) ───────────────────────────────────────────────
const I = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const IC = {
  pulse: I('<path d="M3 12h4l2.5-6 5 12 2.5-6H21"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  pause: I('<path d="M9 5v14M15 5v14"/>'),
  play: I('<path d="M7 5l12 7-12 7z"/>'),
  palette: I('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.6-9-7.6z"/><circle cx="7.5" cy="11.5" r="1.2"/><circle cx="10.5" cy="7.5" r="1.2"/><circle cx="15" cy="8" r="1.2"/>'),
  expand: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  x: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  ext: I('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  success: I('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  error: I('<path d="M12 7v6M12 17h.01"/><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z"/>'),
  running: I('<path d="M21 12a9 9 0 1 1-6.2-8.6"/>', 'class="spin"'),
  waiting: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  idle: I('<path d="M6 12h12"/>'),
  inactive: I('<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>'),
  unknown: I('<circle cx="12" cy="12" r="2"/>'),
  shield: I('<path d="M12 3 5 6v6c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  chev: I('<path d="m9 6 6 6-6 6"/>'),
};

// ── Helfer ────────────────────────────────────────────────────────────────────
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shortName = (n) => String(n).replace(/^P8NEX\s*[-–]\s*/, "").replace(/^HubSpot\s*[-–]\s*/, "");
const tone = (st) => `var(${TONE[st] || "--idle"})`;
const sysVar = (s) => `var(--s-${SYSTEMS.includes(s) ? s : "extern"})`;
const nf = new Intl.NumberFormat("de-DE");
const statusChip = (st) => `<span class="st" style="--tone:${tone(st)}">${IC[st] || IC.unknown}${SLABEL[st] || st}</span>`;
function rel(iso) {
  if (!iso) return "noch nie";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "gerade eben";
  if (s < 60) return `vor ${s} s`;
  const m = Math.round(s / 60); if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60); if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24); return d === 1 ? "vor 1 Tag" : `vor ${d} Tagen`;
}
const absTime = (iso) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "—");
function dur(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000; if (s < 60) return `${s.toFixed(1).replace(".", ",")} s`;
  const m = Math.floor(s / 60); return `${m}:${String(Math.round(s % 60)).padStart(2, "0")} Min.`;
}
function countUp(el, to, fmt = (v) => nf.format(Math.round(v))) {
  if (!el) return;
  if (to == null || Number.isNaN(to)) { el.textContent = "—"; el._v = null; return; }
  const from = el._v ?? 0; el._v = to;
  if (REDUCED || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), D = 900;
  const step = (t) => { const p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * e); if (p < 1 && el._v === to) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function cssColors() {
  const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
  const c = { sys: {} };
  for (const k of ["text", "muted", "faint", "line", "line-strong", "surface", "surface-2", "surface-3", "accent", "ok", "err", "run", "warn", "idle", "bg"]) c[k] = g("--" + k);
  for (const s of SYSTEMS) c.sys[s] = g("--s-" + s);
  return c;
}
function rgba(color, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// ── Zustand ───────────────────────────────────────────────────────────────────
const state = {
  snap: null, error: null, lastOkAt: null, paused: false, view: "cockpit",
  selected: null, q: "", sys: "all", status: "all", sort: { key: "status", dir: 1 },
  schemesOpen: false, seenExec: null, lastBeat: 0,
};
let scheme = document.documentElement.dataset.scheme || "polarnacht";
let colors = cssColors();
let orbit = null;

// ── Shell ─────────────────────────────────────────────────────────────────────
const root = document.getElementById("root");
root.innerHTML = `
  <header class="bar">
    <div class="brand"><span class="brand-mark">${IC.pulse}</span>
      <span><div class="brand-name">Prozess-Cockpit</div><div class="brand-sub">n8n · Compliance Manufaktur</div></span></div>
    <nav class="tabs" role="tablist" aria-label="Ansicht">
      <button class="tab" role="tab" data-view="cockpit" id="tab-cockpit">Cockpit</button>
      <button class="tab" role="tab" data-view="workflows" id="tab-workflows">Workflows</button>
    </nav>
    <span class="spacer"></span>
    <span class="clock num" id="clock" aria-hidden="true"></span>
    <span class="live" id="live" role="status" aria-live="polite"><span class="live-dot" id="liveDot"></span><span class="live-txt"><b id="liveLbl">Verbinde</b> <span id="liveAge"></span></span></span>
    <button class="search-btn" id="searchBtn" title="Workflow suchen (/)">${IC.search}<span>Workflow suchen</span><kbd>/</kbd></button>
    <button class="icon-btn" id="pauseBtn" aria-pressed="false" title="Live-Aktualisierung pausieren (P)">${IC.pause}</button>
    <button class="icon-btn" id="schemeBtn" aria-expanded="false" aria-haspopup="true" title="Farbschema (T)">${IC.palette}</button>
    <button class="icon-btn" id="fsBtn" title="TV-Modus / Vollbild (F)">${IC.expand}</button>
    <div class="schemes" id="schemes" role="radiogroup" aria-label="Farbschema" hidden></div>
  </header>
  ${DEMO ? `<div class="demo-strip" id="demoStrip"><span><b>Vorschau mit Demodaten.</b> Die Werte sind simuliert und ändern sich alle 3 Sekunden.</span>
    <span class="seg" role="radiogroup" aria-label="Farbschema-Entwurf" id="demoSeg"></span></div>` : ""}
  <main id="main"></main>
  <div id="drawerHost"></div>
  <div class="tip" id="tip" hidden></div>`;

function renderSchemes() {
  $("#schemes").innerHTML = `<h3>Farbschema wählen</h3>` + SCHEMES.map((s) => `
    <button class="scheme" role="radio" aria-checked="${s.id === scheme}" data-scheme="${s.id}">
      <span class="scheme-sw" style="background:${s.sw[0]}">${s.sw.slice(1).map((c, i) => `<i style="background:${c};left:${10 + i * 18}px"></i>`).join("")}</span>
      <span><b>${s.name}</b><small>${s.desc}</small></span></button>`).join("");
  const seg = $("#demoSeg");
  if (seg) seg.innerHTML = SCHEMES.map((s) => `<button role="radio" aria-checked="${s.id === scheme}" data-scheme="${s.id}"><i style="background:${s.sw[1]};box-shadow:0 0 0 2px ${s.sw[0]}"></i>${s.name}</button>`).join("");
}
function setScheme(id) {
  scheme = id;
  document.documentElement.dataset.scheme = id;
  try { localStorage.setItem("cockpit-theme", id); } catch { /* privat/gesperrt */ }
  colors = cssColors();
  renderSchemes();
  orbit?.recolor();
}
document.addEventListener("fullscreenchange", () => {
  const tv = !!document.fullscreenElement;
  document.documentElement.classList.toggle("tv", tv);
  if (tv && state.view !== "cockpit") setView("cockpit");
  $("#fsBtn").setAttribute("aria-pressed", String(tv));
  $("#fsBtn").title = tv ? "TV-Modus beenden (F)" : "TV-Modus / Vollbild (F)";
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-scheme]");
  if (b && b.closest("#schemes,#demoSeg")) { setScheme(b.dataset.scheme); return; }
  if (state.schemesOpen && !e.target.closest("#schemes,#schemeBtn")) toggleSchemes(false);
});
function toggleSchemes(open = !state.schemesOpen) {
  state.schemesOpen = open;
  $("#schemes").hidden = !open;
  $("#schemeBtn").setAttribute("aria-expanded", String(open));
  if (open) $("#schemes [aria-checked=true]")?.focus();
}
$("#schemeBtn").onclick = () => toggleSchemes();
$("#pauseBtn").onclick = () => togglePause();
$("#fsBtn").onclick = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); };
$("#searchBtn").onclick = () => focusSearch();
document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => setView(t.dataset.view)));

function togglePause() {
  state.paused = !state.paused;
  $("#pauseBtn").setAttribute("aria-pressed", String(state.paused));
  $("#pauseBtn").innerHTML = state.paused ? IC.play : IC.pause;
  $("#pauseBtn").title = state.paused ? "Live-Aktualisierung fortsetzen (P)" : "Live-Aktualisierung pausieren (P)";
  updateLive();
}
function focusSearch() { if (state.view !== "workflows") setView("workflows"); requestAnimationFrame(() => $("#q")?.focus()); }

document.addEventListener("keydown", (e) => {
  const typing = e.target.closest("input,textarea,select");
  if (e.key === "Escape") { if (state.schemesOpen) toggleSchemes(false); else if (state.selected) closeDrawer(); else if (typing) e.target.blur(); return; }
  if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); focusSearch(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "1") setView("cockpit");
  else if (e.key === "2") setView("workflows");
  else if (e.key === "p") togglePause();
  else if (e.key === "f") $("#fsBtn").click();
  else if (e.key === "t") setScheme(SCHEMES[(SCHEMES.findIndex((s) => s.id === scheme) + 1) % SCHEMES.length].id);
});

// ── Live-Anzeige ──────────────────────────────────────────────────────────────
function updateLive() {
  const live = $("#live");
  live.classList.toggle("off", !!state.error);
  live.classList.toggle("paused", state.paused);
  $("#liveLbl").textContent = state.paused ? "Pausiert" : state.error ? "Offline" : DEMO ? "Demo live" : state.lastOkAt ? "Live" : "Verbinde";
  $("#liveAge").textContent = state.lastOkAt ? `· ${rel(state.lastOkAt)}` : "";
}
function beat() {
  const d = $("#liveDot"); d.classList.remove("beat"); void d.offsetWidth; d.classList.add("beat");
}

// ── Ansichten ─────────────────────────────────────────────────────────────────
function setView(v) {
  state.view = v;
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === v)));
  orbit?.destroy(); orbit = null;
  const main = $("#main");
  main.innerHTML = v === "cockpit" ? cockpitShell() : workflowsShell();
  if (v === "cockpit") {
    orbit = new Radial($("#orbitWrap"), (id) => openDrawer(id));
    main.querySelectorAll(".enter").forEach((el, i) => (el.style.animationDelay = `${i * 70}ms`));
  } else wireWorkflows();
  update(true);
}

function cockpitShell() {
  return `<div class="view cockpit" id="cockpitView">
    <div id="banner" class="c-banner"></div>
    <div class="card pulse-card c-lage enter" id="pulse">
      <div class="ring" aria-hidden="true"><svg viewBox="0 0 120 120"><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--tone,var(--accent))"/><stop offset="1" style="stop-color:var(--tone,var(--accent));stop-opacity:.55"/></linearGradient></defs>
        <circle class="ring-track" cx="60" cy="60" r="52"/><circle class="ring-val" id="ringVal" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="326.7"/></svg>
        <div class="ring-c"><b id="ringNum">—</b><span>Erfolg · 24 h</span></div></div>
      <div class="lage-t"><div class="eyebrow">Lagebild</div><h1 class="headline" id="headline">Verbinde mit n8n …</h1>
        <div class="subline" id="subline">Die Live-Daten erscheinen nach der ersten Abfrage.</div></div>
    </div>
    <div class="kpis c-kpis">
      ${kpiShell("k-active", "Aktive Workflows", "--accent")}
      ${kpiShell("k-running", "Laufen gerade", "--run")}
      ${kpiShell("k-runs", "Läufe · 24 h", "--accent")}
      ${kpiShell("k-err", "Fehler · 24 h", "--err")}
    </div>
    <div class="card orbit-card c-radial enter">
      <div class="card-h"><h2>Systemlandschaft</h2><span class="meta" id="orbitMeta">Live · Datenfluss nach n8n</span></div>
      <div class="orbit-wrap" id="orbitWrap"></div>
      <div class="events" id="events" aria-live="polite"></div>
      <div class="orbit-sys" id="orbitSys"></div>
      <div class="orbit-legend" id="orbitLegend">
        <span><i style="background:var(--ok)"></i>Erfolgreich</span><span><i style="background:var(--err)"></i>Fehler</span>
        <span><i style="background:var(--run)"></i>Läuft</span><span><i style="background:var(--warn)"></i>Wartet</span>
        <span><i style="background:var(--idle)"></i>Bereit</span><span><i class="ring-i"></i>Inaktiv</span></div>
    </div>
    <div class="card feed-card c-feed enter">
      <div class="card-h"><h2>Live-Aktivität</h2><span class="meta">letzte Ausführungen</span></div>
      <ul class="feed" id="feed" aria-live="polite"></ul>
    </div>
    <div class="card c-time enter">
      <div class="card-h"><h2>Läufe der letzten 24 Stunden</h2><span class="meta" id="tlMeta"></span></div>
      <div class="legend" id="tlLegend"></div>
      <div class="chart" id="timeline"></div>
    </div>
    <div class="card c-attn enter">
      <div class="card-h"><h2>Braucht Aufmerksamkeit</h2><span class="meta" id="attnMeta"></span></div>
      <div id="attn" class="attn-body"></div>
    </div>
  </div>`;
}
const kpiShell = (id, label, tok) => `<div class="card kpi enter" id="${id}" style="--tone:var(${tok})">
  <div class="kpi-l"><i></i>${label}</div><div class="kpi-v"><span class="v">—</span><small class="of"></small></div>
  <div class="kpi-f"></div><div class="spark-host"></div></div>`;

function workflowsShell() {
  return `<div class="view">
    <div id="banner"></div>
    <div class="filters">
      <label class="search">${IC.search}<span class="sr">Workflow suchen</span><input id="q" type="search" placeholder="Workflow, System oder ID suchen …" autocomplete="off" value="${esc(state.q)}"></label>
      <div class="chips" id="statusChips" role="group" aria-label="Nach Status filtern"></div>
    </div>
    <div class="chips" id="sysChips" role="group" aria-label="Nach System filtern"></div>
    <div class="card table-card"><div class="card-h" style="padding-bottom:10px"><h2>Workflows</h2><span class="meta" id="wfCount"></span></div>
      <div style="overflow-x:auto"><table class="wf-table"><thead><tr>
        <th><button data-sort="status">Status</button></th><th><button data-sort="name">Workflow</button></th>
        <th><button data-sort="system">System</button></th><th><button data-sort="last">Letzter Lauf</button></th>
        <th style="text-align:right"><button data-sort="execs">Läufe</button></th></tr></thead><tbody id="wfBody"></tbody></table></div></div>
  </div>`;
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(fresh = false) {
  updateLive();
  const b = $("#banner");
  if (b) b.innerHTML = state.error ? `<div class="banner">${IC.error}<span>Live-Daten nicht verfügbar: ${esc(state.error)}${state.snap ? " · Es wird der letzte Stand gezeigt." : ""}</span></div>` : "";
  if (state.view === "cockpit") { updateHero(); updateKpis(); updateFeed(fresh); updateTimeline(); updateAttention(); orbit?.setData(state.snap); }
  else updateWorkflows();
  if (state.selected) renderDrawer();
}

function updateHero() {
  const k = state.snap?.kpis; if (!k) return;
  const nodes = state.snap.nodes;
  const rate = k.successRate24h;
  const rTone = rate == null ? "var(--idle)" : rate >= 0.95 ? "var(--ok)" : rate >= 0.8 ? "var(--warn)" : "var(--err)";
  const ring = $("#ringVal");
  ring.style.setProperty("--tone", rTone);
  ring.setAttribute("stroke-dashoffset", String(326.7 * (1 - (rate ?? 0))));
  countUp($("#ringNum"), rate == null ? null : rate * 100, (v) => `${Math.round(v)} %`);

  const failed = nodes.filter((n) => n.status === "error").sort((a, b) => new Date(b.lastRunAt) - new Date(a.lastRunAt));
  const running = nodes.filter((n) => n.status === "running");
  const lastRun = nodes.reduce((m, n) => (n.lastRunAt && (!m || n.lastRunAt > m) ? n.lastRunAt : m), null);
  let t, h, s;
  if (failed.length) {
    t = "var(--err)";
    h = `<em>${failed.length}</em> Workflow${failed.length > 1 ? "s" : ""} mit Fehler`;
    s = `Zuletzt fehlgeschlagen: ${shortName(failed[0].name)}, ${rel(failed[0].lastRunAt)}.${running.length ? ` ${running.length} ${running.length > 1 ? "weitere laufen" : "weiterer läuft"} gerade.` : ""}`;
  } else if (running.length) {
    t = "var(--run)";
    h = `<em>${running.length}</em> Prozess${running.length > 1 ? "e laufen" : " läuft"} gerade`;
    s = `${shortName(running[0].name)}${running.length > 1 ? ` und ${running.length - 1} weitere` : ""}. Alle anderen Workflows sind im grünen Bereich.`;
  } else {
    t = "var(--ok)";
    h = `Alles im <em>grünen Bereich</em>`;
    s = `${k.workflowsActive} aktive Workflows ohne offene Fehler. Letzter Lauf ${rel(lastRun)}.`;
  }
  const p = $("#pulse");
  p.style.setProperty("--tone", t);
  p.style.setProperty("--tone-soft", `color-mix(in srgb, ${t} 22%, transparent)`);
  $("#headline").innerHTML = h;
  $("#subline").textContent = s;
}

function setKpi(id, value, of, foot, spark) {
  const el = $("#" + id); if (!el) return;
  const v = $(".v", el);
  if (v._v != null && v._v !== value && !REDUCED) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  countUp(v, value);
  $(".of", el).textContent = of || "";
  $(".kpi-f", el).innerHTML = foot || "";
  if (spark) sparkline($(".spark-host", el), spark);
}
function updateKpis() {
  const s = state.snap; if (!s) return;
  const k = s.kpis, tl = s.timeline || [];
  const running = s.nodes.filter((n) => n.status === "running");
  setKpi("k-active", k.workflowsActive, `/ ${k.workflowsTotal}`, `${k.workflowsTotal - k.workflowsActive} inaktiv`);
  setKpi("k-running", k.running, "", running.length ? esc(shortName(running[0].name)) + (running.length > 1 ? ` +${running.length - 1}` : "") : "Keine laufenden Prozesse");
  const totals = tl.map((b) => b.success + b.error + b.other);
  setKpi("k-runs", k.runs24h ?? null, "", tl.length ? `Ø ${nf.format(Math.round((k.runs24h || 0) / 24))} pro Stunde` : "", totals.length ? totals : null);
  const errEl = $("#k-err");
  errEl.style.setProperty("--tone", k.errors24h ? "var(--err)" : "var(--ok)");
  setKpi("k-err", k.errors24h ?? null, "", k.failed ? `${k.failed} Workflow${k.failed > 1 ? "s" : ""} aktuell rot` : "Keine offenen Fehler", tl.length ? tl.map((b) => b.error) : null);
}
function sparkline(host, vals) {
  const w = host.clientWidth || 200, h = 34, max = Math.max(1, ...vals), n = vals.length;
  const x = (i) => (i / (n - 1)) * (w - 6) + 1, y = (v) => h - 3 - (v / max) * (h - 8);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const gid = "g" + Math.random().toString(36).slice(2, 8);
  host.innerHTML = `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--tone);stop-opacity:.32"/><stop offset="1" style="stop-color:var(--tone);stop-opacity:0"/></linearGradient></defs>
    <path d="${line} L${x(n - 1)},${h} L${x(0)},${h} Z" fill="url(#${gid})"/><path d="${line}" fill="none" style="stroke:var(--tone)" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${x(n - 1)}" cy="${y(vals[n - 1])}" r="3.5" style="fill:var(--tone);stroke:var(--surface)" stroke-width="2"/></svg>`;
}

function updateFeed(fresh) {
  const ul = $("#feed"); if (!ul || !state.snap) return;
  const rec = state.snap.recent || [];
  if (!rec.length) { ul.innerHTML = `<li class="empty" style="display:block;cursor:default">Noch keine Ausführungen im Abfragezeitraum.</li>`; return; }
  const seen = state.seenExec;
  const key = (r) => r.id + ":" + r.status;
  ul.innerHTML = rec.map((r) => {
    const isNew = seen && !fresh && !seen.has(key(r));
    return `<li class="${isNew ? "new" : ""}" data-open="${esc(r.workflowId)}" tabindex="0" style="--tone:${tone(r.status)}">
      <span class="feed-ic" title="${SLABEL[r.status] || r.status}">${IC[r.status] || IC.unknown}</span>
      <span class="feed-t"><b>${esc(shortName(r.name))}</b><small><i style="background:${sysVar(r.system)}"></i>${SYS_NAME[r.system] || r.system} · ${SLABEL[r.status] || r.status}</small></span>
      <span class="feed-r"><span data-rel="${esc(r.startedAt)}">${rel(r.startedAt)}</span><span class="num">${r.status === "running" ? "läuft …" : dur(r.durationMs)}</span></span></li>`;
  }).join("");
  state.seenExec = new Set(rec.map(key));
}

function updateTimeline() {
  const host = $("#timeline"); if (!host || !state.snap) return;
  const tl = state.snap.timeline || [];
  if (!tl.length) { host.innerHTML = `<div class="empty">Keine Zeitleiste verfügbar.</div>`; return; }
  const grow = !host.dataset.grown && !REDUCED; host.dataset.grown = "1";
  const hasOther = tl.some((b) => b.other);
  $("#tlLegend").innerHTML = `<span><i style="background:var(--ok)"></i>Erfolgreich</span><span><i style="background:var(--err)"></i>Fehler</span>${hasOther ? `<span><i style="background:var(--idle)"></i>Laufend / wartend</span>` : ""}`;
  const tot = tl.reduce((a, b) => a + b.success + b.error + b.other, 0);
  const peak = tl.reduce((m, b, i) => (b.success + b.error + b.other > m.v ? { v: b.success + b.error + b.other, i } : m), { v: 0, i: 0 });
  $("#tlMeta").textContent = `${nf.format(tot)} Läufe · Spitze ${new Date(tl[peak.i].t).getHours()}:00 Uhr`;
  const W = host.clientWidth - 36 || 600, H = Math.max(90, host.clientHeight - 24 || 210), ml = 30, mr = 4, mt = 8, mb = 24;
  const pw = W - ml - mr, ph = H - mt - mb;
  const rawMax = Math.max(1, ...tl.map((b) => b.success + b.error + b.other));
  const stepN = rawMax <= 4 ? 1 : rawMax <= 10 ? 2 : rawMax <= 25 ? 5 : rawMax <= 50 ? 10 : Math.ceil(rawMax / 50) * 10;
  const max = Math.ceil(rawMax / stepN) * stepN;
  const y = (v) => mt + ph - (v / max) * ph;
  const cw = pw / tl.length, bw = Math.max(3, cw - Math.max(2, cw * 0.28));
  const ticks = []; for (let v = 0; v <= max; v += stepN) ticks.push(v);
  while (ticks.length > 5) for (let i = ticks.length - 2; i > 0; i -= 2) ticks.splice(i, 1);
  let svg = `<g class="grid">${ticks.map((v) => `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}</g>`;
  const seg = (x, y0, y1, color, roundTop) => {
    const h = y0 - y1; if (h <= 0.5) return "";
    const r = roundTop ? Math.min(4, h, bw / 2) : 0;
    return `<path style="fill:${color}" d="M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z"/>`;
  };
  tl.forEach((b, i) => {
    const x = ml + i * cw + (cw - bw) / 2;
    const parts = [["var(--ok)", b.success], ["var(--err)", b.error], ["var(--idle)", b.other]].filter((p) => p[1] > 0);
    let acc = 0, g = "";
    parts.forEach(([c, v], j) => {
      const y0 = y(acc) - (j ? 1 : 0), y1 = y(acc + v) + (j < parts.length - 1 ? 1 : 0);
      g += seg(x, y0, y1, c, j === parts.length - 1); acc += v;
    });
    const hr = new Date(b.t).getHours();
    const last = i === tl.length - 1;
    svg += `<g class="col${grow ? " grow" : ""}${last ? " now" : ""}" data-i="${i}" style="--d:${i * 28}ms"><rect class="bar-hit" x="${ml + i * cw}" y="${mt}" width="${cw}" height="${ph}" rx="6"/>${g}
      ${i % 6 === 0 || last ? `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" ${last ? 'style="fill:var(--text)"' : ""}>${last ? "jetzt" : String(hr).padStart(2, "0") + ":00"}</text>` : ""}</g>`;
  });
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="height:${H}px" role="img" aria-label="Ausführungen pro Stunde in den letzten 24 Stunden">${svg}</svg>`;
  host.querySelectorAll(".col").forEach((g) => {
    g.onmousemove = (e) => {
      const b = tl[+g.dataset.i], hr = new Date(b.t).getHours();
      showTip(e, `<b>${String(hr).padStart(2, "0")}:00 – ${String((hr + 1) % 24).padStart(2, "0")}:00 Uhr</b>
        <div class="row"><span>Erfolgreich</span><span class="num">${b.success}</span></div>
        <div class="row"><span>Fehler</span><span class="num">${b.error}</span></div>${b.other ? `<div class="row"><span>Laufend / wartend</span><span class="num">${b.other}</span></div>` : ""}`);
    };
    g.onmouseleave = hideTip;
  });
}

function updateAttention() {
  const host = $("#attn"); if (!host || !state.snap) return;
  const list = state.snap.nodes.filter((n) => n.status === "error" || n.status === "waiting")
    .sort((a, b) => SORDER[a.status] - SORDER[b.status] || new Date(b.lastRunAt || 0) - new Date(a.lastRunAt || 0));
  $("#attnMeta").textContent = list.length ? `${list.length} offen` : "";
  host.innerHTML = list.length
    ? `<ul class="attn">${list.map((n) => `<li data-open="${esc(n.id)}" tabindex="0" style="--tone:${tone(n.status)}"><i></i>
        <span style="min-width:0"><b>${esc(shortName(n.name))}</b><small>${SLABEL[n.status]} · <span data-rel="${esc(n.lastRunAt || "")}">${rel(n.lastRunAt)}</span> · ${SYS_NAME[n.system]}</small></span>
        <span class="dim" style="display:flex;align-items:center;gap:2px;font-size:12px">Details <span style="width:14px;height:14px;display:inline-grid">${IC.chev}</span></span></li>`).join("")}</ul>`
    : `<div class="all-good">${IC.shield}<b style="color:var(--text)">Nichts zu tun</b><span style="font-size:12.5px">Keine fehlgeschlagenen oder wartenden Workflows.</span></div>`;
  // Aktivste Workflows (Ausführungen im Abfragezeitraum), Balken im Systemton.
  const top = [...state.snap.nodes].filter((n) => n.execCount > 0).sort((a, b) => b.execCount - a.execCount).slice(0, 5);
  if (top.length) {
    const mx = top[0].execCount;
    host.innerHTML += `<div class="top-list"><div class="sec-t">Aktivste Workflows</div>${top.map((n) => `
      <button data-open="${esc(n.id)}" class="top-row"><span class="top-n">${esc(shortName(n.name))}</span><span class="num">${nf.format(n.execCount)}</span>
      <span class="top-bar"><i style="width:${Math.max(3, (n.execCount / mx) * 100)}%;background:${sysVar(n.system)}"></i></span></button>`).join("")}</div>`;
  }
}

// ── Workflows-Ansicht ─────────────────────────────────────────────────────────
function wireWorkflows() {
  $("#q").oninput = (e) => { state.q = e.target.value; updateWorkflows(); };
  document.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => {
    const k = b.dataset.sort;
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : k === "last" || k === "execs" ? -1 : 1 };
    updateWorkflows();
  }));
}
function updateWorkflows() {
  const s = state.snap; const body = $("#wfBody"); if (!body) return;
  const nodes = s?.nodes || [];
  const sysCounts = {}; nodes.forEach((n) => (sysCounts[n.system] = (sysCounts[n.system] || 0) + 1));
  const stCounts = {}; nodes.forEach((n) => (stCounts[n.status] = (stCounts[n.status] || 0) + 1));
  $("#sysChips").innerHTML = `<button class="chip" aria-pressed="${state.sys === "all"}" data-sys="all">Alle Systeme <span class="num">${nodes.length}</span></button>` +
    SYSTEMS.filter((x) => sysCounts[x]).map((x) => `<button class="chip" style="--c:${sysVar(x)}" aria-pressed="${state.sys === x}" data-sys="${x}"><i></i>${SYS_NAME[x]} <span class="num">${sysCounts[x]}</span></button>`).join("");
  $("#statusChips").innerHTML = `<button class="chip" aria-pressed="${state.status === "all"}" data-st="all">Alle</button>` +
    ["error", "running", "waiting", "success", "idle", "inactive"].filter((x) => stCounts[x]).map((x) => `<button class="chip" style="--c:${tone(x)}" aria-pressed="${state.status === x}" data-st="${x}"><i style="border-radius:50%"></i>${SLABEL[x]} <span class="num">${stCounts[x]}</span></button>`).join("");
  document.querySelectorAll("[data-sys]").forEach((b) => (b.onclick = () => { state.sys = b.dataset.sys; updateWorkflows(); }));
  document.querySelectorAll("[data-st]").forEach((b) => (b.onclick = () => { state.status = b.dataset.st; updateWorkflows(); }));
  document.querySelectorAll("[data-sort]").forEach((b) => {
    const on = b.dataset.sort === state.sort.key;
    b.toggleAttribute("data-active", on);
    b.closest("th").setAttribute("aria-sort", on ? (state.sort.dir > 0 ? "ascending" : "descending") : "none");
    b.textContent = b.textContent.replace(/ [↑↓]$/, "") + (on ? (state.sort.dir > 0 ? " ↑" : " ↓") : "");
  });

  const q = state.q.trim().toLowerCase();
  let list = nodes.filter((n) => (state.sys === "all" || n.system === state.sys) && (state.status === "all" || n.status === state.status) &&
    (!q || n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || (SYS_NAME[n.system] || "").toLowerCase().includes(q)));
  const { key, dir } = state.sort;
  const cmp = {
    status: (a, b) => SORDER[a.status] - SORDER[b.status],
    name: (a, b) => a.name.localeCompare(b.name, "de"),
    system: (a, b) => (SYS_NAME[a.system] || "").localeCompare(SYS_NAME[b.system] || "", "de"),
    last: (a, b) => new Date(a.lastRunAt || 0) - new Date(b.lastRunAt || 0),
    execs: (a, b) => a.execCount - b.execCount,
  }[key];
  list = [...list].sort((a, b) => dir * cmp(a, b) || a.name.localeCompare(b.name, "de"));
  $("#wfCount").textContent = s ? `${list.length} von ${nodes.length}` : "";
  body.innerHTML = list.length ? list.map((n) => `<tr data-open="${esc(n.id)}" tabindex="0">
      <td>${statusChip(n.status)}</td>
      <td class="wf-name"><b>${esc(n.name)}${n.active ? "" : '<span class="off-tag">inaktiv</span>'}</b>${n.note ? `<small>${esc(n.note)}</small>` : ""}</td>
      <td><span class="sys" style="--c:${sysVar(n.system)}"><i></i>${SYS_NAME[n.system]}</span></td>
      <td class="dim"><span data-rel="${esc(n.lastRunAt || "")}">${rel(n.lastRunAt)}</span></td>
      <td class="num hide-m" style="text-align:right">${nf.format(n.execCount)}</td></tr>`).join("")
    : `<tr><td colspan="5"><div class="empty">${s ? "Kein Workflow passt zu Suche und Filter." : "Lädt …"}</div></td></tr>`;
}

// Öffnen per Klick/Enter auf Feed-, Aufmerksamkeits- und Tabellenzeilen.
document.addEventListener("click", (e) => { const t = e.target.closest("[data-open]"); if (t && !e.target.closest("a")) openDrawer(t.dataset.open); });
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches?.("[data-open]")) openDrawer(e.target.dataset.open); });

// ── Detail-Schublade ──────────────────────────────────────────────────────────
let lastFocus = null;
function openDrawer(id) {
  if (!state.snap?.nodes.some((n) => n.id === id)) return;
  if (!state.selected) lastFocus = document.activeElement;
  state.selected = id; hideTip(); renderDrawer(true); orbit?.draw();
}
function closeDrawer() {
  state.selected = null; $("#drawerHost").innerHTML = ""; orbit?.draw();
  lastFocus?.focus?.();
}
function renderDrawer(focus = false) {
  const n = state.snap?.nodes.find((x) => x.id === state.selected);
  if (!n) { closeDrawer(); return; }
  const host = $("#drawerHost");
  const scroll = $(".drawer-b", host)?.scrollTop || 0;
  const edges = state.snap.edges || [];
  const nm = Object.fromEntries(state.snap.nodes.map((x) => [x.id, x.name]));
  const inc = edges.filter((e) => e.to === n.id), out = edges.filter((e) => e.from === n.id);
  const runs = (state.snap.recent || []).filter((r) => r.workflowId === n.id).slice(0, 20).reverse();
  const lastDur = (state.snap.recent || []).find((r) => r.workflowId === n.id)?.durationMs;
  const links = (arr, lbl) => arr.length ? `<div><div class="sec-t">${lbl}</div><div class="link-list">${arr.map((e) => {
    const other = e.from === n.id ? e.to : e.from;
    return `<button data-open="${esc(other)}"><span>${esc(nm[other] || other)}</span><small>${esc(e.label || "")}</small></button>`; }).join("")}</div></div>` : "";
  let aside = $(".drawer", host);
  if (!aside) {
    host.innerHTML = `<div class="scrim" id="scrim"></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle"></aside>`;
    aside = $(".drawer", host);
    $("#scrim").onclick = closeDrawer;
  }
  const hadFocus = document.activeElement?.id === "dClose";
  aside.style.setProperty("--c", sysVar(n.system));
  aside.innerHTML = `
      <div class="drawer-h"><div class="top"><span class="sys" style="--c:${sysVar(n.system)}"><i></i>${SYS_NAME[n.system]}</span>
        <span class="spacer"></span><button class="icon-btn" id="dClose" title="Schließen (Esc)">${IC.x}</button></div>
        <h3 id="dTitle">${esc(n.name)}</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${statusChip(n.status)}${n.active ? `<span class="st" style="--tone:var(--ok)">${IC.pulse}Aktiv</span>` : statusChip("inactive")}</div></div>
      <div class="drawer-b">
        ${n.note ? `<div class="note">${esc(n.note)}</div>` : ""}
        <div class="facts">
          <div class="fact"><span>Letzter Lauf</span><b data-rel="${esc(n.lastRunAt || "")}">${rel(n.lastRunAt)}</b><span>${absTime(n.lastRunAt)}</span></div>
          <div class="fact"><span>Dauer letzter Lauf</span><b class="num">${n.status === "running" ? "läuft …" : dur(lastDur)}</b></div>
          <div class="fact"><span>Ausführungen</span><b class="num">${nf.format(n.execCount)}</b><span>im Abfragezeitraum</span></div>
          <div class="fact"><span>Zuletzt geändert</span><b>${rel(n.updatedAt)}</b><span>${absTime(n.updatedAt)}</span></div>
        </div>
        ${runs.length ? `<div><div class="sec-t">Letzte Läufe</div><div class="runs">${runs.map((r) => `<i style="--tone:${tone(r.status)}" title="${SLABEL[r.status]} · ${absTime(r.startedAt)}"></i>`).join("")}</div></div>` : ""}
        ${n.uses?.length ? `<div><div class="sec-t">Nutzt</div><div class="chips">${n.uses.map((u) => `<span class="chip" style="--c:${sysVar(u)};cursor:default"><i></i>${SYS_NAME[u] || u}</span>`).join("")}</div></div>` : ""}
        ${links(inc, "Ausgelöst von")}${links(out, "Löst aus")}
        <div class="dim num" style="font-size:11.5px">ID ${esc(n.id)}</div>
      </div>
      <div class="drawer-f"><a class="primary" href="${esc(N8N_BASE)}/workflow/${encodeURIComponent(n.id)}" target="_blank" rel="noopener">${IC.ext}In n8n öffnen</a></div>`;
  $(".drawer-b", host).scrollTop = scroll;
  $("#dClose").onclick = closeDrawer;
  if (focus || hadFocus) $("#dClose").focus();
}

// ── Ereignis-Meldungen im Leitstand ───────────────────────────────────────────
function pushEvent(n, kind) {
  const host = $("#events"); if (!host) return;
  const rec = (state.snap?.recent || []).find((r) => r.workflowId === n.id);
  const st = kind === "start" ? "running" : n.status === "error" ? "error" : "success";
  const el = document.createElement("div");
  el.className = "evt"; el.style.setProperty("--tone", tone(st));
  el.innerHTML = `<span class="evt-ic">${IC[st]}</span><span class="evt-t"><b>${esc(shortName(n.name))}</b>
    <small>${kind === "start" ? "gestartet" : st === "error" ? "fehlgeschlagen" : "erfolgreich"}${kind !== "start" && rec?.durationMs != null ? ` in ${dur(rec.durationMs)}` : ""} · ${SYS_NAME[n.system]}</small></span>`;
  el.onclick = () => openDrawer(n.id);
  host.prepend(el);
  while (host.children.length > 3) host.lastChild.remove();
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 450); }, 5200);
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function showTip(e, html) {
  const t = $("#tip"); t.innerHTML = html; t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight;
  const x = e.clientX + w + 24 > innerWidth ? e.clientX - w - 24 : e.clientX;
  const y = e.clientY + h + 24 > innerHeight ? e.clientY - h - 24 : e.clientY;
  t.style.left = x + "px"; t.style.top = y + "px";
}
function hideTip() { $("#tip").hidden = true; }

// ── Radial-Leitstand: Systemlandschaft als Instrument ─────────────────────────
// n8n im Zentrum. Jedes System besitzt einen festen Sektor des Außenrings
// (Breite ∝ Anzahl Workflows), die Workflows sitzen als radial ausgerichtete
// Zellen darin (alphabetisch, Farbe = Status). Ein Radar-Sweep tastet den Ring
// ab, laufende Workflows senden Lichtstrahlen zum Kern, Abschlüsse lösen einen
// Puls zum Kern und eine Schockwelle aus. Workflow-Kanten laufen als Sehnen
// durch das Innere.
const SECTOR_ORDER = ["hubspot", "claude", "openai", "m365", "monday", "stripe", "extern", "n8n"];
const TAU = Math.PI * 2;
// Im Ring steht das System bereits am Sektor — System-Präfixe im Namen weglassen.
// Kurzname für die Pills im Ring: ohne System-Präfix, Klammern und Füllwörter,
// höchstens `max` Zeichen, an Wortgrenzen gekürzt.
const FILLER = new Set(["und", "für", "der", "die", "das", "je", "von", "zu", "mit", "im", "in", "&", "–", "-", "→"]);
function pillName(name, max) {
  const words = ringName(name).replace(/^(KI-Agent|Dashboard API|Archiv)\s*[-–]?\s*/i, "").replace(/\([^)]*\)/g, "").split(/\s+/).filter((w) => w && !FILLER.has(w.toLowerCase()));
  let out = "";
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > max) break;
    out = next;
  }
  if (!out) out = words[0] ? words[0].slice(0, max - 1) + "…" : "";
  return out;
}
const ringName = (n) => String(n).replace(/^(P8NEX|HubSpot|monday\.com|Stripe|SharePoint|Outlook|Microsoft 365|n8n)\s*[-–]\s*/i, "");
const normA = (a) => ((a % TAU) + TAU) % TAU;

class Radial {
  constructor(wrap, onPick) {
    this.wrap = wrap; this.onPick = onPick;
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Radial-Leitstand: n8n im Zentrum, jedes System hat einen Sektor, Workflows sind Zellen im Ring.");
    wrap.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.t = 0; this.last = performance.now(); this.born = performance.now();
    this.fx = []; this.cells = []; this.sectors = []; this.prev = new Map(); this.hover = null; this.alive = true;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(wrap);
    this.canvas.addEventListener("mousemove", (e) => this.onMove(e));
    this.canvas.addEventListener("mouseleave", () => { this.hover = null; hideTip(); this.canvas.classList.remove("hot"); });
    this.canvas.addEventListener("click", () => { if (this.hover?.kind === "wf") this.onPick(this.hover.id); });
    this.resize();
    this.frame = (now) => { if (!this.alive) return; this.step(now); requestAnimationFrame(this.frame); };
    requestAnimationFrame(this.frame);
  }
  destroy() { this.alive = false; this.ro.disconnect(); hideTip(); }
  recolor() { this.draw(); }
  resize() {
    const r = this.wrap.getBoundingClientRect(); this.W = r.width; this.H = r.height;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.geometry(); this.draw();
  }
  setData(snap) {
    this.snap = snap; if (!snap) return;
    const bySys = {}; snap.nodes.forEach((n) => (bySys[n.system] = bySys[n.system] || []).push(n));
    Object.values(bySys).forEach((l) => l.sort((a, b) => shortName(a.name).localeCompare(shortName(b.name), "de")));
    this.bySys = bySys;
    if (this.prev.size) {
      for (const n of snap.nodes) {
        const p = this.prev.get(n.id); if (!p) continue;
        if (n.status === "running" && p.status !== "running") { this.fx.push({ type: "ignite", id: n.id, t0: this.t }); pushEvent(n, "start"); }
        else if ((p.status === "running" && n.status !== "running") || (n.lastRunAt !== p.lastRunAt && n.status !== "running")) {
          const color = n.status === "error" ? colors.err : colors.ok;
          this.fx.push({ type: "pulse", id: n.id, t0: this.t, color });
          this.fx.push({ type: "wave", t0: this.t + 0.7, color });
          pushEvent(n, "done");
        }
      }
    }
    this.prev = new Map(snap.nodes.map((n) => [n.id, { status: n.status, lastRunAt: n.lastRunAt }]));
    this.geometry();
    const meta = $("#orbitMeta");
    if (meta) meta.textContent = `${this.sectors.length} Systeme · ${snap.nodes.length} Workflows`;
    // Kompakte Systemliste (auf schmalen Bildschirmen statt der Ringbeschriftung)
    const sl = $("#orbitSys");
    if (sl) sl.innerHTML = this.sectors.map((sec) => {
      const e = sec.list.filter((n) => n.status === "error").length;
      return `<span style="--c:${sysVar(sec.s)}"><i></i>${SYS_NAME[sec.s]} <b class="num">${sec.list.length}</b>${e ? ` <em class="num">${e} Fehler</em>` : ""}</span>`;
    }).join("");
  }
  geometry() {
    const W = this.W, H = this.H; if (!W || !H) return;
    const narrow = W < 560;
    this.narrow = narrow;
    this.cx = W / 2; this.cy = H / 2;
    this.R = Math.max(70, Math.min(H / 2 - (narrow ? 30 : 48), W / 2 - (narrow ? 34 : 172)));
    this.hubR = this.R * 0.17;
    const used = new Set((this.snap?.nodes || []).flatMap((n) => n.uses || []));
    const sys = SECTOR_ORDER.filter((s) => this.bySys?.[s]?.length || used.has(s));
    const weights = sys.map((s) => Math.max(1.4, this.bySys?.[s]?.length || 0));
    const gap = sys.length > 1 ? 0.07 : 0, total = weights.reduce((a, b) => a + b, 0) || 1;
    const span = TAU - gap * sys.length;
    let a = -Math.PI / 2 + gap / 2;
    this.sectors = sys.map((s, i) => {
      const w = (weights[i] / total) * span, sec = { s, a0: a, a1: a + w, mid: a + w / 2, list: this.bySys?.[s] || [] };
      a += w + gap; return sec;
    });
    this.cells = [];
    const rc = this.R - 20;
    for (const sec of this.sectors) {
      const n = sec.list.length; if (!n) continue;
      const step = (sec.a1 - sec.a0) / n;
      sec.list.forEach((node, i) => {
        const ang = sec.a0 + step * (i + 0.5);
        this.cells.push({ n: node, ang, x: this.cx + Math.cos(ang) * rc, y: this.cy + Math.sin(ang) * rc, w: Math.min(9, step * rc * 0.62), sec });
      });
    }
    this.cellOf = Object.fromEntries(this.cells.map((c) => [c.n.id, c]));
    // Sternenfeld außerhalb des Rings (feste Positionen je Größe)
    if (!this.stars || this.starsFor !== `${W}x${H}`) {
      this.starsFor = `${W}x${H}`; this.stars = [];
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < Math.round((W * H) / 2600); i++) {
        const x = rnd() * W, y = rnd() * H;
        if (Math.hypot(x - this.cx, y - this.cy) < this.R + 18) continue;
        this.stars.push({ x, y, r: 0.4 + rnd() * 1.1, ph: rnd() * TAU, sp: 0.6 + rnd() * 1.6 });
      }
    }
    // Zell-Pills: kurzer Name in einer statusfarbenen Kapsel, strahlenförmig nach innen.
    this.labelR = this.R - 32;
    this.pillH = narrow ? 14 : 19;
    this.pillPad = narrow ? 5 : 8;
    const fpx = narrow ? 8.5 : this.R < 200 ? 9.5 : 11;
    this.labelFont = `600 ${fpx}px "Instrument Sans",system-ui,sans-serif`;
    this.innerR = this.hubR * (narrow || this.R < 200 ? 1.35 : 1.6);
    const maxW = this.labelR - this.innerR - 8 - this.pillPad * 2;
    const maxChars = Math.max(6, Math.min(20, Math.floor(maxW / (fpx * 0.56))));
    const ctx = this.ctx; ctx.font = this.labelFont;
    for (const c of this.cells) {
      const spacing = ((c.sec.a1 - c.sec.a0) / c.sec.list.length) * this.labelR;
      c.label = null; c.labelW = 0;
      if (spacing < this.pillH + 2 || maxW < 36) continue;
      let txt = pillName(c.n.name, maxChars);
      while (txt.length > 3 && ctx.measureText(txt).width > maxW) txt = txt.slice(0, -2) + "…";
      c.label = txt; c.labelW = ctx.measureText(txt).width + this.pillPad * 2;
    }
  }
  step(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (!REDUCED && !state.paused) this.t += dt;
    this.fx = this.fx.filter((f) => this.t - f.t0 < 2.2);
    this.draw();
  }
  draw() {
    const ctx = this.ctx, W = this.W, H = this.H; if (!W || !H || !this.R) return;
    const C = colors, t = this.t, cx = this.cx, cy = this.cy, R = this.R;
    const intro = REDUCED ? 1 : Math.min(1, (performance.now() - this.born) / 1600), ease = 1 - Math.pow(1 - intro, 3);
    ctx.clearRect(0, 0, W, H);

    // Sternenfeld
    for (const st of this.stars || []) {
      const a = REDUCED ? 0.4 : 0.15 + 0.45 * (0.5 + 0.5 * Math.sin(t * st.sp + st.ph));
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, TAU); ctx.fillStyle = rgba(C.muted, a * ease); ctx.fill();
    }
    // HUD: gegenläufig rotierende Bogensegmente um die Skala
    ctx.save(); ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const a0 = (REDUCED ? 0 : t * 0.22) + (i * TAU) / 3;
      ctx.beginPath(); ctx.arc(cx, cy, R + 21, a0, a0 + 0.55 * ease); ctx.strokeStyle = rgba(C.accent, 0.55); ctx.lineWidth = 1.6; ctx.stroke();
      const b0 = (REDUCED ? 0 : -t * 0.14) + (i * TAU) / 3 + 0.9;
      ctx.beginPath(); ctx.arc(cx, cy, this.hubR * 1.25, b0, b0 + 1.1 * ease); ctx.strokeStyle = rgba(C.sys.n8n, 0.5); ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.restore();
    // Instrumenten-Grund: Kernglühen, konzentrische Ringe, Skala
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.15);
    glow.addColorStop(0, rgba(C.sys.n8n, 0.16)); glow.addColorStop(0.55, rgba(C.accent, 0.05)); glow.addColorStop(1, rgba(C.accent, 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.15, 0, TAU); ctx.fill();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, (this.innerR || this.hubR * 1.6) * ease, 0, TAU); ctx.strokeStyle = C.line; ctx.setLineDash([2, 5]); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(cx, cy, (R - 20) * ease, 0, TAU); ctx.strokeStyle = C.line; ctx.stroke();
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU, major = i % 10 === 0, r0 = R + 9, r1 = r0 + (major ? 7 : 3);
      if (i / 120 > ease) break;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.strokeStyle = major ? C["line-strong"] : C.line; ctx.stroke();
    }

    // Radar-Sweep
    const sweep = normA(t * 0.7 - Math.PI / 2);
    if (!REDUCED && this.snap && ctx.createConicGradient) {
      const cg = ctx.createConicGradient(sweep - 0.9, cx, cy);
      cg.addColorStop(0, rgba(C.accent, 0)); cg.addColorStop(0.143, rgba(C.accent, 0.16)); cg.addColorStop(0.1432, rgba(C.accent, 0)); cg.addColorStop(1, rgba(C.accent, 0));
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, R - 4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(sweep) * this.hubR, cy + Math.sin(sweep) * this.hubR); ctx.lineTo(cx + Math.cos(sweep) * (R - 4), cy + Math.sin(sweep) * (R - 4));
      ctx.strokeStyle = rgba(C.accent, 0.5); ctx.lineWidth = 1.2; ctx.stroke();
    }

    if (!this.snap) { this.drawHub(C, 0, 0); ctx.fillStyle = C.muted; ctx.textAlign = "center"; ctx.font = `500 13px "Instrument Sans",system-ui,sans-serif`; ctx.fillText(state.error ? "Keine Live-Daten" : "Lädt …", cx, cy + this.hubR + 30); return; }

    // Sektoren
    const hovSec = this.hover?.kind === "sys" ? this.hover.id : null;
    for (const sec of this.sectors) {
      const col = C.sys[sec.s] || C.accent, has = sec.list.length > 0;
      const a1 = sec.a0 + (sec.a1 - sec.a0) * ease;
      const err = sec.list.some((n) => n.status === "error"), run = sec.list.some((n) => n.status === "running");
      ctx.save();
      if (run || hovSec === sec.s) { ctx.shadowColor = col; ctx.shadowBlur = 14 + (REDUCED ? 0 : 6 * Math.sin(t * 3)); }
      ctx.beginPath(); ctx.arc(cx, cy, R, sec.a0, a1); ctx.lineCap = "round";
      ctx.strokeStyle = rgba(col, has ? 0.95 : 0.35); ctx.lineWidth = hovSec === sec.s ? 8 : 6; ctx.stroke();
      ctx.restore();
      // zarte Sektorfläche bis zum Zellring
      ctx.beginPath(); ctx.arc(cx, cy, R - 4, sec.a0, a1); ctx.arc(cx, cy, R - 36, a1, sec.a0, true); ctx.closePath();
      ctx.fillStyle = rgba(col, hovSec === sec.s ? 0.14 : 0.06); ctx.fill();
      // Beschriftung außen, zur Seite ausgerichtet
      if (ease > 0.6 && !this.narrow) {
        const lr = R + 26, lx = cx + Math.cos(sec.mid) * lr, ly = cy + Math.sin(sec.mid) * lr, c = Math.cos(sec.mid);
        ctx.textAlign = c > 0.25 ? "left" : c < -0.25 ? "right" : "center";
        const s = Math.sin(sec.mid), dy = s < -0.6 ? -8 : s > 0.6 ? 12 : 0;
        ctx.globalAlpha = Math.min(1, (ease - 0.6) / 0.4);
        ctx.fillStyle = C.text; ctx.font = `600 ${this.narrow ? 11.5 : 13}px "Instrument Sans",system-ui,sans-serif`;
        ctx.fillText(SYS_NAME[sec.s], lx, ly + dy - 2);
        ctx.fillStyle = err ? C.err : C.muted; ctx.font = `500 ${this.narrow ? 10 : 11}px "JetBrains Mono",ui-monospace,monospace`;
        const cnt = sec.list.length, e = sec.list.filter((n) => n.status === "error").length;
        ctx.fillText(cnt ? `${cnt} Workflow${cnt > 1 ? "s" : ""}${e ? ` · ${e} Fehler` : ""}` : "nicht genutzt", lx, ly + dy + 12);
        ctx.globalAlpha = 1;
      }
    }

    // Sehnen: verifizierte Workflow-Kanten durch das Innere
    for (const e of this.snap.edges || []) {
      const a = this.cellOf[e.from], b = this.cellOf[e.to]; if (!a || !b) continue;
      const act = a.n.status === "running", k = 0.18;
      ctx.save(); ctx.setLineDash([3, 5]); ctx.lineDashOffset = -t * 18;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx + (a.x + b.x - 2 * cx) * k, cy + (a.y + b.y - 2 * cy) * k, b.x, b.y);
      ctx.strokeStyle = rgba(C.accent, (act ? 0.9 : 0.4) * ease); ctx.lineWidth = act ? 1.8 : 1.2; ctx.stroke(); ctx.restore();
    }

    // Lichtstrahlen laufender Workflows (Zelle → Kern)
    for (const c of this.cells) if (c.n.status === "running") {
      const rs = c.label ? this.labelR - c.labelW - 6 : this.R - 30;
      const sx = cx + Math.cos(c.ang) * rs, sy = cy + Math.sin(c.ang) * rs;
      const x0 = cx + Math.cos(c.ang) * this.hubR, y0 = cy + Math.sin(c.ang) * this.hubR;
      const g = ctx.createLinearGradient(sx, sy, x0, y0);
      g.addColorStop(0, rgba(C.run, 0.85)); g.addColorStop(1, rgba(C.run, 0.1));
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x0, y0); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.stroke();
      if (!REDUCED) for (let i = 0; i < 2; i++) {
        const u = (t * 1.2 + i / 2 + c.ang) % 1, px = sx + (x0 - sx) * u, py = sy + (y0 - sy) * u;
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, TAU); ctx.fillStyle = rgba(C.run, 0.9 * (1 - u * 0.6)); ctx.fill();
      }
    }

    // Abschluss-Pulse (Zelle → Kern) und Schockwellen vom Kern
    for (const f of this.fx) {
      if (f.type === "pulse") {
        const c = this.cellOf[f.id]; if (!c) continue;
        const u = Math.min(1, (t - f.t0) / 0.7); if (u >= 1) continue;
        const rs = c.label ? this.labelR - c.labelW - 6 : this.R - 30;
        const sx = cx + Math.cos(c.ang) * rs, sy = cy + Math.sin(c.ang) * rs;
        const x0 = cx + Math.cos(c.ang) * this.hubR, y0 = cy + Math.sin(c.ang) * this.hubR;
        for (let k = 0; k < 8; k++) {
          const uu = u - k * 0.03; if (uu < 0) break;
          ctx.beginPath(); ctx.arc(sx + (x0 - sx) * uu, sy + (y0 - sy) * uu, 3.6 - k * 0.35, 0, TAU);
          ctx.fillStyle = rgba(f.color, 1 - k / 8); ctx.fill();
        }
      } else if (f.type === "wave" && t >= f.t0) {
        const u = (t - f.t0) / 1.4; if (u >= 1) continue;
        ctx.beginPath(); ctx.arc(cx, cy, this.hubR + u * (R - 20 - this.hubR), 0, TAU);
        ctx.strokeStyle = rgba(f.color, 0.55 * (1 - u)); ctx.lineWidth = 3 * (1 - u) + 0.5; ctx.stroke();
      }
    }

    // Zellen
    const focusId = this.hover?.kind === "wf" ? this.hover.id : state.selected;
    const nCells = this.cells.length;
    this.cells.forEach((c, i) => {
      const appear = REDUCED ? 1 : Math.min(1, Math.max(0, (performance.now() - this.born - 500 - i * (900 / Math.max(1, nCells))) / 300));
      if (!appear) return;
      const st = c.n.status, col = { success: C.ok, error: C.err, running: C.run, waiting: C.warn }[st] || C.idle;
      const hot = focusId === c.n.id;
      const lit = !REDUCED && Math.abs(((normA(c.ang) - sweep + Math.PI * 3) % TAU) - Math.PI) < 0.14;
      const len = (hot ? 20 : 16) * appear, wid = hot ? c.w + 2 : c.w;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.ang);
      if (st === "running" || st === "error" || hot || lit) { ctx.shadowColor = col; ctx.shadowBlur = st === "error" ? 10 + 6 * Math.sin(t * 4) : 14; }
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-len / 2, -wid / 2, len, wid, wid / 2) : ctx.rect(-len / 2, -wid / 2, len, wid);
      if (st === "inactive") { ctx.fillStyle = C.surface; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = C.idle; ctx.stroke(); }
      else { ctx.fillStyle = lit && st !== "error" ? rgba(col, 1) : rgba(col, st === "idle" ? 0.6 : 0.92); ctx.fill(); }
      if (hot) { ctx.lineWidth = 1.5; ctx.strokeStyle = C.text; ctx.stroke(); }
      ctx.restore();
      if (c.label) {
        const right = Math.cos(c.ang) >= 0, w = c.labelW, h = this.pillH;
        ctx.save();
        ctx.translate(cx + Math.cos(c.ang) * this.labelR, cy + Math.sin(c.ang) * this.labelR);
        ctx.rotate(right ? c.ang : c.ang + Math.PI);
        ctx.globalAlpha = appear;
        const x0 = right ? -w : 0;
        const inactive = st === "inactive", idle = st === "idle" || inactive;
        // Kapsel: Statusfarbe als Tönung, kräftiger Rand bei Fehler/Lauf/Hover
        if (st === "running" || st === "error") { ctx.shadowColor = col; ctx.shadowBlur = st === "error" ? 8 + 4 * Math.sin(t * 4) : 12; }
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, -h / 2, w, h, h / 2) : ctx.rect(x0, -h / 2, w, h);
        ctx.fillStyle = idle ? rgba(C["surface-3"] || C.surface, 0.9) : rgba(col, hot || lit ? 0.34 : st === "success" ? 0.16 : 0.24);
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.lineWidth = hot ? 1.6 : 1;
        ctx.strokeStyle = hot ? C.text : inactive ? C.idle : rgba(col, st === "success" ? 0.45 : 0.8);
        if (inactive) ctx.setLineDash([3, 3]);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = this.labelFont;
        ctx.fillStyle = idle ? C.muted : C.text;
        ctx.fillText(c.label, x0 + w / 2, 0.5);
        ctx.restore();
      }
      if (hot) for (const u of c.n.uses || []) {
        const sec = this.sectors.find((s) => s.s === u); if (!sec || sec === c.sec) continue;
        const tx = cx + Math.cos(sec.mid) * (R - 4), ty = cy + Math.sin(sec.mid) * (R - 4);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.quadraticCurveTo(cx, cy, tx, ty);
        ctx.strokeStyle = rgba(C.sys[u] || C.accent, 0.8); ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
    });
    // Zünd-Blitz beim Start eines Laufs
    for (const f of this.fx) if (f.type === "ignite") {
      const c = this.cellOf[f.id]; if (!c) continue;
      const u = (t - f.t0) / 0.9; if (u >= 1) continue;
      ctx.beginPath(); ctx.arc(c.x, c.y, 6 + u * 26, 0, TAU); ctx.strokeStyle = rgba(C.run, 0.8 * (1 - u)); ctx.lineWidth = 2; ctx.stroke();
    }

    const running = this.snap.nodes.filter((n) => n.status === "running").length;
    this.drawHub(C, running, ease);
  }
  drawHub(C, running, ease = 1) {
    const ctx = this.ctx, cx = this.cx, cy = this.cy, r = this.hubR * (0.6 + 0.4 * ease), t = this.t;
    const flash = Math.max(0, ...this.fx.filter((f) => f.type === "wave" && t >= f.t0).map((f) => 1 - (t - f.t0) / 0.5));
    const breath = (REDUCED ? 0.5 : Math.sin(t * 1.6) * 0.5 + 0.5) + flash * 1.2;
    const g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * (2.4 + flash));
    g.addColorStop(0, rgba(C.sys.n8n, 0.45 + 0.15 * breath)); g.addColorStop(1, rgba(C.sys.n8n, 0));
    ctx.beginPath(); ctx.arc(cx, cy, r * (2.4 + flash), 0, TAU); ctx.fillStyle = g; ctx.fill();
    // rotierender Energiering
    if (ctx.createConicGradient) {
      const cg = ctx.createConicGradient(REDUCED ? 0 : t * 1.4, cx, cy);
      cg.addColorStop(0, rgba(C.sys.n8n, 0)); cg.addColorStop(0.7, rgba(C.sys.n8n, 0.2)); cg.addColorStop(1, rgba(C.sys.n8n, 1));
      ctx.beginPath(); ctx.arc(cx, cy, r + 7, 0, TAU); ctx.strokeStyle = cg; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = C.sys.n8n; ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(r * 0.56)}px "Bricolage Grotesque",system-ui,sans-serif`;
    ctx.fillText("n8n", cx, cy - (running ? r * 0.14 : 0));
    if (running) { ctx.font = `600 ${Math.max(9, Math.round(r * 0.22))}px "JetBrains Mono",ui-monospace,monospace`; ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillText(`${running} aktiv`, cx, cy + r * 0.34); }
    ctx.textBaseline = "alphabetic";
  }
  onMove(e) {
    const r = this.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 12;
    for (const c of this.cells) { const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = { kind: "wf", id: c.n.id, n: c.n }; } }
    if (!best) {
      const d = Math.hypot(x - this.cx, y - this.cy), a = normA(Math.atan2(y - this.cy, x - this.cx));
      if (d > this.R - 40 && d < this.R + 60) for (const sec of this.sectors) {
        const a0 = normA(sec.a0), w = sec.a1 - sec.a0;
        if (normA(a - a0) <= w) { best = { kind: "sys", id: sec.s }; break; }
      }
    }
    this.hover = best; this.canvas.classList.toggle("hot", best?.kind === "wf");
    if (!best) { hideTip(); return; }
    if (best.kind === "wf") {
      const n = best.n;
      showTip(e, `<b>${esc(n.name)}</b><div class="row"><span>Status</span><span>${SLABEL[n.status]}</span></div>
        <div class="row"><span>System</span><span>${SYS_NAME[n.system]}</span></div><div class="row"><span>Letzter Lauf</span><span>${rel(n.lastRunAt)}</span></div>
        <div class="row" style="margin-top:4px"><span>Klicken für Details</span><span></span></div>`);
    } else {
      const list = this.bySys?.[best.id] || [], cnt = (st) => list.filter((n) => n.status === st).length;
      showTip(e, `<b>${SYS_NAME[best.id]}</b><div class="row"><span>Workflows</span><span class="num">${list.length}</span></div>
        <div class="row"><span>Laufen gerade</span><span class="num">${cnt("running")}</span></div><div class="row"><span>Mit Fehler</span><span class="num">${cnt("error")}</span></div>`);
    }
  }
}

// ── Relative Zeiten sekündlich aktualisieren ──────────────────────────────────
function tickClock() {
  const c = $("#clock"); if (!c) return;
  const d = new Date();
  c.innerHTML = `${d.toLocaleTimeString("de-DE")}<small>${d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "short" })}</small>`;
}
setInterval(() => {
  tickClock();
  updateLive();
  document.querySelectorAll("[data-rel]").forEach((el) => { const v = el.dataset.rel; if (v) el.textContent = rel(v); });
}, 1000);
let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (state.view === "cockpit") { updateTimeline(); updateKpis(); } }, 150); });
new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => { if (state.view === "cockpit") { updateTimeline(); updateKpis(); } }, 150); }).observe(document.getElementById("main"));

// ── Daten ─────────────────────────────────────────────────────────────────────
function onData(d) {
  if (state.paused) return;
  state.snap = d.snapshot || state.snap; state.error = d.error || null; state.lastOkAt = d.lastOkAt || state.lastOkAt;
  beat(); update();
}
function connect() {
  const es = new EventSource("/events");
  es.addEventListener("snapshot", (ev) => { try { onData(JSON.parse(ev.data)); } catch { /* defektes Paket ignorieren */ } });
  es.onerror = () => { state.error = "Verbindung zum Dienst unterbrochen (neuer Versuch läuft)."; update(); };
}
function startDemo() {
  const go = () => window.CockpitDemo.start(onData);
  if (window.CockpitDemo) return go();
  const s = document.createElement("script"); s.src = "/demo.js"; s.onload = go; document.head.appendChild(s);
}

renderSchemes();
tickClock();
setView("cockpit");
if (DEMO) startDemo(); else connect();
