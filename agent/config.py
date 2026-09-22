import os

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

# ツール呼び出し(function calling)担当
HERMES_MODEL = os.environ.get("HERMES_MODEL", "hermes3")

# 汎用応答担当
QWEN_MODEL = os.environ.get("QWEN_MODEL", "qwen3")
