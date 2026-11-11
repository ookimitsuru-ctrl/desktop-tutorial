#!/usr/bin/env bash
# Start the Kapitsa server for Qwen3.6-35B-A3B on this Mac (blocking; run in its own terminal).
#
# Usage:
#   ./scripts/serve.sh
#   KAPITSA_MODEL=35b:6bit KAPITSA_CONTEXT=128k ./scripts/serve.sh
#
# Model variants (from kapitsa docs):
#   35b:4bit (default, 22.1 GB, 32-36 GB Macs), 35b:6bit (30.7 GB), 35b:8bit (39.4 GB),
#   35b:bf16 (71.9 GB), 35b:16gb (10.8 GB, 2-bit, for 16-24 GB Macs)

set -euo pipefail

KAPITSA_MODEL="${KAPITSA_MODEL:-35b:4bit}"
KAPITSA_CONTEXT="${KAPITSA_CONTEXT:-128k}"   # Hermes needs >= 64K
KAPITSA_PORT="${KAPITSA_PORT:-8000}"

die() { printf '[serve] ERROR: %s\n' "$*" >&2; exit 1; }

command -v kapitsa >/dev/null 2>&1 || die "kapitsa not found. Install: brew install nace-ai/tap/kapitsa"

exec kapitsa serve \
  --model "$KAPITSA_MODEL" \
  --context "$KAPITSA_CONTEXT" \
  --host 127.0.0.1 \
  --port "$KAPITSA_PORT"
