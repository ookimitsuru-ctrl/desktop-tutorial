#!/usr/bin/env bash
# ============================================================
#  ローカル LLM のプレイテストを最初から最後まで流す
#    test/playtest/run.sh <作業フォルダ> [分=60]
#  1) llama.cpp の llama-server を用意 (PyPI の llama-cpp-python の中のソースからビルド)
#  2) モデル (GGUF) を Hugging Face から取得
#  3) llama-server を起動して playtest.js を回す
#  まとめは修正のあとで summarize.js を別に実行する (README 参照)
# ============================================================
set -euo pipefail
WORK=${1:?作業フォルダ}; MIN=${2:-60}
HERE=$(cd "$(dirname "$0")" && pwd)
MODEL_REPO=${MODEL_REPO:-Qwen/Qwen2.5-3B-Instruct-GGUF}
MODEL_FILE=${MODEL_FILE:-qwen2.5-3b-instruct-q4_k_m.gguf}
THREADS=${THREADS:-2}   # ゲーム (Chromium) の分の CPU を残す
mkdir -p "$WORK"

if [ ! -x "$WORK/build/bin/llama-server" ]; then
  pip download --no-deps --no-binary :all: llama-cpp-python -d "$WORK/pkgs" -q
  tar xzf "$WORK"/pkgs/llama_cpp_python-*.tar.gz -C "$WORK"
  SRC=$(ls -d "$WORK"/llama_cpp_python-*/vendor/llama.cpp)
  cmake -S "$SRC" -B "$WORK/build" -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=ON -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=ON
  cmake --build "$WORK/build" -j"$(nproc)" --target llama-server
fi
if [ ! -f "$WORK/$MODEL_FILE" ]; then
  curl -fL --retry 4 -o "$WORK/$MODEL_FILE.part" "https://huggingface.co/$MODEL_REPO/resolve/main/$MODEL_FILE"
  mv "$WORK/$MODEL_FILE.part" "$WORK/$MODEL_FILE"
fi

"$WORK/build/bin/llama-server" -m "$WORK/$MODEL_FILE" -c 8192 -t "$THREADS" --port 8080 > "$WORK/llama-server.log" 2>&1 &
LLAMA=$!
trap 'kill $LLAMA 2>/dev/null' EXIT
until curl -sf http://127.0.0.1:8080/health > /dev/null; do sleep 1; done

node "$HERE/playtest.js" "$WORK/out" "$MIN" http://127.0.0.1:8080
