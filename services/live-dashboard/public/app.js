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
    orbit = new Orbit($("#orbitWrap"), (id) => openDrawer(id));
    main.querySelectorAll(".enter").forEach((el, i) => (el.style.animationDelay = `${i * 70}ms`));
  } else wireWorkflows();
  update(true);
}

function cockpitShell() {
  return `<div class="view">
    <div id="banner"></div>
    <section class="hero">
      <div class="card pulse-card enter" id="pulse">
        <div class="ring" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="ring-track" cx="60" cy="60" r="52"/><circle class="ring-val" id="ringVal" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="326.7"/></svg>
          <div class="ring-c"><b id="ringNum">—</b><span>Erfolg · 24 h</span></div></div>
        <div><div class="eyebrow">Lagebild</div><h1 class="headline" id="headline">Verbinde mit n8n …</h1>
          <div class="subline" id="subline">Die Live-Daten erscheinen nach der ersten Abfrage.</div></div>
      </div>
      <div class="kpis">
        ${kpiShell("k-active", "Aktive Workflows", "--accent")}
        ${kpiShell("k-running", "Laufen gerade", "--run")}
        ${kpiShell("k-runs", "Läufe · 24 h", "--accent")}
        ${kpiShell("k-err", "Fehler · 24 h", "--err")}
      </div>
    </section>
    <section class="stage">
      <div class="card orbit-card enter">
        <div class="card-h"><h2>Systemlandschaft</h2><span class="meta" id="orbitMeta">Live · Datenfluss nach n8n</span></div>
        <div class="orbit-wrap" id="orbitWrap"></div>
        <div class="orbit-legend" id="orbitLegend">
          <span><i style="background:var(--ok)"></i>Erfolgreich</span><span><i style="background:var(--err)"></i>Fehler</span>
          <span><i style="background:var(--run)"></i>Läuft</span><span><i style="background:var(--warn)"></i>Wartet</span>
          <span><i style="background:var(--idle)"></i>Bereit</span><span><i class="ring-i"></i>Inaktiv</span></div>
      </div>
      <div class="card feed-card enter">
        <div class="card-h"><h2>Live-Aktivität</h2><span class="meta">letzte Ausführungen</span></div>
        <ul class="feed" id="feed" aria-live="polite"></ul>
      </div>
    </section>
    <section class="lower">
      <div class="card enter">
        <div class="card-h"><h2>Läufe der letzten 24 Stunden</h2><span class="meta" id="tlMeta"></span></div>
        <div class="legend" id="tlLegend"></div>
        <div class="chart" id="timeline"></div>
      </div>
      <div class="card enter">
        <div class="card-h"><h2>Braucht Aufmerksamkeit</h2><span class="meta" id="attnMeta"></span></div>
        <div id="attn"></div>
      </div>
    </section>
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
  const hasOther = tl.some((b) => b.other);
  $("#tlLegend").innerHTML = `<span><i style="background:var(--ok)"></i>Erfolgreich</span><span><i style="background:var(--err)"></i>Fehler</span>${hasOther ? `<span><i style="background:var(--idle)"></i>Laufend / wartend</span>` : ""}`;
  const tot = tl.reduce((a, b) => a + b.success + b.error + b.other, 0);
  const peak = tl.reduce((m, b, i) => (b.success + b.error + b.other > m.v ? { v: b.success + b.error + b.other, i } : m), { v: 0, i: 0 });
  $("#tlMeta").textContent = `${nf.format(tot)} Läufe · Spitze ${new Date(tl[peak.i].t).getHours()}:00 Uhr`;
  const W = host.clientWidth - 36 || 600, H = 210, ml = 30, mr = 4, mt = 8, mb = 24;
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
    svg += `<g class="col" data-i="${i}"><rect class="bar-hit" x="${ml + i * cw}" y="${mt}" width="${cw}" height="${ph}" rx="6"/>${g}
      ${i % 6 === 0 || last ? `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" ${last ? 'style="fill:var(--text)"' : ""}>${last ? "jetzt" : String(hr).padStart(2, "0") + ":00"}</text>` : ""}</g>`;
  });
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ausführungen pro Stunde in den letzten 24 Stunden">${svg}</svg>`;
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

// ── Tooltip ───────────────────────────────────────────────────────────────────
function showTip(e, html) {
  const t = $("#tip"); t.innerHTML = html; t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight;
  const x = e.clientX + w + 24 > innerWidth ? e.clientX - w - 24 : e.clientX;
  const y = e.clientY + h + 24 > innerHeight ? e.clientY - h - 24 : e.clientY;
  t.style.left = x + "px"; t.style.top = y + "px";
}
function hideTip() { $("#tip").hidden = true; }

// ── Orbit: Systemlandschaft als lebendige Karte ───────────────────────────────
// n8n im Zentrum, alle anderen Systeme auf einer Ellipse. Workflows kreisen als
// Punkte um ihr System (Farbe = Status). Partikel zeigen den Datenfluss nach
// n8n; neue Läufe starten als Komet, Abschlüsse lösen eine Welle aus.
class Orbit {
  constructor(wrap, onPick) {
    this.wrap = wrap; this.onPick = onPick;
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Systemlandschaft: n8n im Zentrum, Workflows kreisen um ihre Systeme.");
    wrap.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.t = 0; this.last = performance.now(); this.born = performance.now();
    this.fx = []; this.dots = []; this.sysPos = {}; this.prev = new Map(); this.hover = null; this.alive = true;
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
    this.draw();
  }
  setData(snap) {
    this.snap = snap; if (!snap) return;
    const bySys = {}; snap.nodes.forEach((n) => (bySys[n.system] = bySys[n.system] || []).push(n));
    const used = new Set(snap.nodes.flatMap((n) => n.uses || []));
    this.systems = SYSTEMS.filter((s) => s !== "n8n" && (bySys[s]?.length || used.has(s)));
    this.bySys = bySys;
    // Ereignisse aus dem Vergleich mit dem letzten Stand ableiten.
    if (this.prev.size && !REDUCED) {
      for (const n of snap.nodes) {
        const p = this.prev.get(n.id); if (!p) continue;
        if (n.status === "running" && p.status !== "running") this.fx.push({ type: "comet", sys: n.system, dir: -1, t0: this.t, color: colors.run });
        else if (p.status === "running" && n.status !== "running" || (n.lastRunAt !== p.lastRunAt && n.status !== "running")) {
          this.fx.push({ type: "ripple", id: n.id, t0: this.t, color: n.status === "error" ? colors.err : colors.ok });
          this.fx.push({ type: "comet", sys: n.system, dir: 1, t0: this.t, color: n.status === "error" ? colors.err : colors.sys[n.system] || colors.accent });
        }
      }
    }
    this.prev = new Map(snap.nodes.map((n) => [n.id, { status: n.status, lastRunAt: n.lastRunAt }]));
    const meta = $("#orbitMeta");
    if (meta) meta.textContent = `${this.systems.length + 1} Systeme · ${snap.nodes.length} Workflows`;
  }
  layout() {
    const W = this.W, H = this.H, cx = W / 2, cy = H / 2;
    const intro = REDUCED ? 1 : Math.min(1, (performance.now() - this.born) / 1400), ease = 1 - Math.pow(1 - intro, 4);
    const rx = Math.max(80, Math.min(W * 0.38, W / 2 - (W < 600 ? 62 : 90))) * ease, ry = Math.max(70, Math.min(H * 0.36, H / 2 - 92)) * ease;
    this.rx = rx; this.ry = ry;
    this.hub = { x: cx, y: cy, r: Math.max(24, Math.min(36, Math.min(W, H) * 0.07)) };
    this.sysPos = {};
    const k = this.systems?.length || 0;
    (this.systems || []).forEach((s, i) => {
      const a = -Math.PI / 2 + (i / k) * Math.PI * 2 + Math.PI / k;
      const cnt = this.bySys?.[s]?.length || 0;
      this.sysPos[s] = { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, r: 13 + Math.sqrt(cnt) * 3.2, a };
    });
    this.sysPos.n8n = this.hub;
    // Workflow-Punkte auf Umlaufbahnen um ihr System.
    this.dots = [];
    for (const [s, list] of Object.entries(this.bySys || {})) {
      const c = this.sysPos[s]; if (!c) continue;
      const perRing = s === "n8n" ? 10 : 8;
      list.forEach((n, i) => {
        const ring = Math.floor(i / perRing), idx = i % perRing, inRing = Math.min(perRing, list.length - ring * perRing);
        const R = c.r + 14 + ring * 12;
        const speed = (s === "n8n" ? 0.12 : 0.18) * (ring % 2 ? -1 : 1);
        const a = (idx / inRing) * Math.PI * 2 + this.t * speed + (c.a || 0);
        this.dots.push({ n, x: c.x + Math.cos(a) * R * ease, y: c.y + Math.sin(a) * R * ease });
      });
    }
  }
  step(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (!REDUCED && !state.paused) this.t += dt;
    this.fx = this.fx.filter((f) => this.t - f.t0 < 1.6);
    this.draw();
  }
  curve(a, b, bend = 0.12) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
    return { a, b, c: { x: mx - dy * bend, y: my + dx * bend } };
  }
  at(q, u) {
    const v = 1 - u;
    return { x: v * v * q.a.x + 2 * v * u * q.c.x + u * u * q.b.x, y: v * v * q.a.y + 2 * v * u * q.c.y + u * u * q.b.y };
  }
  draw() {
    const ctx = this.ctx, W = this.W, H = this.H; if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    this.layout();
    const C = colors, t = this.t, hub = this.hub;
    // Führungsellipse
    ctx.save(); ctx.setLineDash([2, 6]); ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    if (this.rx > 1) { ctx.beginPath(); ctx.ellipse(hub.x, hub.y, this.rx, this.ry, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    if (!this.snap) {
      this.drawHub(C); ctx.fillStyle = C.muted; ctx.font = `500 13px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = "center";
      ctx.fillText(state.error ? "Keine Live-Daten" : "Lädt …", hub.x, hub.y + hub.r + 26); return;
    }
    // Verbindungen System → n8n mit Datenfluss-Partikeln
    for (const s of this.systems) {
      const p = this.sysPos[s], col = C.sys[s] || C.accent, q = this.curve(p, hub);
      const list = this.bySys[s] || [];
      const running = list.filter((n) => n.status === "running").length;
      const recent = list.filter((n) => n.lastRunAt && Date.now() - new Date(n.lastRunAt) < 15 * 60e3).length;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(q.c.x, q.c.y, hub.x, hub.y);
      ctx.strokeStyle = rgba(col, running ? 0.55 : list.length ? 0.28 : 0.12); ctx.lineWidth = running ? 2 : 1.2; ctx.stroke();
      const nP = REDUCED ? 0 : Math.min(9, running * 3 + recent);
      for (let i = 0; i < nP; i++) {
        const u = (t * (0.18 + running * 0.08) + i / nP) % 1, pt = this.at(q, u);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, running ? 2.4 : 1.8, 0, Math.PI * 2);
        ctx.fillStyle = rgba(col, 0.35 + 0.6 * Math.sin(u * Math.PI)); ctx.fill();
      }
    }
    // Verifizierte Workflow-Kanten
    const dotOf = Object.fromEntries(this.dots.map((d) => [d.n.id, d]));
    for (const e of this.snap.edges || []) {
      const a = dotOf[e.from], b = dotOf[e.to]; if (!a || !b) continue;
      const q = this.curve(a, b, 0.25), act = a.n.status === "running";
      ctx.save(); ctx.setLineDash([4, 5]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(q.c.x, q.c.y, b.x, b.y);
      ctx.strokeStyle = rgba(C.accent, act ? 0.9 : 0.45); ctx.lineWidth = act ? 1.8 : 1.2; ctx.stroke(); ctx.restore();
    }
    // Hervorhebung: genutzte Systeme des gewählten/überfahrenen Workflows
    const focusId = this.hover?.kind === "wf" ? this.hover.id : state.selected;
    const fd = focusId && dotOf[focusId];
    if (fd) for (const u of fd.n.uses || []) {
      const p = this.sysPos[u]; if (!p) continue;
      ctx.beginPath(); ctx.moveTo(fd.x, fd.y); ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = rgba(C.sys[u] || C.accent, 0.7); ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    // Kometen (Start: n8n → System, Abschluss: System → n8n)
    for (const f of this.fx) if (f.type === "comet") {
      const p = this.sysPos[f.sys]; if (!p || p === hub) continue;
      const q = f.dir > 0 ? this.curve(p, hub) : this.curve(hub, p, -0.12);
      const u = Math.min(1, (t - f.t0) / 1.1);
      for (let k = 0; k < 10; k++) {
        const uu = u - k * 0.025; if (uu < 0) break;
        const pt = this.at(q, uu); ctx.beginPath(); ctx.arc(pt.x, pt.y, 4 - k * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = rgba(f.color, (1 - k / 10) * (1 - Math.max(0, u - 0.85) / 0.15)); ctx.fill();
      }
    }
    // Systemknoten
    for (const s of this.systems) {
      const p = this.sysPos[s], col = C.sys[s] || C.accent, list = this.bySys[s] || [];
      const running = list.some((n) => n.status === "running"), err = list.some((n) => n.status === "error");
      const hot = this.hover?.kind === "sys" && this.hover.id === s;
      ctx.save();
      if (running || hot) { ctx.shadowColor = col; ctx.shadowBlur = 18 + (REDUCED ? 0 : 8 * Math.sin(t * 3)); }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(col, list.length ? 0.2 : 0.08); ctx.fill();
      ctx.lineWidth = hot ? 2.5 : 1.5; ctx.strokeStyle = rgba(col, list.length ? 0.95 : 0.4); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(4, p.r * 0.34), 0, Math.PI * 2); ctx.fillStyle = rgba(col, list.length ? 1 : 0.4); ctx.fill();
      if (err) { ctx.beginPath(); ctx.arc(p.x + p.r * 0.72, p.y - p.r * 0.72, 4.5, 0, Math.PI * 2); ctx.fillStyle = C.err; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.surface; ctx.stroke(); }
      const rMax = p.r + 14 + (Math.ceil((list.length || 1) / 8) - 1) * 12 + 6;
      const ly = p.y >= hub.y - 4 ? p.y + rMax + 14 : p.y - rMax - 22;
      ctx.textAlign = "center"; ctx.fillStyle = C.text; ctx.font = `600 12.5px "Instrument Sans",system-ui,sans-serif`;
      ctx.fillText(SYS_NAME[s], p.x, ly);
      ctx.fillStyle = C.muted; ctx.font = `500 11px "JetBrains Mono",ui-monospace,monospace`;
      ctx.fillText(list.length ? `${list.length} Workflow${list.length > 1 ? "s" : ""}` : "nicht genutzt", p.x, ly + 14);
    }
    this.drawHub(C);
    // Workflow-Punkte
    for (const d of this.dots) {
      const st = d.n.status, col = { success: C.ok, error: C.err, running: C.run, waiting: C.warn }[st] || C.idle;
      const hot = focusId === d.n.id, r = hot ? 6.5 : 4.6;
      if (st === "running" || st === "error") {
        const ph = REDUCED ? 0.5 : (t * (st === "running" ? 1.4 : 0.7)) % 1;
        ctx.beginPath(); ctx.arc(d.x, d.y, r + 2 + ph * 10, 0, Math.PI * 2); ctx.strokeStyle = rgba(col, 0.6 * (1 - ph)); ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      if (st === "inactive") { ctx.lineWidth = 1.5; ctx.strokeStyle = C.idle; ctx.fillStyle = C.surface; ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.surface; ctx.stroke(); }
      if (hot) { ctx.beginPath(); ctx.arc(d.x, d.y, r + 4, 0, Math.PI * 2); ctx.strokeStyle = C.text; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    // Wellen bei abgeschlossenen Läufen
    for (const f of this.fx) if (f.type === "ripple") {
      const d = dotOf[f.id]; if (!d) continue;
      const u = (t - f.t0) / 1.6;
      ctx.beginPath(); ctx.arc(d.x, d.y, 6 + u * 34, 0, Math.PI * 2); ctx.strokeStyle = rgba(f.color, 0.8 * (1 - u)); ctx.lineWidth = 2.5 * (1 - u) + 0.5; ctx.stroke();
    }
  }
  drawHub(C) {
    const ctx = this.ctx, h = this.hub, t = this.t;
    const breath = REDUCED ? 0 : Math.sin(t * 1.6) * 0.5 + 0.5;
    const g = ctx.createRadialGradient(h.x, h.y, h.r * 0.4, h.x, h.y, h.r * 2.6);
    g.addColorStop(0, rgba(C.sys.n8n, 0.35 + 0.15 * breath)); g.addColorStop(1, rgba(C.sys.n8n, 0));
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 2.6, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fillStyle = C.sys.n8n; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = rgba(C.sys.n8n, 0.35); ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 5 + breath * 2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(h.r * 0.62)}px "Bricolage Grotesque",system-ui,sans-serif`; ctx.fillText("n8n", h.x, h.y + 1);
    ctx.textBaseline = "alphabetic";
  }
  onMove(e) {
    const r = this.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 13;
    for (const d of this.dots) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = { kind: "wf", id: d.n.id, n: d.n }; } }
    if (!best) for (const s of [...(this.systems || []), "n8n"]) { const p = this.sysPos[s]; if (p && Math.hypot(p.x - x, p.y - y) < p.r + 4) best = { kind: "sys", id: s }; }
    this.hover = best; this.canvas.classList.toggle("hot", best?.kind === "wf");
    if (!best) { hideTip(); return; }
    if (best.kind === "wf") {
      const n = best.n;
      showTip(e, `<b>${esc(n.name)}</b><div class="row"><span>Status</span><span>${SLABEL[n.status]}</span></div>
        <div class="row"><span>System</span><span>${SYS_NAME[n.system]}</span></div><div class="row"><span>Letzter Lauf</span><span>${rel(n.lastRunAt)}</span></div>
        <div class="row" style="margin-top:4px"><span>Klicken für Details</span><span></span></div>`);
    } else {
      const list = this.bySys[best.id] || [], cnt = (st) => list.filter((n) => n.status === st).length;
      showTip(e, `<b>${SYS_NAME[best.id]}</b><div class="row"><span>Workflows</span><span class="num">${list.length}</span></div>
        <div class="row"><span>Laufen gerade</span><span class="num">${cnt("running")}</span></div><div class="row"><span>Mit Fehler</span><span class="num">${cnt("error")}</span></div>`);
    }
  }
}

// ── Relative Zeiten sekündlich aktualisieren ──────────────────────────────────
setInterval(() => {
  updateLive();
  document.querySelectorAll("[data-rel]").forEach((el) => { const v = el.dataset.rel; if (v) el.textContent = rel(v); });
}, 1000);
let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (state.view === "cockpit") { updateTimeline(); updateKpis(); } }, 150); });

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
setView("cockpit");
if (DEMO) startDemo(); else connect();
