# n8n → Router anbinden

So rufen n8n-Workflows das KI-Hub-Gateway auf. Bestehende Workflows (z. B.
„Dokumenten-Digitalisierung", „ISO Lead Lokal") lassen sich damit auf die
zentrale Router-Schicht umstellen, ohne die Fachlogik zu ändern.

## Prinzip
Statt direkt Anthropic/Ollama anzusprechen, ruft der Workflow **einen HTTP-
Request** an den Router und übergibt als `model` ein **semantisches Alias**.

- URL (im selben Docker-Netz): `http://litellm:4000/v1/chat/completions`
- Auth-Header: `Authorization: Bearer <LITELLM_KEY>` (Master- oder Kunden-Key)
- Body: OpenAI-Chat-Format

## HTTP-Request-Node (Beispiel: Klassifikation)
```json
{
  "method": "POST",
  "url": "http://litellm:4000/v1/chat/completions",
  "sendHeaders": true,
  "headerParameters": { "parameters": [
    { "name": "Authorization", "value": "Bearer {{ $env.LITELLM_KEY }}" },
    { "name": "Content-Type", "value": "application/json" }
  ]},
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify({ model: 'hub-classify', messages: [ { role: 'system', content: 'Antworte nur mit einer Kategorie.' }, { role: 'user', content: $json.text } ], temperature: 0 }) }}"
}
```
Antwort steht in `{{ $json.choices[0].message.content }}`.

## Alias je nach Aufgabe wählen
| Situation im Workflow | Alias |
|---|---|
| Sensible Kundendaten im Prompt | `hub-private` |
| Dokument-/Feld-Extraktion | `hub-extract` |
| Rechnung/Dokument klassifizieren | `hub-classify` |
| Text zusammenfassen | `hub-summarize` |
| Kunden-E-Mail/Angebot entwerfen | `hub-generate` |
| Komplexe Analyse/Bewertung | `hub-reason` |

## Migration bestehender Workflows (empfohlene Reihenfolge)
1. **„Dokumenten-Digitalisierung"**: bestehenden Claude-Haiku-Aufruf durch
   Router-Aufruf mit `hub-classify` ersetzen → sofort Fallback + Kosten-Logging.
2. **„ISO Lead Lokal"**: die beiden `http://ollama:11434/api/generate`-Nodes
   auf `http://litellm:4000/v1/chat/completions` mit `hub-private` umstellen
   → einheitliches Logging, Datenschutz bleibt (lokal, kein Fallback).

> Hinweis: Der Ollama-`/api/generate`-Aufruf nutzt ein anderes Body-Format als
> das OpenAI-`/chat/completions`-Format. Bei der Migration Prompt in
> `messages:[{role:'user',content: ...}]` umbauen und Antwort aus
> `choices[0].message.content` lesen (statt `response`).

## Migrationsstatus: Dokumenten-Digitalisierung (MFP → SharePoint)

**Stand:** Draft migriert, **noch nicht publiziert** (aktive Version läuft weiter
auf direktem Anthropic-Aufruf). Workflow-ID `NoHlGdl8WRn0PGbD`.

Umgestellt wurden zwei Nodes (nur im Draft):
1. **„Claude PDF-Analyse (direkt)"** → ruft jetzt `http://litellm:4000/v1/chat/completions`
   mit `model: hub-classify` (bleibt Claude Haiku 4.5, PDF-fähig) im OpenAI-Format;
   PDF als `type: file`-Part; Auth über Header `Bearer {{ $env.LITELLM_KEY }}`.
2. **„Felder extrahieren"** → liest zusätzlich `choices[0].message.content`
   (OpenAI-Format); bleibt abwärtskompatibel zum Anthropic-nativen Format.

**Go-live-Checkliste (durch dich, in dieser Reihenfolge):**
1. Router auf Hetzner deployen (`docs/betriebshandbuch.md`), Health-Check grün.
2. In n8n die Env-Variable `LITELLM_KEY` setzen (Master- oder Kunden-Key) und
   n8n neu starten, damit `$env.LITELLM_KEY` verfügbar ist.
3. Workflow im n8n-UI öffnen → Draft testen (einzelnen Scan ausführen) →
   Ergebnis prüfen (Teams „Klassifiziert …") → dann **publizieren**.
4. Erste Läufe beobachten; im Router `GET /spend/logs` zeigt Modell + Kosten.

**Rollback:** Im n8n-UI die vorherige Version wiederherstellen (Versionshistorie)
oder den Node-URL zurück auf `https://api.anthropic.com/v1/messages` mit
Anthropic-Credential setzen.

## Migrationsstatus: ISO Lead Lokal

**Stand:** Draft migriert, **noch nicht publiziert**. Workflow-ID `chwRZ7ewcaqlJTsa`.

Umgestellt (nur im Draft):
1. **„Ollama Kandidaten"** und **„Ollama Analyse"** → rufen jetzt
   `http://litellm:4000/v1/chat/completions` mit `model: hub-private`
   (**rein lokal, kein Cloud-Fallback** → DSGVO). Format Ollama `/api/generate`
   → OpenAI `/chat/completions`; Prompt aus `ollamaRequest.prompt`,
   `response_format: json_object`; Auth `Bearer {{ $env.LITELLM_KEY }}`.
2. Zwei neue Mini-Nodes **„Antwort normalisieren (Kandidaten/Analyse)"** mappen
   `choices[0].message.content` → `response`, damit die bestehenden Parse-Nodes
   („Kandidaten parsen", „Recherche parsen") **unverändert** bleiben.

Go-live/Rollback identisch zum Abschnitt oben (Router deployen → `LITELLM_KEY`
in n8n → im UI testen → publizieren). Da `hub-private` lokal bleibt, entstehen
hier **keine Cloud-Tokenkosten**; das Logging zeigt Modell + 0-€-Vorgänge.

## LITELLM_KEY in n8n hinterlegen
Als n8n-Environment-Variable oder Credential setzen (nicht hart im Workflow):
`LITELLM_KEY = sk-...` (Master-Key oder – besser – ein pro Projekt erzeugter
Kunden-Key mit Budget, s. Betriebshandbuch Abschnitt 5).
