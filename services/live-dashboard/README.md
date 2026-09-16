# Live-Prozesse — eigenständiger Dienst (neben n8n)

Schlanker Node-Dienst (Zero-Dependency), der **direkt neben n8n** auf dem Hetzner-
Server läuft, den internen n8n-Webhook **`dashboard-status`** liest und die
Archify-Live-Ansicht per **SSE** in Echtzeit ausliefert. Kein n8n-REST-API-Key
nötig, kein Key im Browser.

## Warum getrennt vom Haupt-App-Deploy?
Die Haupt-App liegt auf Vercel; dieser Dienst läuft co-lokalisiert mit n8n, um
n8n intern (`http://n8n:5678`) anzusprechen — das ist die „wirklich live"-Variante
(schneller Poll + Push statt öffentlichem Webhook).

## Datenfluss
```
Browser ──(HTTPS, Basic-Auth)──> Caddy ──> live-dashboard :8080
                                              │  poll alle ~4s
                                              ▼
                          n8n Webhook /webhook/dashboard-status (X-Dashboard-Key)
                                    │ (fragt n8n-Postgres-DB ab)
live-dashboard ──(SSE /events)──> Browser   (Push bei jedem Poll)
```

## Endpunkte
- `GET /` – Archify-UI (dark), Pan/Zoom, Sortierung, Filter, Vollbild, einklappbar
- `GET /events` – SSE-Stream (Snapshot bei Verbindung + bei jedem Poll)
- `GET /healthz` – JSON `{ ok, lastOkAt, ageMs, error }`

## Konfiguration (`.env`)
Siehe `.env.example`. Pflicht: `DASHBOARD_API_KEY` (= `DASHBOARD_API_KEY` aus
Vercel; wird als Header `X-Dashboard-Key` an den Webhook gesendet). Ein
n8n-REST-API-Key wird **nicht** benötigt.

## Deploy auf dem Hetzner-Server (Docker + Caddy)

Vorausgesetzt: n8n + Caddy laufen bereits per Docker im Netz `n8n_default`
(Servicename `n8n`). Der Dienst ist ein **eigenständiges Compose-Projekt**
(`docker-compose.yml`), das sich an dieses externe Netz hängt — die produktive
n8n-Compose wird nicht verändert.

1. **Dateien holen** (dieses Repo/Branch klonen):
   ```bash
   git clone --branch claude/great-faraday-e6u5yx --single-branch \
     https://github.com/asb250171/KI-Hub.git ~/live-dashboard-src
   cd ~/live-dashboard-src/services/live-dashboard
   ```
2. **`.env` anlegen** und den vorhandenen Dashboard-Key eintragen
   (identisch mit `DASHBOARD_API_KEY` aus Vercel):
   ```bash
   cp .env.example .env
   nano .env    # DASHBOARD_API_KEY=… setzen; DASHBOARD_URL bleibt der interne Webhook
   ```
3. **Bauen & starten:**
   ```bash
   docker compose up -d --build
   docker compose logs --tail=30 live-dashboard   # "listening on :8080 → …dashboard-status"
   docker run --rm --network n8n_default curlimages/curl -s http://live-dashboard:8080/healthz
   # → {"ok":true,...} sobald der erste Poll lief
   ```
4. **Caddy:** Subdomain-Block ins bestehende Caddyfile aufnehmen. Basic-Auth-Hash erzeugen:
   ```bash
   docker exec n8n-caddy-1 caddy hash-password --plaintext 'DEIN_PASSWORT'
   ```
   Block (Hash einsetzen, Nutzername frei):
   ```
   dashboard.compliancemanufaktur.online {
       encode zstd gzip
       basic_auth {
           dashboard   <HASH>
       }
       reverse_proxy live-dashboard:8080 {
           flush_interval -1
       }
   }
   ```
   DNS-A-Record für `dashboard.compliancemanufaktur.online` auf die Server-IP
   setzen, dann Caddy neu laden (`docker exec n8n-caddy-1 caddy reload --config /etc/caddy/Caddyfile`).
   TLS holt Caddy automatisch.
5. **Aufrufen:** `https://dashboard.compliancemanufaktur.online` (Login = Basic-Auth).

**Update später:** `cd ~/live-dashboard-src && git pull && cd services/live-dashboard && docker compose up -d --build`.

## Sicherheit
- `DASHBOARD_API_KEY` bleibt serverseitig (nie im Browser/Log).
- Zugriff nur über Caddy + Basic-Auth; der Dienst selbst hat keinen öffentlichen Port (`expose`, nicht `ports`).
- Rein lesend: ruft nur den `dashboard-status`-Webhook per `GET` ab. Es werden keine Workflows verändert oder ausgelöst.

## Lokaler Test (optional)
```bash
DASHBOARD_URL=https://n8n.compliancemanufaktur.online/webhook/dashboard-status \
DASHBOARD_API_KEY=xxxx node server.mjs
# http://localhost:8080
```

## Wartung
- Poll-Intervall via `POLL_MS`.
- Topologie (Systeme, verifizierte Kanten) in `topology.mjs` — Spiegel der App
  (`src/lib/live-processes`). Bei neuen belegten Verbindungen dort ergänzen.
