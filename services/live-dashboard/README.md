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

## Oberfläche: Prozess-Cockpit
- **Cockpit**: Lagebild mit 24-h-Erfolgsquote und Status-Satz, Kennzahlen mit Sparklines,
  **Radial-Leitstand** (n8n im Kern, jedes System ein fester Ringsektor, Workflows als
  geordnete Zellen in Statusfarbe; Radar-Sweep, Lichtstrahlen laufender Prozesse,
  Schockwelle bei Abschlüssen, Workflow-Kanten als Sehnen),
  Live-Feed der letzten Ausführungen, 24-h-Zeitleiste, „Braucht Aufmerksamkeit" und „Aktivste Workflows".
- **Leitstand-Layout**: Ab 1280×720 füllt das Cockpit genau einen Bildschirm (links Lage +
  Kennzahlen, Mitte Radial-Leitstand, rechts Live-Aktivität, unten Zeitleiste + Aufmerksamkeit).
  **TV-Modus** (`F` / Vollbild-Knopf) blendet Bedienelemente aus und zeigt eine große Uhr.
  Ereignis-Meldungen unter dem Ring zeigen jeden Start und Abschluss.
- **Workflows**: Suche, Filter nach System und Status, sortierbare Tabelle.
- **Detail-Schublade** je Workflow mit Verbindungen, letzten Läufen und Link nach n8n.
- **Studio-Design** (Standard): tiefschwarzer, filmischer Leitstand-Look mit LED-Raster,
  leuchtenden Pillen-Balken (Läufe) samt Fehlerlinie, Lichtkante unter den Kennzahlen,
  Veränderungs-Pills (letzte 12 h ggü. den 12 h davor), Seitenleiste mit Systemen,
  Pfad-Navigation, `⌘K`-Suche, Glocke für offene Fehler und Verlaufs-Knopf „Neuer Workflow“ (öffnet n8n).
- **Vier Farbschemata**: Studio (Standard, dunkel), Polarnacht (dunkel, kühl), Kupfer (dunkel, warm),
  Porzellan (hell). Bei hellem System-Theme startet Porzellan; die Wahl wird im Browser gespeichert.
- **Tastatur**: `/` oder `Strg+K` Suche · `1`/`2` Ansicht · `T` Farbschema · `P` Pause · `F` TV-Modus · `Esc` schließen.
- **Demo**: `/?demo` zeigt simulierte Daten (klar markiert) — zum Ausprobieren ohne n8n.
- Schriften sind selbst gehostet (`public/fonts`, kein Google-Fonts-Abruf).

## Endpunkte
- `GET /` – Prozess-Cockpit (siehe oben); statische Dateien über eine feste Whitelist
- `GET /events` – SSE-Stream (Snapshot bei Verbindung + bei jedem Poll; enthält
  `nodes`, `edges`, `kpis`, `timeline` (24 Stunden-Buckets) und `recent` (letzte 30 Ausführungen))
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

1. **Dateien holen** (Branch `main` dieses Repos klonen):
   ```bash
   git clone --branch main --single-branch \
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

**Bestehender Klon auf einem alten Feature-Branch** (z. B. `claude/great-faraday-e6u5yx`) — einmalig auf `main` umstellen:
```bash
cd ~/live-dashboard-src
git remote set-branches origin main && git fetch origin
git checkout -B main origin/main
cd services/live-dashboard && docker compose up -d --build
```

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
- Anzeigezeitraum: das Cockpit zeigt nur Läufe der **letzten 24 Stunden** (`WINDOW_MS` in `topology.mjs`).
  Die eigenen Abfragen des Workflows „Dashboard API - Live Workflow Status“ werden ausgeblendet
  (`SELF_WORKFLOW_ID`). Der Webhook liefert dazu alle Ausführungen der letzten 24 h statt nur der letzten 50.
- Topologie (Systeme, verifizierte Kanten) in `topology.mjs` — Spiegel der App
  (`src/lib/live-processes`). Bei neuen belegten Verbindungen dort ergänzen.
