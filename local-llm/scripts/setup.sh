#!/usr/bin/env bash
# Prepare Kapitsa (Qwen3.6-35B-A3B) and wire Hermes Agent to it.
# Run this while `scripts/serve.sh` is running in another terminal.
#
# Usage:
#   ./scripts/setup.sh
#   KAPITSA_MODEL=35b:6bit ./scripts/setup.sh
#
# Idempotent: safe to re-run.

set -euo pipefail

KAPITSA_MODEL="${KAPITSA_MODEL:-35b:4bit}"
KAPITSA_BASE="${KAPITSA_BASE:-http://127.0.0.1:8000}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '[setup] %s\n' "$*"; }
die() { printf '[setup] ERROR: %s\n' "$*" >&2; exit 1; }

# 1. Prerequisites -----------------------------------------------------------
[ "$(uname -s)" = "Darwin" ] || die "Kapitsa runs only on macOS (Apple silicon)."
[ "$(uname -m)" = "arm64" ]  || die "Kapitsa requires an Apple silicon Mac (M1 or newer)."
command -v kapitsa >/dev/null 2>&1 || die "kapitsa not found. Install: brew install nace-ai/tap/kapitsa"
command -v hermes  >/dev/null 2>&1 || die "hermes not found. Install Hermes Agent first (see local-llm/README.md)"
command -v curl    >/dev/null 2>&1 || die "curl is required"

# 2. Model files -------------------------------------------------------------
log "Pulling model: $KAPITSA_MODEL (large download; see README for sizes)"
kapitsa pull "$KAPITSA_MODEL"

# 3. Server must be running (scripts/serve.sh) -------------------------------
models_json="$(curl -fsS "$KAPITSA_BASE/v1/models" 2>/dev/null)" \
  || die "Kapitsa server not reachable at $KAPITSA_BASE. Start it with: ./scripts/serve.sh"
log "Kapitsa server is up"

# 4. Find the model id the server reports ------------------------------------
# The API may expose the id as "35b", "35b:4bit" or "qwen3.6-35b-a3b".
# Prefer the id that matches the 35b family; fall back to the first id.
model_id="$(printf '%s' "$models_json" \
  | grep -o '"id" *: *"[^"]*"' | sed 's/.*"id" *: *"\([^"]*\)"/\1/' \
  | grep -i '35b' | head -n1 || true)"
if [ -z "$model_id" ]; then
  model_id="$(printf '%s' "$models_json" | grep -o '"id" *: *"[^"]*"' | head -n1 | sed 's/.*"id" *: *"\([^"]*\)"/\1/' || true)"
fi
[ -n "$model_id" ] || die "could not read a model id from $KAPITSA_BASE/v1/models: $models_json"
log "Server model id: $model_id"

# 5. Smoke-test the OpenAI-compatible chat endpoint --------------------------
resp="$(curl -fsS "$KAPITSA_BASE/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$model_id\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with OK.\"}],\"max_tokens\":32,\"reasoning_effort\":\"none\"}")" \
  || die "chat completion request failed"
printf '%s' "$resp" | grep -q '"choices"' || die "unexpected response: $resp"
log "Chat endpoint responded"

# 6. Install the Hermes config (back up any existing one) --------------------
mkdir -p "$HERMES_HOME"
target="$HERMES_HOME/config.yaml"
if [ -f "$target" ] && ! cmp -s "$target" "$here/hermes/config.yaml"; then
  backup="$target.bak.$(date +%Y%m%d%H%M%S)"
  cp "$target" "$backup"
  log "Existing Hermes config backed up to $backup"
fi
# Write the discovered model id into `default:` (escape characters sed treats specially).
escaped_id="$(printf '%s' "$model_id" | sed 's/[&|\\]/\\&/g')"
sed "s|^  default: .*|  default: \"$escaped_id\"|" "$here/hermes/config.yaml" > "$target"
log "Wrote $target (model: $model_id)"

log "Done. Start the agent with: hermes"
