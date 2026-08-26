#!/usr/bin/env python3
"""Simple CLI chatbot backed by a local Hermes model running on Ollama."""
import argparse
import json
import sys
import urllib.error
import urllib.request

DEFAULT_HOST = "http://localhost:11434"
DEFAULT_MODEL = "hermes3"


def chat(host: str, model: str, messages: list[dict]) -> str:
    url = f"{host}/api/chat"
    payload = json.dumps({"model": model, "messages": messages, "stream": False}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.load(resp)
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"Could not reach Ollama at {host} ({exc}). "
            "Make sure `ollama serve` is running and the model is pulled "
            f"(`ollama pull {model}`)."
        )
    return data["message"]["content"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=DEFAULT_HOST, help="Ollama server URL")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model name")
    args = parser.parse_args()

    print(f"Hermes agent ready (model={args.model}, host={args.host}). Type 'exit' to quit.")
    messages: list[dict] = []
    while True:
        try:
            user_input = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if user_input.lower() in {"exit", "quit"}:
            break
        if not user_input:
            continue
        messages.append({"role": "user", "content": user_input})
        reply = chat(args.host, args.model, messages)
        messages.append({"role": "assistant", "content": reply})
        print(f"hermes> {reply}")


if __name__ == "__main__":
    sys.exit(main())
