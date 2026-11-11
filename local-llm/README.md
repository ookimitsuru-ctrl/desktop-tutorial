# Local LLM: Hermes Agent + Kapitsa + Qwen3.6-35B-A3B

Runs Qwen3.6-35B-A3B locally with the Kapitsa inference server (Apple silicon) and uses Hermes Agent as the client.

```
Hermes Agent --(OpenAI-compatible API: http://127.0.0.1:8000/v1)--> kapitsa serve --> Qwen3.6-35B-A3B
```

## Layout

| Path | Purpose |
| --- | --- |
| `scripts/serve.sh` | Starts `kapitsa serve` for the 35B model on 127.0.0.1:8000 with a 128K context (blocking; run in its own terminal) |
| `scripts/setup.sh` | Pulls the model, checks the server, reads the model id it reports, smoke-tests the API, installs the Hermes config |
| `hermes/config.yaml` | Hermes model block: `provider: custom`, `base_url` → Kapitsa |

## Requirements

- Apple silicon Mac (M1 or newer), macOS 14 or later
- Kapitsa installed (`kapitsa` on `PATH`). Install steps: https://github.com/PGDAO/kapitsa
- Hermes Agent installed (`hermes` on `PATH`)

Both are assumed to be installed already. The scripts check for them and do not install anything.

Model choice (`KAPITSA_MODEL`):

| Variant | Download | Suggested Mac |
| --- | --- | --- |
| `35b:4bit` (default) | 22.1 GB | 32–36 GB unified memory |
| `35b:6bit` | 30.7 GB | 48 GB or more |
| `35b:8bit` | 39.4 GB | 64 GB or more |
| `35b:16gb` | 10.8 GB | 16–24 GB (2-bit) |

Run `kapitsa doctor` to see what fits your machine.

## Setup

Terminal 1:
```bash
cd local-llm
./scripts/serve.sh
```

Terminal 2:
```bash
cd local-llm
./scripts/setup.sh
hermes
```

Overridable variables: `KAPITSA_MODEL`, `KAPITSA_CONTEXT`, `KAPITSA_PORT` (serve), `KAPITSA_BASE`, `HERMES_HOME` (setup).

Re-running `setup.sh` is safe. An existing `~/.hermes/config.yaml` is backed up before it is replaced.

## Checks

```bash
curl http://127.0.0.1:8000/v1/models
curl http://127.0.0.1:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen3.6-35b-a3b","messages":[{"role":"user","content":"ping"}],"max_tokens":32}'
```

The model name in API requests is `qwen3.6-35b-a3b`, or `qwen3.6-35b-a3b:<variant>` for a non-default variant (for example `qwen3.6-35b-a3b:6bit`). Short aliases such as `35b` are CLI-only according to the Kapitsa docs.

## Notes

- **Context:** Hermes rejects models below 64K context. `serve.sh` uses 128K, and `config.yaml` sets `context_length: 131072` to match. Change both together.
- **Thinking mode:** Qwen3.6 thinks by default, which adds latency to each agent step. Kapitsa supports turning it off per request (`"reasoning_effort": "none"` on Chat Completions). Hermes does not expose this setting in its config, so this repo cannot turn it off for the agent yet.
- **Provider:** Use `provider: custom` with an explicit `base_url`. Hermes has no built-in Kapitsa provider.
- **Hermes integration is unverified.** Kapitsa's docs list Claude Code, Codex, opencode and pi as agent integrations, but not Hermes. The setup above follows the generic OpenAI-compatible path that Hermes documents for local servers.
- **Routing:** One report says Hermes fell back to OpenRouter even with a local `base_url`. After setup, confirm which provider handles requests.
- **Platform:** Kapitsa only runs on Apple silicon macOS. These scripts were checked for syntax only, on Linux. They have not been run against a real Kapitsa server.
