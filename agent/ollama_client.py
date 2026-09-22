import ollama

from .config import OLLAMA_HOST

_client = ollama.Client(host=OLLAMA_HOST)


def chat(model: str, messages: list, tools: list | None = None) -> dict:
    kwargs = {"model": model, "messages": messages}
    if tools:
        kwargs["tools"] = tools
    return _client.chat(**kwargs)
