# Live-Prozesse — eigenständiger Dienst (neben n8n)

Schlanker Node-Dienst (Zero-Dependency), der **direkt neben n8n** auf dem Hetzner-
Server läuft, die **n8n REST-API** liest und die Archify-Live-Ansicht per **SSE**
in Echtzeit ausliefert. Kein öffentlicher n8n-Webhook, kein API-Key im Browser.

## Warum getrennt vom Haupt-App-Deploy?
Die Haupt-App liegt auf Vercel; dieser Dienst läuft co-lokalisiert mit n8n, um
n8n intern (`http://n8n:5678`) anzusprechen — das ist die „wirklich live"-Variante
(schneller Poll + Push statt öffentlichem Webhook).

## Datenfluss
```
Browser ──(HTTPS, Basic-Auth)──> Caddy ──> live-dashboard :8080
                                              │  poll alle ~4s
                                              ▼
                                     n8n REST /api/v1 (X-N8N-API-KEY)
live-dashboard ──(SSE /events)──> Browser   (Push bei jedem Poll)
```

## Endpunkte
- `GET /` – Archify-UI (dark), Pan/Zoom, Sortierung, Filter, Vollbild, einklappbar
- `GET /events` – SSE-Stream (Snapshot bei Verbindung + bei jedem Poll)
- `GET /healthz` – JSON `{ ok, lastOkAt, ageMs, error }`

## Konfiguration (`.env`)
Siehe `.env.example`. Pflicht: `N8N_API_KEY` (n8n → Einstellungen → n8n API → Key).

## Deploy auf dem Hetzner-Server (Docker + Caddy)

1. **Dateien auf den Server** (dieser Ordner `services/live-dashboard/`), z. B. neben die n8n-`docker-compose.yml`.
2. **n8n API-Key** in n8n erstellen und in `.env` (`N8N_API_KEY=…`) setzen.
3. **Compose:** Inhalt aus `docker-compose.snippet.yml` in die bestehende n8n-Compose übernehmen (Servicename `n8n` ggf. anpassen, gleiches Netz).
4. **Bauen & starten:**
   ```bash
   docker compose up -d --build live-dashboard
   docker compose logs -f live-dashboard   # "listening on :8080 → n8n …"
   curl -s localhost:8080/healthz          # {"ok":true,...} sobald der erste Poll lief
   ```
5. **Caddy:** Block aus `Caddyfile.snippet` ins Caddyfile aufnehmen. Basic-Auth-Hash erzeugen:
   ```bash
   caddy hash-password --plaintext 'DEIN_PASSWORT'
   ```
   Hash eintragen, DNS-A-Record für `dashboard.compliancemanufaktur.online` auf den Server setzen, dann `caddy reload` (bzw. Caddy-Container neu laden). TLS holt Caddy automatisch.
6. **Aufrufen:** `https://dashboard.compliancemanufaktur.online` (Login = Basic-Auth).

## Sicherheit
- `N8N_API_KEY` bleibt serverseitig (nie im Browser/Log).
- Zugriff nur über Caddy + Basic-Auth; der Dienst selbst hat keinen öffentlichen Port (`expose`, nicht `ports`).
- Rein lesend: nutzt nur `GET /api/v1/workflows` und `GET /api/v1/executions`. Es werden keine Workflows verändert oder ausgelöst.

## Lokaler Test (optional)
```bash
N8N_API_URL=https://n8n.compliancemanufaktur.online N8N_API_KEY=xxxx node server.mjs
# http://localhost:8080
```

## Wartung
- Poll-Intervall/Umfang via `POLL_MS`, `MAX_EXEC`.
- Topologie (Systeme, verifizierte Kanten) in `topology.mjs` — Spiegel der App
  (`src/lib/live-processes`). Bei neuen belegten Verbindungen dort ergänzen.
