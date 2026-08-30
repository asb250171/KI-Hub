# KI-Hub – Architektur

## Vision in einem Satz
Ein zentrales Gateway, das für **jede Automatisierungs-Aufgabe automatisch das
günstigste tragfähige KI-Modell** wählt – lokal für Sensibles/Billiges, Cloud
für Anspruchsvolles – und dabei Modellwahl, Tokens und Kosten protokolliert.

## Bausteine (alle auf dem Hetzner-Server, ein Docker-Netz)

```
                       ┌────────────────────────────────────────────┐
                       │                HETZNER-SERVER               │
                       │            (ein Docker-Netz: "hub")         │
   Kunde/Prozess       │                                            │
   ───────────►  ┌─────┴─────┐   Alias-Aufruf   ┌──────────────────┐ │
   (E-Mail,      │   n8n     │ ───────────────► │  LiteLLM Gateway │ │
    Webhook,     │ Workflows │  z.B."hub-classify" │  (Router-Kern) │ │
    Formular)    └─────┬─────┘ ◄─────────────── └───────┬──────────┘ │
                       │          Antwort               │            │
                       │                    ┌───────────┼──────────┐ │
                       │                    ▼           ▼          ▼ │
                       │              ┌─────────┐  ┌─────────┐ ┌────────────┐
                       │              │ Ollama  │  │Anthropic│ │OpenAI /    │
                       │              │qwen2.5  │  │ Claude  │ │Gemini(Cloud)│
                       │              │(lokal)  │  └─────────┘ └────────────┘
                       │              └─────────┘                     │
                       │                    ▲                         │
                       │              ┌─────┴──────┐  Kosten/Tokens    │
                       │              │ Postgres   │◄── pro Request ───┘
                       │              │(Spend-Logs)│                   │
                       │              └────────────┘                   │
                       └────────────────────────────────────────────┘
```

## Warum LiteLLM (statt Eigenbau)?
- **Ein OpenAI-kompatibler Endpunkt** für alle Anbieter → n8n kennt nur eine URL.
- **Fallback-Ketten, Retries, Timeouts, Budgets, Spend-Logging** sind eingebaut
  → minimaler Eigencode, „schlankste tragfähige Variante".
- Anbieter-agnostisch: neuer Anbieter = wenige Zeilen Config, kein Workflow-Umbau.
- Vollständige ADR-Begründung: `adr/0001-router-gateway-litellm.md`.

## Die zwei Ebenen der „Intelligenz"
1. **Alias-Ebene (heute, MVP):** Der Workflow wählt ein *semantisches Alias*
   (`hub-classify`, `hub-private`, …). Das Gateway mappt es auf das günstigste
   Modell inkl. Fallback. Deckt Aufgaben-Klassifizierung, Kosten, Datenschutz-
   Flag, Fallback und Logging vollständig ab.
2. **Auto-Klassifikator (Ausbaustufe 2, optional):** Ein vorgeschalteter
   lokaler Mini-LLM-Schritt bestimmt Aufgabentyp + PII-Flag automatisch und
   wählt das Alias. Siehe `adr/0003-datenschutz-routing.md`.

## Datenfluss eines Vorgangs
1. Trigger (E-Mail-Eingang, Webhook, Zeitplan) startet n8n-Workflow.
2. Workflow baut Prompt + wählt Alias nach Aufgabe/Datenschutz.
3. `POST http://litellm:4000/v1/chat/completions` mit `model: "<alias>"`.
4. Gateway wählt Modell, ruft Anbieter, bei Fehler → Fallback.
5. Antwort zurück an n8n; Modell/Tokens/Kosten → Postgres.
6. Workflow verarbeitet Ergebnis weiter (SharePoint, monday.com, Lexware …).

## Verzeichnisstruktur
```
KI-Hub/
├── docker-compose.yml          # LiteLLM + Postgres, bindet ans bestehende Netz
├── .env.example                # Key-Vorlage (echte Keys nur lokal in .env)
├── router/
│   ├── litellm-config.yaml     # Herzstück: Provider, Aliase, Fallbacks, Logging
│   └── routing-matrix.md       # Fachliche Entscheidungsmatrix Aufgabe→Modell
├── docs/
│   ├── architecture.md         # dieses Dokument
│   ├── adr/                    # Architektur-Entscheidungen (Begründungen)
│   ├── betriebshandbuch.md     # Deployment, Betrieb, Kosten, Troubleshooting
│   └── datenschutz.md          # DSGVO-Mapping
├── n8n/
│   └── router-usage.md         # So rufen Workflows den Router auf (+ Beispiel)
└── scripts/validate.sh         # Lokale Config-Validierung (Beweis)
```

## Bekannte Annahmen (zu bestätigen)
- **A1** Bestehendes n8n/Ollama läuft in einem Docker-Netz (Name → `.env HUB_NETWORK`).
- **A2** Budget-Standard: 200 €/Monat global (anpassbar, Betriebshandbuch).
- **A3** Kunden greifen vorerst **nur über n8n-Webhooks im Hintergrund** zu
  (kein eigenes Portal im MVP).
- **A4** EU-Datenresidenz bevorzugt; sensible Daten grundsätzlich lokal.
