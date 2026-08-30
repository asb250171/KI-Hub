# Routing-Matrix – Welche Aufgabe nutzt welches Modell?

Diese Matrix ist die **fachliche Begründung** hinter `litellm-config.yaml`.
Consumer (n8n-Workflows) rufen **nur den semantischen Alias** auf – nie ein
konkretes Modell. So lässt sich die Modellwahl zentral ändern, ohne einen
einzigen Workflow anzufassen.

## Grundregel
> **Pro Aufgabe das günstigste Modell, das die Qualität sicher liefert.**
> Sensible Daten bleiben lokal. Cloud nur, wenn Datenschutz es erlaubt und
> die Aufgabe es erfordert.

## Aliase, Standardmodell & Fallback-Kette

| Alias | Aufgabe | Standardmodell (günstig) | Fallback-Kette | Datenschutz |
|---|---|---|---|---|
| `hub-private` | **Sensible Daten** jeder Art | `qwen2.5:3b` (lokal) | **keiner** (bewusst) | 🔒 nur lokal |
| `hub-local` | Einfache Aufgaben, lokal zuerst | `qwen2.5:3b` (lokal) | → `hub-classify` (Haiku) | lokal bevorzugt |
| `hub-classify` | Klassifikation, Kategorisierung, Routing | Claude 3.5 **Haiku** | Gemini Flash → GPT-4o-mini | Cloud ok |
| `hub-extract` | Feld-Extraktion aus Dokumenten | **Gemini 1.5 Flash** | Haiku → GPT-4o-mini | Cloud ok |
| `hub-summarize` | Zusammenfassung | Claude 3.5 **Haiku** | Gemini Flash → GPT-4o-mini | Cloud ok |
| `hub-translate` | Übersetzung | **Gemini 1.5 Flash** | Haiku → GPT-4o-mini | Cloud ok |
| `hub-generate` | Textgenerierung (E-Mails, Angebote) | Claude 3.5 **Sonnet** | GPT-4o → Gemini Pro | Cloud ok |
| `hub-reason` | Komplexe Analyse, Reasoning | Claude 3.5 **Sonnet** | GPT-4o → Gemini Pro | Cloud ok |
| `hub-code` | Code-Generierung/Review | Claude 3.5 **Sonnet** | GPT-4o → Gemini Pro | Cloud ok |

> **Modell-IDs aktualisieren:** Die Configs nutzen `-latest`-Aliase. Neuere
> Modelle (z. B. Claude-5-Familie) werden aktiviert, indem in
> `litellm-config.yaml` die `model:`-Zeile auf die konkrete ID gesetzt wird.
> Vorgehen im Betriebshandbuch, Abschnitt „Modelle aktualisieren".

## Datenschutz-Flag (DSGVO)
Der aufrufende Workflow trägt die Verantwortung, das **richtige Alias** zu
wählen. Faustregel:

- Enthält der Prompt **personenbezogene / vertrauliche Kundendaten**, die
  nicht in die Cloud dürfen → **`hub-private`** (bleibt zu 100 % lokal).
- Alles andere → passendes Aufgaben-Alias.

Optional (Ausbaustufe 2): Ein vorgeschalteter **lokaler Klassifikator**
(`hub-private`) prüft automatisch auf PII und zwingt bei Treffer auf lokal.
Siehe `../docs/adr/0003-datenschutz-routing.md`.

## Kosten-Logik (warum das spart)
- **~80 % der Alltagsaufgaben** (Klassifikation, Extraktion, Zusammenfassung)
  laufen auf den günstigsten Modellen (Haiku / Gemini Flash) oder lokal (0 €).
- Teure Modelle (Sonnet/GPT-4o) werden **nur** für `generate/reason/code`
  gezogen – und selbst dort erst, wenn nötig.
- Jeder Request wird mit Modell, Tokens und Kosten geloggt → Einsparung
  gegenüber „immer Frontier-Modell" ist **belegbar** (Betriebshandbuch,
  Abschnitt „Kosten auswerten").
