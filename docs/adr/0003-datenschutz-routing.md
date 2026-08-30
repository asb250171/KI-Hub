# ADR 0003 – Datenschutz-Routing (DSGVO)

- **Status:** Angenommen (2026-08-30), Ausbaustufe 2 geplant
- **Entscheider:** Andreas Schulte-Beckmann

## Kontext
Als Compliance-Dienstleister ist DSGVO-Konformität ein Verkaufsargument, kein
Nebenaspekt. Manche Kundendaten dürfen die eigene Infrastruktur nicht verlassen.

## Entscheidung
**Zweistufiges Datenschutz-Routing:**

1. **MVP (heute): explizites Flag über Alias-Wahl.**
   - Sensible/personenbezogene Inhalte → **`hub-private`**. Dieses Alias hat in
     `litellm-config.yaml` **bewusst keinen Cloud-Fallback** – der Request kann
     die lokale Ollama-Instanz technisch nicht verlassen. Vom Validierungs-
     Skript wird das erzwungen (`scripts/validate.sh`).
   - Verantwortung: der aufrufende Workflow wählt das korrekte Alias.

2. **Ausbaustufe 2 (optional): automatischer PII-Wächter.**
   - Ein vorgeschalteter lokaler Klassifikationsschritt (`hub-private`) prüft
     den Prompt auf personenbezogene Daten und **überschreibt** die Modellwahl
     auf lokal, wenn PII erkannt wird. Damit ist Datenschutz nicht mehr von der
     Disziplin des Workflow-Bauers abhängig.

## Begründung
- Technische Garantie schlägt Prozess-Disziplin: „kein Cloud-Fallback" ist eine
  harte, testbare Grenze.
- Lokale Verarbeitung = keine Auftragsverarbeitung mit Drittanbietern nötig.

## Konsequenzen
- Für Cloud-Aliase sind **AV-Verträge** mit Anthropic/OpenAI/Google
  abzuschließen und in `docs/datenschutz.md` zu dokumentieren.
- Lokale Modelle sind kleiner (qwen2.5:3b) → bei anspruchsvollen sensiblen
  Aufgaben ggf. größeres lokales Modell nachrüsten (z. B. qwen2.5:14b), sofern
  Hetzner-Hardware es trägt (VRAM prüfen).
- Ausbaustufe 2 erfordert einen zusätzlichen Workflow-Baustein (Aufwand gering).
