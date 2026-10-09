// Systeme, verifizierte Topologie und Snapshot-Aufbau — gespiegelt aus der
// Next.js-App (src/lib/live-processes), damit die eigenständige Live-Ansicht
// dieselbe Darstellung nutzt. Reine Daten/Logik, keine Secrets.

export const SYSTEMS = [
  { id: "hubspot", name: "HubSpot" },
  { id: "n8n", name: "n8n" },
  { id: "claude", name: "Claude" },
  { id: "openai", name: "ChatGPT / OpenAI" },
  { id: "m365", name: "Microsoft 365" },
  { id: "monday", name: "monday.com" },
  { id: "stripe", name: "Stripe" },
  { id: "extern", name: "Externe Quellen" },
];

export function systemOfWorkflow(name) {
  const n = String(name || "").toLowerCase();
  if (/dashboard|steuerpult|reporting|funnel/.test(n)) return "n8n";
  if (/monday/.test(n)) return "monday";
  if (/dokumenten-digitalisierung|sharepoint|outlook|mfp/.test(n)) return "m365";
  if (/ki-agent|recherche|tokenverbrauch|kosten/.test(n)) return "claude";
  if (/stripe|rabattcode-einlösung|einloesung/.test(n)) return "stripe";
  if (/hubspot|anreicherung|leadscore|scoring|firmendaten|opt-in|opt-out|kontaktaufnahme|kontakte|firmen|rabattcode|pipeline|datenmodell|felder|ticket|lösch|aufbewahrung|stopp|antwort|bounce/.test(n)) return "hubspot";
  return "n8n";
}

export const WORKFLOW_USES = {
  GNrm6VBQ68keRexR: ["claude", "extern", "hubspot"],
  NoHlGdl8WRn0PGbD: ["m365", "claude"],
  nxIlvg9LynNHqkAB: ["hubspot"],
  MLwEfFwAHKQWW0rx: ["claude"],
};

export const WORKFLOW_NOTE = {
  GNrm6VBQ68keRexR: "Claude Sonnet 5 · recherchiert Leads und reicht sie am Intake-Webhook ein.",
  nxIlvg9LynNHqkAB: "Hostet den Intake-Webhook p8nex/intake-v2; Suppression- & Cool-down-Prüfung.",
  NoHlGdl8WRn0PGbD: "Outlook → OCR → Claude Haiku (Klassifizierung) → SharePoint.",
};

// Verifizierte Kanten (Workflow-IDs).
export const REAL_EDGES = [
  { from: "1arLMpHurxNcAP8a", to: "GNrm6VBQ68keRexR", label: "Aufruf", kind: "executeWorkflow" },
  { from: "GNrm6VBQ68keRexR", to: "nxIlvg9LynNHqkAB", label: "Lead-Intake", kind: "webhook" },
  { from: "gnKu9jqUGWmiPcin", to: "D5XceoxMic8dNAFf", label: "Bestätigungslink", kind: "doi" },
];

function isInternal(name) {
  return String(name).startsWith("TEMP") || String(name).includes("(löschbar)");
}

function mapStatus(s) {
  switch (s) {
    case "success": return "success";
    case "error":
    case "crashed": return "error";
    case "running": return "running";
    case "waiting":
    case "new": return "waiting";
    case "canceled": return "idle";
    default: return "unknown";
  }
}

/**
 * Baut den Snapshot aus n8n-REST-Daten.
 * @param {Array} workflows  n8n /workflows data[] (id, name, active, updatedAt, tags)
 * @param {Array} executions n8n /executions data[] (id, workflowId, status, startedAt, stoppedAt)
 */
// Workflow "Dashboard API - Live Workflow Status": wird vom Dienst selbst alle
// paar Sekunden abgefragt — seine Läufe sind reines Rauschen und werden nicht angezeigt.
export const SELF_WORKFLOW_ID = "0QlSXZTZBeNy6Wff";

// Anzeigezeitraum des Dashboards.
export const WINDOW_MS = 24 * 3600e3;

export function buildSnapshot(workflows, allExecutions) {
  // Nur Läufe der letzten 24 Stunden anzeigen (ohne die eigenen Abfragen).
  const since = Date.now() - WINDOW_MS;
  const executions = (allExecutions || []).filter((ex) =>
    ex.workflowId !== SELF_WORKFLOW_ID &&
    new Date(ex.startedAt || ex.stoppedAt || 0).getTime() >= since);
  const visible = (workflows || []).filter((w) => !isInternal(w.name));

  const latest = new Map();
  const counts = new Map();
  for (const ex of executions || []) {
    const wid = ex.workflowId;
    counts.set(wid, (counts.get(wid) || 0) + 1);
    const cur = latest.get(wid);
    const t = new Date(ex.startedAt || ex.stoppedAt || 0).getTime();
    if (!cur || t > cur._t) latest.set(wid, { ...ex, _t: t });
  }

  const nodes = visible.map((w) => {
    const ex = latest.get(w.id);
    let status;
    if (ex) status = mapStatus(ex.status || (ex.finished ? "success" : "running"));
    else status = w.active ? "idle" : "inactive";
    return {
      id: w.id,
      name: w.name,
      system: systemOfWorkflow(w.name),
      active: !!w.active,
      updatedAt: w.updatedAt || null,
      status,
      lastRunAt: ex ? ex.startedAt || null : null,
      lastStoppedAt: ex ? ex.stoppedAt || null : null,
      execCount: counts.get(w.id) || 0,
      uses: WORKFLOW_USES[w.id] || [],
      note: WORKFLOW_NOTE[w.id] || null,
    };
  });

  const present = new Set(nodes.map((n) => n.id));
  const edges = REAL_EDGES.filter((e) => present.has(e.from) && present.has(e.to));

  // Zeitleiste: Läufe der letzten 24 Stunden in Stunden-Buckets.
  const HOUR = 3600e3;
  const now = Date.now();
  const start0 = Math.floor(now / HOUR) * HOUR - 23 * HOUR;
  const timeline = Array.from({ length: 24 }, (_, i) => ({
    t: new Date(start0 + i * HOUR).toISOString(), success: 0, error: 0, other: 0,
  }));
  const byNode = new Map(nodes.map((n) => [n.id, n]));
  const recentAll = [];
  for (const ex of executions || []) {
    if (!byNode.has(ex.workflowId)) continue;
    const t = new Date(ex.startedAt || ex.stoppedAt || 0).getTime();
    const st = mapStatus(ex.status || (ex.finished ? "success" : "running"));
    if (t >= start0 && t <= now + HOUR) {
      const b = timeline[Math.min(23, Math.floor((t - start0) / HOUR))];
      if (st === "success") b.success++; else if (st === "error") b.error++; else b.other++;
    }
    recentAll.push({ ex, t, st });
  }
  // Letzte Ausführungen für den Aktivitäts-Feed.
  const recent = recentAll
    .sort((a, b) => b.t - a.t)
    .slice(0, 30)
    .map(({ ex, st }) => {
      const n = byNode.get(ex.workflowId);
      const s = ex.startedAt ? new Date(ex.startedAt).getTime() : null;
      const e = ex.stoppedAt ? new Date(ex.stoppedAt).getTime() : null;
      return {
        id: String(ex.id ?? `${ex.workflowId}-${ex.startedAt}`),
        workflowId: ex.workflowId,
        name: n.name,
        system: n.system,
        status: st,
        startedAt: ex.startedAt || null,
        stoppedAt: ex.stoppedAt || null,
        durationMs: s && e && e >= s ? e - s : null,
      };
    });

  const runs24h = timeline.reduce((a, b) => a + b.success + b.error + b.other, 0);
  const errors24h = timeline.reduce((a, b) => a + b.error, 0);
  const ok24h = timeline.reduce((a, b) => a + b.success, 0);

  const kpis = {
    workflowsTotal: nodes.length,
    workflowsActive: nodes.filter((n) => n.active).length,
    running: nodes.filter((n) => n.status === "running").length,
    success: nodes.filter((n) => n.status === "success").length,
    failed: nodes.filter((n) => n.status === "error").length,
    waiting: nodes.filter((n) => n.status === "waiting").length,
    runs24h,
    errors24h,
    successRate24h: ok24h + errors24h > 0 ? ok24h / (ok24h + errors24h) : null,
  };

  return { generatedAt: new Date().toISOString(), nodes, edges, kpis, timeline, recent };
}
