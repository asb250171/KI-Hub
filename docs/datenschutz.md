# DSGVO-Mapping – KI-Hub

> **Standard-Annahmen** (mangels finaler Vorgaben – bitte bestätigen/anpassen).
> Markiert mit ⚠️.

## Grundsatz
Datensparsamkeit und lokale Verarbeitung, wo immer möglich. Cloud nur mit
Rechtsgrundlage und Auftragsverarbeitungsvertrag (AVV/DPA).

## Datenklassen & Routing
| Datenklasse | Beispiele | Verarbeitung | Alias |
|---|---|---|---|
| **Sensibel / personenbezogen** | Namen, Verträge, Personaldaten, Gesundheits-/Finanzdaten | **nur lokal** | `hub-private` |
| **Intern, nicht personenbezogen** | interne Notizen, generische Klassifikation | lokal bevorzugt | `hub-local` |
| **Unkritisch / öffentlich** | öffentliche Firmendaten, Web-Rechercheergebnisse | Cloud erlaubt | Aufgaben-Alias |

Technische Garantie: `hub-private` hat **keinen Cloud-Fallback** – erzwungen
durch `scripts/validate.sh`. Siehe ADR 0003.

## Auftragsverarbeitung (AVV/DPA) ⚠️
Für jeden Cloud-Anbieter ist ein AVV abzuschließen und hier zu verlinken:
- [ ] Anthropic – AVV Status: _offen/erledigt_, EU-Datenverarbeitung prüfen
- [ ] OpenAI – AVV Status: _offen_, ggf. EU-Data-Residency-Option wählen
- [ ] Google (Gemini) – AVV Status: _offen_, EU-Region konfigurieren

## Speicherorte & Aufbewahrung ⚠️
- **Prompt-/Antwort-Inhalte:** werden im Router **nicht** dauerhaft gespeichert;
  in Postgres liegen nur **Metadaten** (Modell, Tokens, Kosten, Zeit) –
  standardmäßig keine Nutzinhalte. Vor Produktivbetrieb bestätigen, dass kein
  Payload-Logging aktiv ist.
- **Aufbewahrung Spend-Logs:** ⚠️ Annahme 90 Tage, dann rotieren/löschen.
- **Lokale Modelle:** keine Datenweitergabe an Dritte.

## Empfehlung EU-Residenz ⚠️
Für strenge Fälle **Mistral (EU)** oder ausschließlich lokale Modelle nutzen.
Nachrüstbar ohne Workflow-Änderung (nur Config).

## Offene Punkte zur Klärung mit dir
1. Welche konkreten Datenarten kommen je Use-Case vor (Kunden benennen)?
2. Sind AVVs mit OpenAI/Google gewünscht/vorhanden, oder Cloud nur bei
   unkritischen Daten?
3. Aufbewahrungsfristen für Logs?
