# Local LLM: Hermes Agent + Ollama + Qwen3.6-35B-A3B

Runs Qwen3.6-35B-A3B locally through Ollama and uses Hermes Agent as the client.

```
Hermes Agent  --(OpenAI-compatible API, :11434/v1)-->  Ollama  -->  qwen3.6:35b-a3b (agent-tuned as "qwen-agent")
```

## Layout

| Path | Purpose |
| --- | --- |
| `ollama/Modelfile` | Builds the agent model: sets `num_ctx 65536` (Hermes needs ≥ 64K) and sampling params |
| `hermes/config.yaml` | Hermes model block: `provider: custom`, `base_url` → local Ollama |
| `scripts/setup.sh` | Pulls the model, builds `qwen-agent`, smoke-tests the API, installs the Hermes config |

## Prerequisites

- Ollama installed (`ollama serve` running)
- Hermes Agent installed (`hermes` on `PATH`)
- Roughly 20 GB free disk and memory for the model; more for long contexts. Sources disagree on the exact figure, so measure on your machine.

## Setup

```bash
cd local-llm
./scripts/setup.sh
hermes
```

Overridable variables: `BASE_MODEL`, `AGENT_MODEL_NAME`, `HERMES_HOME`, `OLLAMA_HOST_URL`.

Re-running the script is safe. An existing `~/.hermes/config.yaml` is backed up before it is replaced.

## Checks

```bash
# Model is registered
ollama list | grep qwen-agent

# API responds
curl http://127.0.0.1:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen-agent","messages":[{"role":"user","content":"ping"}]}'

# Hermes is using the custom endpoint (check what it reports after saving)
hermes config show   # or inspect ~/.hermes/config.yaml
```

## Notes and known issues

- **Model tag:** `qwen3.6:35b-a3b` comes from a third-party guide. Run `ollama search qwen3.6` (or check the Ollama library) and override with `BASE_MODEL=...` if the tag differs.
- **Provider name:** Use `provider: custom` with an explicit `base_url`. Some reports say `provider: ollama` is not recognized.
- **Routing:** One report says Hermes fell back to OpenRouter despite a local `base_url`. After setup, confirm which provider handles requests.
- **Config location:** Settings are read from `config.yaml`. Older guides that rely on `OPENAI_BASE_URL` / `LLM_MODEL` in `.env` may no longer apply.
- **Thinking mode:** Qwen3.6 thinks by default, which adds latency to every agent step. If responses are slow, consider disabling thinking for the agent model.
- **Tool calling:** Only use models that support tool calling. Local models are weaker on complex multi-step tasks, so a cloud fallback can be enabled in `hermes/config.yaml`.
- **Backend:** The request mentioned "Kapitsa" as a backend. No such tool could be found, so this setup uses Ollama. Replace the `base_url` and the `ollama/` directory if a different backend is used.
