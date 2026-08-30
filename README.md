# KI-Hub – Prozessautomatisierung mit intelligentem Modell-Routing

Zentrale Plattform, die auf **n8n** aufbaut und für **jede Aufgabe automatisch
das günstigste tragfähige KI-Modell** wählt – lokal (Ollama) für Sensibles/
Billiges, Cloud (Anthropic/OpenAI/Gemini) für Anspruchsvolles – mit Fallback,
Datenschutz-Steuerung und Kosten-Logging.

## Herzstück: LiteLLM-Gateway
Ein OpenAI-kompatibler Endpunkt vor allen Anbietern. n8n-Workflows rufen nur
ein **semantisches Alias** auf (`hub-classify`, `hub-private`, `hub-reason`…);
welches Modell dahinter steckt, entscheidet zentral `router/litellm-config.yaml`.

```
n8n  ──"hub-classify"──►  LiteLLM Gateway  ──►  günstigstes Modell (+ Fallback)
                                │
                                └──►  Postgres: Modell, Tokens, Kosten pro Vorgang
```

## Schnellstart (auf dem Hetzner-Server)
```bash
cp .env.example .env        # Keys + HUB_NETWORK eintragen
docker compose up -d        # LiteLLM + Logging-DB starten
curl http://127.0.0.1:4000/health/liveliness
```
Vollständige Anleitung: [`docs/betriebshandbuch.md`](docs/betriebshandbuch.md).

## Lokal validieren (vor Deployment)
```bash
bash scripts/validate.sh    # YAML + Routing-Logik + Secrets-Hygiene
```

## Dokumentation
| Thema | Datei |
|---|---|
| Architektur & Datenfluss | [`docs/architecture.md`](docs/architecture.md) |
| Entscheidungsmatrix Aufgabe→Modell | [`router/routing-matrix.md`](router/routing-matrix.md) |
| Deployment per SSH (Schritt für Schritt) | [`docs/deploy-ssh.md`](docs/deploy-ssh.md) |
| Betrieb, Kosten, Budgets, Troubleshooting | [`docs/betriebshandbuch.md`](docs/betriebshandbuch.md) |
| DSGVO-Mapping | [`docs/datenschutz.md`](docs/datenschutz.md) |
| n8n-Workflows anbinden | [`n8n/router-usage.md`](n8n/router-usage.md) |
| Architektur-Entscheidungen (ADRs) | [`docs/adr/`](docs/adr/) |

## Status
- ✅ MVP „Router-Kern + Logging": IaC + Config + Doku, lokal validiert.
- ⬜ Deployment auf Hetzner (durch dich, Befehle im Betriebshandbuch).
- ⬜ Ausbaustufe 2: automatischer PII-Wächter (ADR 0003).

## Angebundene Systeme (bereits vorhanden)
n8n · Ollama (`qwen2.5:3b`) · SearXNG · monday.com · Microsoft 365 (Outlook/
SharePoint/Teams) · Lexware Office · GitHub · SFTP/IMAP.
