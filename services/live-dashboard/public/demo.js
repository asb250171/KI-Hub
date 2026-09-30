// Demo-Datenquelle für die Vorschau (?demo in der URL). Erzeugt fortlaufend
// Snapshots im selben Format wie der Dienst (/events) — klar als Demo markiert,
// wird im Live-Betrieb nie automatisch verwendet.
(function () {
  const WF = [
    ["1arLMpHurxNcAP8a", "Steuerpult – Tagesplanung Recherche", "n8n", [], null],
    ["GNrm6VBQ68keRexR", "P8NEX – KI-Agent Lead-Recherche", "claude", ["claude", "extern", "hubspot"], "Claude Sonnet 5 · recherchiert Leads und reicht sie am Intake-Webhook ein."],
    ["nxIlvg9LynNHqkAB", "HubSpot – Lead-Intake v2", "hubspot", ["hubspot"], "Hostet den Intake-Webhook p8nex/intake-v2; Suppression- & Cool-down-Prüfung."],
    ["NoHlGdl8WRn0PGbD", "Dokumenten-Digitalisierung Outlook → SharePoint", "m365", ["m365", "claude"], "Outlook → OCR → Claude Haiku (Klassifizierung) → SharePoint."],
    ["MLwEfFwAHKQWW0rx", "Tokenverbrauch & Kosten je Agent", "claude", ["claude"], null],
    ["gnKu9jqUGWmiPcin", "HubSpot – Double-Opt-in Versand", "hubspot", ["hubspot"], null],
    ["D5XceoxMic8dNAFf", "HubSpot – Opt-in Bestätigung", "hubspot", ["hubspot"], null],
    ["d1", "HubSpot – Leadscore Berechnung", "hubspot", [], null],
    ["d2", "HubSpot – Firmendaten Anreicherung", "hubspot", ["extern"], null],
    ["d3", "HubSpot – Bounce-Verarbeitung", "hubspot", [], null],
    ["d4", "HubSpot – Löschfristen & Aufbewahrung", "hubspot", [], null],
    ["d5", "HubSpot – Ticket-Routing Support", "hubspot", [], null],
    ["d6", "HubSpot – Opt-out Stopp-Liste", "hubspot", [], null],
    ["d7", "monday.com – Projekt-Sync", "monday", ["hubspot"], null],
    ["d8", "monday.com – Board-Reporting", "monday", [], null],
    ["d9", "Stripe – Rabattcode-Einlösung", "stripe", ["hubspot"], null],
    ["d10", "Stripe – Zahlungseingang verbuchen", "stripe", [], null],
    ["d11", "SharePoint – Ablage MFP-Scans", "m365", [], null],
    ["d12", "Outlook – Posteingang Klassifizierung", "m365", ["claude"], null],
    ["d13", "Dashboard API – Live Workflow Status", "n8n", [], null],
    ["d14", "Funnel-Reporting wöchentlich", "n8n", ["hubspot"], null],
    ["d15", "KI-Agent – Wettbewerbs-Recherche", "claude", ["extern"], null],
    ["d16", "Archiv – Alt-Import Kontakte", "hubspot", [], null],
  ];
  const EDGES = [
    { from: "1arLMpHurxNcAP8a", to: "GNrm6VBQ68keRexR", label: "Aufruf", kind: "executeWorkflow" },
    { from: "GNrm6VBQ68keRexR", to: "nxIlvg9LynNHqkAB", label: "Lead-Intake", kind: "webhook" },
    { from: "gnKu9jqUGWmiPcin", to: "D5XceoxMic8dNAFf", label: "Bestätigungslink", kind: "doi" },
  ];
  const HOUR = 3600e3;
  const rnd = (a, b) => a + Math.random() * (b - a);
  let seq = 1000;
  const now = () => Date.now();
  // Verlauf der letzten 24 h vorbelegen.
  const execs = [];
  const t0 = now() - 24 * HOUR;
  for (let t = t0; t < now() - 60e3; t += rnd(2, 9) * 60e3) {
    const w = WF[Math.floor(Math.random() * (WF.length - 1))];
    const hr = new Date(t).getHours();
    if ((hr < 6 || hr > 21) && Math.random() < 0.7) continue;
    const dur = rnd(0.4, w[2] === "claude" ? 90 : 12) * 1000;
    execs.push({ id: String(seq++), workflowId: w[0], status: Math.random() < 0.06 ? "error" : "success", startedAt: new Date(t).toISOString(), stoppedAt: new Date(t + dur).toISOString() });
  }
  // Ein offener Fehler, damit „Braucht Aufmerksamkeit" etwas zeigt.
  execs.push({ id: String(seq++), workflowId: "d3", status: "error", startedAt: new Date(now() - 7 * 60e3).toISOString(), stoppedAt: new Date(now() - 7 * 60e3 + 3200).toISOString() });
  const running = new Map();

  function mapStatus(s) { return s === "crashed" ? "error" : s === "new" ? "waiting" : s; }

  function snapshot() {
    const latest = new Map(), counts = new Map();
    for (const ex of execs) {
      counts.set(ex.workflowId, (counts.get(ex.workflowId) || 0) + 1);
      const cur = latest.get(ex.workflowId);
      if (!cur || ex.startedAt > cur.startedAt) latest.set(ex.workflowId, ex);
    }
    const nodes = WF.map(([id, name, system, uses, note]) => {
      const active = id !== "d16";
      const ex = latest.get(id);
      return { id, name, system, active, updatedAt: new Date(now() - (id.length * 7919 % 40) * 86400e3).toISOString(),
        status: ex ? mapStatus(ex.status) : active ? "idle" : "inactive", lastRunAt: ex ? ex.startedAt : null, lastStoppedAt: ex ? ex.stoppedAt : null,
        execCount: counts.get(id) || 0, uses, note };
    });
    const start0 = Math.floor(now() / HOUR) * HOUR - 23 * HOUR;
    const timeline = Array.from({ length: 24 }, (_, i) => ({ t: new Date(start0 + i * HOUR).toISOString(), success: 0, error: 0, other: 0 }));
    for (const ex of execs) {
      const t = new Date(ex.startedAt).getTime(); if (t < start0) continue;
      const b = timeline[Math.min(23, Math.floor((t - start0) / HOUR))];
      if (ex.status === "success") b.success++; else if (ex.status === "error") b.error++; else b.other++;
    }
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const recent = [...execs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 30).map((ex) => ({
      id: ex.id, workflowId: ex.workflowId, name: byId[ex.workflowId].name, system: byId[ex.workflowId].system, status: mapStatus(ex.status),
      startedAt: ex.startedAt, stoppedAt: ex.stoppedAt, durationMs: ex.stoppedAt ? new Date(ex.stoppedAt) - new Date(ex.startedAt) : null,
    }));
    const ok = timeline.reduce((a, b) => a + b.success, 0), er = timeline.reduce((a, b) => a + b.error, 0);
    return {
      generatedAt: new Date().toISOString(), nodes, edges: EDGES, timeline, recent,
      kpis: {
        workflowsTotal: nodes.length, workflowsActive: nodes.filter((n) => n.active).length,
        running: nodes.filter((n) => n.status === "running").length, success: nodes.filter((n) => n.status === "success").length,
        failed: nodes.filter((n) => n.status === "error").length, waiting: nodes.filter((n) => n.status === "waiting").length,
        runs24h: timeline.reduce((a, b) => a + b.success + b.error + b.other, 0), errors24h: er, successRate24h: ok + er ? ok / (ok + er) : null,
      },
    };
  }

  function tick() {
    // Laufende Ausführungen beenden.
    for (const [id, ex] of running) {
      if (now() >= ex._end) {
        ex.status = Math.random() < 0.07 ? "error" : "success";
        ex.stoppedAt = new Date().toISOString();
        running.delete(id);
      }
    }
    // Neue starten (Kette Steuerpult → Recherche → Intake bevorzugt).
    const starts = Math.random() < 0.75 ? 1 + (Math.random() < 0.3 ? 1 : 0) : 0;
    for (let i = 0; i < starts; i++) {
      const w = Math.random() < 0.25 ? WF[Math.floor(Math.random() * 3)] : WF[Math.floor(Math.random() * (WF.length - 1))];
      if ([...running.values()].some((r) => r.workflowId === w[0])) continue;
      const ex = { id: String(seq++), workflowId: w[0], status: "running", startedAt: new Date().toISOString(), stoppedAt: null, _end: now() + rnd(2.5, 11) * 1000 };
      execs.push(ex); running.set(ex.id, ex);
    }
  }

  window.CockpitDemo = {
    start(onData) {
      const push = () => onData({ snapshot: snapshot(), error: null, lastOkAt: new Date().toISOString() });
      tick(); push();
      setInterval(() => { tick(); push(); }, 3000);
    },
  };
})();
