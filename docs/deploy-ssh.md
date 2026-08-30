# Deployment per SSH – Schritt für Schritt

Router (LiteLLM + Logging-DB) auf dem Hetzner-Server ausrollen. Alle Befehle auf
dem **Server** ausführen. Platzhalter `<...>` ersetzen.

---

## Schritt 0 – Auf den Server einloggen
```bash
ssh <user>@<server-ip>
```

## Schritt 1 – Repo holen
```bash
cd ~
git clone https://github.com/asb250171/KI-Hub.git ki-hub
cd ki-hub
git checkout claude/ki-hub-prozessautomatisierung-674tg8
```
> Falls schon geklont: `cd ~/ki-hub && git fetch origin && git checkout claude/ki-hub-prozessautomatisierung-674tg8 && git pull`

## Schritt 2 – Docker-Netz von n8n/Ollama ermitteln
Der Router muss ins **gleiche** Netz wie n8n und Ollama.
```bash
docker network ls
# Netz des n8n-Stacks finden, dann die Container darin anzeigen:
docker network inspect <netzname> --format '{{range .Containers}}{{.Name}} {{end}}'
```
Der richtige Netzname ist der, in dem `n8n` **und** `ollama` auftauchen. Merken.

## Schritt 3 – Lokales Modell prüfen (qwen2.5:3b)
```bash
docker exec ollama ollama list        # Container heißt evtl. anders
# fehlt qwen2.5:3b? -> nachladen:
docker exec ollama ollama pull qwen2.5:3b
```

## Schritt 4 – Zugangsdaten anlegen (.env)
```bash
cp .env.example .env

# Starke Geheimnisse erzeugen (Ausgabe notieren):
echo "LITELLM_MASTER_KEY=sk-$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"

nano .env
```
In `.env` eintragen:
- `HUB_NETWORK` = Netzname aus Schritt 2
- `LITELLM_MASTER_KEY` = der `sk-...`-Wert von oben  ← **diesen Wert brauchst du in Schritt 8 für n8n**
- `POSTGRES_PASSWORD` = der erzeugte Wert
- `ANTHROPIC_API_KEY` = dein vorhandener Anthropic-Key
- `OPENAI_API_KEY`, `GEMINI_API_KEY` = falls vorhanden (sonst leer lassen; Fallbacks greifen dann nur für vorhandene Anbieter)
- `OLLAMA_API_BASE` = i.d.R. `http://ollama:11434` (nur ändern, falls dein Ollama-Container anders heißt)

## Schritt 5 – Starten
```bash
docker compose up -d
docker compose ps
```

## Schritt 6 – Health-Check
```bash
curl -s http://127.0.0.1:4000/health/liveliness ; echo
# erwartet: {"status":"connected"} o.ä.
docker compose logs --tail=30 litellm
```

## Schritt 7 – Funktionstest (Router entscheidet + loggt)
`$MK` = dein LITELLM_MASTER_KEY.
```bash
MK="sk-DEIN_MASTER_KEY"

# 7a) Lokal (sensibel, ohne Cloud):
curl -s http://127.0.0.1:4000/v1/chat/completions \
  -H "Authorization: Bearer $MK" -H "Content-Type: application/json" \
  -d '{"model":"hub-private","messages":[{"role":"user","content":"Antworte nur mit: OK"}]}' ; echo

# 7b) Klassifikation (Cloud, günstig, mit Fallback):
curl -s http://127.0.0.1:4000/v1/chat/completions \
  -H "Authorization: Bearer $MK" -H "Content-Type: application/json" \
  -d '{"model":"hub-classify","messages":[{"role":"user","content":"Kategorie in einem Wort: Rechnung oder Angebot? Text: Zahlbar bis 30.9."}]}' ; echo

# 7c) Kosten/Modellwahl geloggt?
curl -s "http://127.0.0.1:4000/spend/logs" -H "Authorization: Bearer $MK" | head -c 800 ; echo
```
Beide Antworten sollten JSON mit `choices[0].message.content` liefern.

## Schritt 8 – n8n den Router-Key geben (LITELLM_KEY)
Die migrierten Workflows nutzen `{{ $env.LITELLM_KEY }}`. Der Wert = dein
`LITELLM_MASTER_KEY` (oder ein pro-Projekt erzeugter Key, s. Betriebshandbuch §5).

**n8n läuft per docker-compose** (Regelfall): in der n8n-`docker-compose.yml`
unter dem n8n-Service `environment:` ergänzen …
```yaml
    environment:
      - LITELLM_KEY=sk-DEIN_MASTER_KEY
```
… dann n8n neu erzeugen (Env wird nur beim (Re-)Create übernommen):
```bash
cd <n8n-compose-verzeichnis>
docker compose up -d --force-recreate n8n
```
> `docker restart n8n` reicht NICHT, wenn die Variable neu ist – `up -d` nutzen.

Erreichbarkeit prüfen (n8n → Router, gleiches Netz):
```bash
docker exec n8n sh -c 'wget -qO- http://litellm:4000/health/liveliness' ; echo
# leer/Fehler? Dann statt "litellm" den Container-Namen testen:
docker exec n8n sh -c 'wget -qO- http://kihub-litellm:4000/health/liveliness' ; echo
```
Löst nur `kihub-litellm` auf, in beiden migrierten Workflow-Nodes die URL auf
`http://kihub-litellm:4000/v1/chat/completions` setzen (sag mir Bescheid, ich
ändere das dann via n8n-MCP).

## Schritt 9 – Go-live
Erst **nach** grünem Health-Check + gesetztem `LITELLM_KEY`:
1. In n8n beide Workflows öffnen, je **einen Lauf testen**.
2. Ergebnisse prüfen (Teams-Meldungen / monday-Eintrag).
3. **Publizieren**.

> Sag mir, wenn Schritt 6/7 grün sind – dann teste ich beide Drafts live via
> n8n-MCP und gebe dir das OK zum Publizieren.

## Wartung / Rollback
```bash
docker compose logs -f litellm         # Live-Logs
docker compose pull && docker compose up -d   # LiteLLM aktualisieren
docker compose down                    # stoppen (DB-Volume bleibt erhalten)
```
Workflow-Rollback: in der n8n-Versionshistorie die vorherige Version wiederherstellen.
