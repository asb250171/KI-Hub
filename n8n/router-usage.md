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

## LITELLM_KEY in n8n hinterlegen
Als n8n-Environment-Variable oder Credential setzen (nicht hart im Workflow):
`LITELLM_KEY = sk-...` (Master-Key oder – besser – ein pro Projekt erzeugter
Kunden-Key mit Budget, s. Betriebshandbuch Abschnitt 5).
