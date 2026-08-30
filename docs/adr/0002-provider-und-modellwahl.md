# ADR 0002 – Anbieter- und Modellwahl

- **Status:** Angenommen (2026-08-30)
- **Entscheider:** Andreas Schulte-Beckmann

## Kontext
Welche Anbieter binden wir an, und welches Standardmodell bekommt jede
Aufgabenklasse? Ziel: bestes Preis-Leistungs-Verhältnis pro Aufgabe.

## Entscheidung
Angebunden werden **Ollama (lokal), Anthropic, OpenAI und Google Gemini**.
Standardmodelle je Aufgabe siehe `router/routing-matrix.md`.

Leitlinien:
- **Sensibel/einfach/billig → lokal** (`qwen2.5:3b`, 0 € Tokenkosten).
- **Klassifikation/Zusammenfassung → Claude Haiku** (günstig, robust, bereits
  im Einsatz beim Workflow „Dokumenten-Digitalisierung").
- **Extraktion/Übersetzung → Gemini 1.5 Flash** (großes Kontextfenster, sehr
  günstig).
- **Generierung/Reasoning/Code → Claude Sonnet** (nur wenn nötig), Fallback GPT-4o.

## Begründung
- Anthropic ist bereits produktiv (Key vorhanden) → kein Reibungsverlust.
- Gemini Flash und GPT-4o-mini liefern für Massen-Aufgaben sehr niedrige
  Tokenpreise und dienen zugleich als **Anbieter-Fallback** (Ausfallsicherheit).
- Mehrere Anbieter = Redundanz gegen Rate-Limits/Ausfälle.

## Konsequenzen
- Neue Keys/AV-Verträge für OpenAI und Google nötig (Datenschutz s. ADR 0003).
- Modell-IDs via `-latest` gepflegt; Upgrade auf neuere Generationen (z. B.
  Claude-5-Familie) = eine Zeile in `litellm-config.yaml` (Betriebshandbuch).
- **Mistral (EU)** ist bewusst zurückgestellt; nachrüstbar, falls strengere
  EU-Cloud-Residenz gefordert wird.
