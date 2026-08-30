# Betriebshandbuch – KI-Hub Router

Praxisanleitung zum Deployen, Betreiben, Überwachen und Erweitern des LiteLLM-
Gateways auf dem Hetzner-Server.

## 1. Voraussetzungen
- Zugriff auf den Hetzner-Server (SSH), Docker + Docker-Compose installiert.
- Laufendes n8n + Ollama im Docker-Netz (Name ermitteln, s. u.).
- API-Keys: Anthropic (vorhanden), OpenAI, Google Gemini.

## 2. Erst-Deployment (Schritt für Schritt)
```bash
# 1) Repo auf den Server holen
git clone <REPO-URL> ki-hub && cd ki-hub

# 2) Docker-Netz des bestehenden Setups ermitteln
docker network ls
#    -> z. B. "n8n_default" merken

# 3) Umgebungsdatei anlegen und ausfüllen
cp .env.example .env
#    HUB_NETWORK = ermittelter Netzname
#    LITELLM_MASTER_KEY = "sk-$(openssl rand -hex 32)"
#    POSTGRES_PASSWORD  = "$(openssl rand -hex 24)"
#    ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY eintragen
nano .env

# 4) Starten
docker compose up -d

# 5) Gesundheit prüfen
docker compose ps
curl -s http://127.0.0.1:4000/health/liveliness
```

## 3. Funktionstest (Beweis, dass Routing lebt)
```bash
# Lokales Modell (sensibel, ohne Cloud):
curl -s http://127.0.0.1:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"hub-private","messages":[{"role":"user","content":"Sag kurz Hallo."}]}'

# Klassifikation (günstiges Cloud-Modell mit Fallback):
curl -s http://127.0.0.1:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"hub-classify","messages":[{"role":"user","content":"Kategorisiere: Rechnung oder Angebot? Text: ..."}]}'
```

## 4. Kosten & Modellwahl auswerten (Einsparung belegen)
LiteLLM protokolliert jeden Request (Modell, Tokens, Kosten) in Postgres.
```bash
# Ausgaben-Report der letzten 30 Tage:
curl -s "http://127.0.0.1:4000/spend/report" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY"

# Einzel-Logs (Modell + Kosten pro Request):
curl -s "http://127.0.0.1:4000/spend/logs" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY"
```
Auswertung z. B.: Anteil lokal (0 €) vs. Cloud, Kosten pro Vorgang, Trend.
Damit lässt sich gegenüber „immer Frontier-Modell" die Ersparnis zeigen.

## 5. Kunden-/Projekt-Budgets (virtuelle Keys)
Pro Kunde einen eigenen Key mit Budget anlegen – so ist die Kostenkontrolle
mandantenfähig:
```bash
curl -s http://127.0.0.1:4000/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key_alias":"kunde-mustermann","max_budget":50,"budget_duration":"30d",
       "models":["hub-classify","hub-extract","hub-private"]}'
```
Der zurückgegebene `sk-...`-Key kommt in die n8n-Credentials des Kundenprojekts.

## 6. Modelle aktualisieren (z. B. auf neuere Claude-Generation)
1. In `router/litellm-config.yaml` die betreffende `model:`-Zeile ändern
   (z. B. konkrete neue Modell-ID statt `-latest`).
2. `bash scripts/validate.sh` (lokal, prüft Syntax & Logik).
3. `docker compose up -d` (LiteLLM lädt Config neu).

## 7. Neuen Anbieter/Modell hinzufügen
1. Key in `.env` + `docker-compose.yml` (environment) ergänzen.
2. Eintrag unter `model_list` hinzufügen, ggf. in `router_settings.fallbacks`.
3. Validieren, neu deployen.

## 8. Betrieb & Wartung
- **Logs:** `docker compose logs -f litellm`
- **Neustart:** `docker compose restart litellm`
- **Update LiteLLM:** `docker compose pull && docker compose up -d`
- **Backup:** Postgres-Volume `litellm_pgdata` sichern (Spend-Historie).

## 9. Troubleshooting
| Symptom | Ursache / Lösung |
|---|---|
| `network hub not found` | `HUB_NETWORK` in `.env` falsch → `docker network ls` |
| 401 bei Aufruf | falscher/kein `LITELLM_MASTER_KEY` im Header |
| Ollama-Fehler | `OLLAMA_API_BASE` prüfen; Modell geladen? `ollama list` |
| Cloud-Modell 4xx | Key fehlt/ungültig in `.env`; Kontingent/Rate-Limit |
| Antwort langsam | großes lokales Modell/Kaltstart; Timeout in Config prüfen |
