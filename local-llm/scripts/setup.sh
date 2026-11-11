#!/usr/bin/env bash
# Set up a local Qwen3.6-35B-A3B model served by Ollama and wire Hermes Agent to it.
#
# Usage:
#   ./scripts/setup.sh              # uses defaults below
#   BASE_MODEL=qwen3.5:35b-a3b ./scripts/setup.sh
#
# Idempotent: safe to re-run.

set -euo pipefail

BASE_MODEL="${BASE_MODEL:-qwen3.6:35b-a3b}"   # Ollama tag to pull (verify with `ollama search`)
AGENT_MODEL_NAME="${AGENT_MODEL_NAME:-qwen-agent}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
OLLAMA_HOST_URL="${OLLAMA_HOST_URL:-http://127.0.0.1:11434}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '[setup] %s\n' "$*"; }
die() { printf '[setup] ERROR: %s\n' "$*" >&2; exit 1; }

# 1. Prerequisites -----------------------------------------------------------
command -v ollama >/dev/null 2>&1 || die "ollama not found. Install from https://ollama.com/download"
command -v hermes >/dev/null 2>&1 || die "hermes not found. Install Hermes Agent first (see local-llm/README.md)"

# 2. Make sure the Ollama server is reachable --------------------------------
if ! curl -fsS "$OLLAMA_HOST_URL/api/tags" >/dev/null 2>&1; then
  die "Ollama server not reachable at $OLLAMA_HOST_URL. Start it with: ollama serve"
fi
log "Ollama server reachable at $OLLAMA_HOST_URL"

# 3. Pull the base model ------------------------------------------------------
log "Pulling base model: $BASE_MODEL (this is large, ~20 GB)"
ollama pull "$BASE_MODEL"

# 4. Build the agent-tuned model with the required context window -----------
log "Creating model '$AGENT_MODEL_NAME' from ollama/Modelfile"
tmp_modelfile="$(mktemp)"
trap 'rm -f "$tmp_modelfile"' EXIT
sed "s|^FROM .*|FROM $BASE_MODEL|" "$here/ollama/Modelfile" > "$tmp_modelfile"
ollama create "$AGENT_MODEL_NAME" -f "$tmp_modelfile"

# 5. Verify the model answers over the OpenAI-compatible API -----------------
log "Smoke-testing the OpenAI-compatible endpoint"
resp="$(curl -fsS "$OLLAMA_HOST_URL/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$AGENT_MODEL_NAME\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with OK.\"}],\"max_tokens\":32}")" \
  || die "chat completion request failed"
printf '%s\n' "$resp" | grep -q '"choices"' || die "unexpected response: $resp"
log "Endpoint responded"

# 6. Install the Hermes config (back up any existing one) --------------------
mkdir -p "$HERMES_HOME"
target="$HERMES_HOME/config.yaml"
if [ -f "$target" ] && ! cmp -s "$target" "$here/hermes/config.yaml"; then
  backup="$target.bak.$(date +%Y%m%d%H%M%S)"
  cp "$target" "$backup"
  log "Existing Hermes config backed up to $backup"
fi
sed "s|^  default: .*|  default: $AGENT_MODEL_NAME|" "$here/hermes/config.yaml" > "$target"
log "Wrote $target"

log "Done. Start the agent with: hermes"
