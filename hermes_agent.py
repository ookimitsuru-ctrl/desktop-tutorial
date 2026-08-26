#!/usr/bin/env python3
"""Simple CLI chatbot backed by a Hermes model, via local Ollama or the OpenRouter API."""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_OLLAMA_HOST = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "hermes3"
DEFAULT_OPENROUTER_MODEL = "nousresearch/hermes-3-llama-3.1-405b"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def post_json(url: str, payload: dict, headers: dict) -> dict:
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), headers=headers, method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def chat_ollama(host: str, model: str, messages: list[dict]) -> str:
    try:
        data = post_json(
            f"{host}/api/chat",
            {"model": model, "messages": messages, "stream": False},
            {"Content-Type": "application/json"},
        )
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"Could not reach Ollama at {host} ({exc}). "
            "Make sure `ollama serve` is running and the model is pulled "
            f"(`ollama pull {model}`)."
        )
    return data["message"]["content"]


def chat_openrouter(api_key: str, model: str, messages: list[dict]) -> str:
    try:
        data = post_json(
            OPENROUTER_URL,
            {"model": model, "messages": messages},
            {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
        )
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"OpenRouter request failed ({exc.code}): {exc.read().decode()}")
    except urllib.error.URLError as exc:
        raise SystemExit(f"Could not reach OpenRouter ({exc}).")
    return data["choices"][0]["message"]["content"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--backend", choices=["ollama", "openrouter"], default="ollama",
        help="Where to run the Hermes model (default: ollama)",
    )
    parser.add_argument("--host", default=DEFAULT_OLLAMA_HOST, help="Ollama server URL")
    parser.add_argument("--model", default=None, help="Model name (backend-specific default if omitted)")
    parser.add_argument(
        "--api-key", default=None,
        help="OpenRouter API key (defaults to OPENROUTER_API_KEY env var)",
    )
    args = parser.parse_args()

    if args.backend == "openrouter":
        api_key = args.api_key or os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise SystemExit(
                "Missing OpenRouter API key. Pass --api-key or set OPENROUTER_API_KEY."
            )
        model = args.model or DEFAULT_OPENROUTER_MODEL

        def send(messages: list[dict]) -> str:
            return chat_openrouter(api_key, model, messages)
    else:
        model = args.model or DEFAULT_OLLAMA_MODEL

        def send(messages: list[dict]) -> str:
            return chat_ollama(args.host, model, messages)

    print(f"Hermes agent ready (backend={args.backend}, model={model}). Type 'exit' to quit.")
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
        reply = send(messages)
        messages.append({"role": "assistant", "content": reply})
        print(f"hermes> {reply}")


if __name__ == "__main__":
    sys.exit(main())
