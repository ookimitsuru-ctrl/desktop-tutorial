#!/usr/bin/env bash
# Ollamaコンテナに Hermes(ツール呼び出し用) と Qwen(汎用応答用) のモデルをpullするスクリプト
set -euo pipefail

HERMES_MODEL="${HERMES_MODEL:-hermes3}"
QWEN_MODEL="${QWEN_MODEL:-qwen3}"

echo "Pulling ${HERMES_MODEL} ..."
docker compose exec ollama ollama pull "${HERMES_MODEL}"

echo "Pulling ${QWEN_MODEL} ..."
docker compose exec ollama ollama pull "${QWEN_MODEL}"

echo "Done. Installed models:"
docker compose exec ollama ollama list
