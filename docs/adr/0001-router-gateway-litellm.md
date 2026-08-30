# ADR 0001 – Router als LiteLLM-Gateway (statt Eigenbau oder n8n-Subworkflow)

- **Status:** Angenommen (2026-08-30)
- **Entscheider:** Andreas Schulte-Beckmann

## Kontext
Das KI-Hub braucht eine zentrale Schicht, die pro Aufgabe das passende Modell
wählt (lokal vs. Cloud, günstig vs. stark), mit Fallback, Kosten-Logging und
Datenschutz-Steuerung. Drei Optionen standen zur Wahl: (a) LiteLLM-Gateway,
(b) n8n-nativer Router-Subworkflow, (c) Eigenentwicklung als Microservice.

## Entscheidung
Wir nutzen **LiteLLM** als eigenständigen Proxy/Gateway-Dienst.

## Begründung
- LiteLLM bietet **out-of-the-box**: einheitliche OpenAI-kompatible API,
  Fallback-Ketten, Retries, Timeouts, virtuelle Keys, Budgets und
  **Spend-/Token-Logging** in Postgres. Genau die geforderten Punkte aus
  Abschnitt 4 des Projektauftrags – ohne Eigencode.
- **Ein Endpunkt** für n8n; neue Anbieter/Modelle = Config-Änderung, kein
  Workflow-Umbau → maximale Wiederverwendbarkeit für neue Kundenprojekte.
- Anbieter-agnostisch (Anthropic, OpenAI, Gemini, Ollama, Mistral …).

## Verworfene Alternativen
- **n8n-Subworkflow:** Fallback, Budget und Kosten-Tracking müssten selbst
  gebaut und in jedem Projekt gepflegt werden. Mehr Logik, mehr Wartung,
  schlechter wiederverwendbar. → abgelehnt.
- **Eigenentwicklung:** Höchster Bau-/Wartungsaufwand, dupliziert nur, was
  LiteLLM bereits leistet. Overkill für den Start. → abgelehnt.

## Konsequenzen
- Ein zusätzlicher Dienst (+ kleine Postgres-DB) auf Hetzner.
- Team muss LiteLLM-Config verstehen (dokumentiert in `routing-matrix.md`
  und `betriebshandbuch.md`).
- Bei Bedarf später erweiterbar um Auto-Klassifikator (ADR 0003).
