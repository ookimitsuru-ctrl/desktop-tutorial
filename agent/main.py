import json
import sys

from .config import HERMES_MODEL, QWEN_MODEL
from .ollama_client import chat
from .tools import TOOL_FUNCTIONS, TOOL_SCHEMAS

SYSTEM_PROMPT = (
    "あなたはツール呼び出しの判断だけを行うルーターです。"
    "ユーザーの依頼に計算や現在時刻の取得が必要な場合のみツールを呼び出してください。"
    "それ以外の一般的な質問・会話ではツールを呼ばないでください。"
)


def run_hermes_turn(user_message: str) -> dict:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]
    return chat(HERMES_MODEL, messages, tools=TOOL_SCHEMAS)


def run_qwen_turn(user_message: str) -> str:
    messages = [{"role": "user", "content": user_message}]
    response = chat(QWEN_MODEL, messages)
    return response["message"]["content"]


def run_tool_calls(tool_calls: list) -> list[str]:
    results = []
    for call in tool_calls:
        name = call["function"]["name"]
        args = call["function"].get("arguments", {})
        if isinstance(args, str):
            args = json.loads(args) if args else {}
        func = TOOL_FUNCTIONS.get(name)
        if func is None:
            results.append(f"[unknown tool: {name}]")
            continue
        try:
            results.append(str(func(**args)))
        except Exception as exc:
            results.append(f"[tool error: {exc}]")
    return results


def handle(user_message: str) -> str:
    hermes_response = run_hermes_turn(user_message)
    tool_calls = hermes_response["message"].get("tool_calls")

    if not tool_calls:
        # ツール不要と判断された場合は汎用応答担当のQwenに委譲する
        return run_qwen_turn(user_message)

    results = run_tool_calls(tool_calls)

    follow_up = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
        hermes_response["message"],
        *[{"role": "tool", "content": result} for result in results],
    ]
    final = chat(HERMES_MODEL, follow_up, tools=TOOL_SCHEMAS)
    return final["message"]["content"]


def main() -> None:
    print("Ollama + Hermes(tool) + Qwen(chat) agent. Ctrl-Cで終了。")
    while True:
        try:
            user_message = input("\nあなた: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not user_message:
            continue
        try:
            answer = handle(user_message)
        except Exception as exc:
            print(f"[エラー] {exc}", file=sys.stderr)
            continue
        print(f"エージェント: {answer}")


if __name__ == "__main__":
    main()
