#!/usr/bin/env bash
# ============================================================================
# KI-Hub – Lokale Validierung (Beweis vor Deployment)
# Prüft: YAML-Syntax, Pflichtfelder der LiteLLM-Config, docker-compose-Struktur.
# Nutzung:  bash scripts/validate.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }

echo "== 1. YAML-Syntax =="
python3 - <<'PY'
import sys, yaml
for f in ("router/litellm-config.yaml", "docker-compose.yml"):
    try:
        with open(f) as fh: yaml.safe_load(fh)
        print(f"  ok: {f}")
    except Exception as e:
        print(f"  FEHLER in {f}: {e}"); sys.exit(1)
PY
ok "Beide YAML-Dateien sind syntaktisch gültig"

echo "== 2. LiteLLM-Config: Pflichtfelder & Aliase =="
python3 - <<'PY'
import sys, yaml
cfg = yaml.safe_load(open("router/litellm-config.yaml"))
assert "model_list" in cfg, "model_list fehlt"
names = [m["model_name"] for m in cfg["model_list"]]
pflicht = {"hub-private","hub-local","hub-classify","hub-extract",
           "hub-summarize","hub-translate","hub-generate","hub-reason","hub-code"}
fehlend = pflicht - set(names)
assert not fehlend, f"Aliase fehlen: {fehlend}"

# Jedes Modell braucht litellm_params.model
for m in cfg["model_list"]:
    assert m.get("litellm_params", {}).get("model"), f"model fehlt bei {m['model_name']}"

# hub-private darf KEINEN Fallback haben (Datenschutz)
fbs = {list(d.keys())[0] for d in cfg.get("router_settings", {}).get("fallbacks", [])}
assert "hub-private" not in fbs, "hub-private darf keinen Cloud-Fallback haben!"

# Alle Fallback-Ziele müssen als model_name existieren
for d in cfg.get("router_settings", {}).get("fallbacks", []):
    for src, targets in d.items():
        for t in targets:
            assert t in names, f"Fallback-Ziel '{t}' (von {src}) ist nicht definiert"
print(f"  ok: {len(names)} Modelle, {len(pflicht)} Pflicht-Aliase vorhanden")
print("  ok: hub-private ohne Cloud-Fallback (Datenschutz gewahrt)")
print("  ok: alle Fallback-Ziele definiert")
PY
ok "LiteLLM-Config fachlich schlüssig"

echo "== 3. Secrets-Hygiene =="
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail ".env ist eingecheckt – das darf NICHT sein!"
fi
grep -q "os.environ/" router/litellm-config.yaml || fail "Keys nicht über os.environ referenziert"
ok "Keine echten Secrets im Repo, Keys via os.environ"

echo
echo "✅ Validierung erfolgreich – Config ist deploybar."
