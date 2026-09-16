// Eigenständiger Live-Prozesse-Dienst (Option C) — läuft neben n8n auf dem
// Hetzner-Server. Liest die n8n REST-API (serverseitig, API-Key bleibt hier),
// baut den Snapshot und pusht ihn per SSE an den Browser. Zero-Dependency
// (nur Node-Builtins, global fetch ab Node 18).

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { buildSnapshot } from "./topology.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "public");

const PORT = Number(process.env.PORT || 8080);
const N8N_API_URL = (process.env.N8N_API_URL || "http://n8n:5678").replace(/\/+$/, "");
const N8N_API_KEY = process.env.N8N_API_KEY || "";
const POLL_MS = Math.max(2000, Number(process.env.POLL_MS || 4000));
const MAX_EXEC = Number(process.env.MAX_EXEC || 200);

// ── n8n REST ────────────────────────────────────────────────────────────────
async function n8nGet(path) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${N8N_API_URL}${path}`, {
      headers: { "X-N8N-API-KEY": N8N_API_KEY, accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`n8n ${path} → HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(to);
  }
}

async function fetchAll(path, cap) {
  const out = [];
  let cursor = "";
  for (let i = 0; i < 20; i++) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const json = await n8nGet(url);
    if (Array.isArray(json?.data)) out.push(...json.data);
    cursor = json?.nextCursor || "";
    if (!cursor || (cap && out.length >= cap)) break;
  }
  return cap ? out.slice(0, cap) : out;
}

// ── State + Poll-Loop ─────────────────────────────────────────────────────────
let snapshot = null;
let lastError = null;
let lastOkAt = null;
const clients = new Set();

function broadcast() {
  const payload = JSON.stringify({ snapshot, error: lastError, lastOkAt });
  for (const res of clients) {
    try { res.write(`event: snapshot\ndata: ${payload}\n\n`); } catch { /* client weg */ }
  }
}

async function poll() {
  try {
    if (!N8N_API_KEY) throw new Error("N8N_API_KEY ist nicht gesetzt.");
    const [workflows, executions] = await Promise.all([
      fetchAll("/api/v1/workflows", 500),
      fetchAll("/api/v1/executions?includeData=false", MAX_EXEC),
    ]);
    snapshot = buildSnapshot(workflows, executions);
    lastError = null;
    lastOkAt = new Date().toISOString();
  } catch (e) {
    lastError = String(e?.message || e);
    // snapshot bleibt (letzter Stand); kein stiller Fallback auf Fake-Daten.
  }
  broadcast();
}

// ── Static + SSE Server ───────────────────────────────────────────────────────
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

async function serveStatic(res, file) {
  try {
    const buf = await readFile(join(PUBLIC, file));
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (path === "/healthz") {
    const ageMs = lastOkAt ? Date.now() - new Date(lastOkAt).getTime() : null;
    const ok = !!snapshot && !!lastOkAt;
    res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok, lastOkAt, ageMs, error: lastError }));
    return;
  }

  if (path === "/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    res.write("retry: 5000\n\n");
    res.write(`event: snapshot\ndata: ${JSON.stringify({ snapshot, error: lastError, lastOkAt })}\n\n`);
    clients.add(res);
    const hb = setInterval(() => { try { res.write(": hb\n\n"); } catch { /* noop */ } }, 25000);
    req.on("close", () => { clearInterval(hb); clients.delete(res); });
    return;
  }

  if (path === "/" || path === "") return serveStatic(res, "index.html");
  if (path === "/app.js") return serveStatic(res, "app.js");
  res.writeHead(404); res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`[live-dashboard] listening on :${PORT} → n8n ${N8N_API_URL} (poll ${POLL_MS}ms)`);
  poll();
  setInterval(poll, POLL_MS);
});
