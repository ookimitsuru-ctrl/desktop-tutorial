# Welcome to GitHub Desktop!

This is your README. READMEs are where you can communicate what your project is and how to use it.

Write your name on line 6, save it, and then head back to GitHub Desktop.

## Hermes エージェントのセットアップ

Hermes モデルを使ったシンプルなチャットボットです。`--backend` で実行方式を切り替えられます。

- `ollama`（デフォルト）: ローカルの Ollama サーバーで実行
- `openrouter`: OpenRouter API 経由でクラウド上の Hermes モデルを呼び出す（GPUなし環境やこのようなクラウドセッションでも動作）

### 必要なもの

- Python 3.9 以上（標準ライブラリのみ使用、追加インストール不要）
- `ollama` バックエンド: [Ollama](https://ollama.com/) がインストール済みであること
- `openrouter` バックエンド: [OpenRouter](https://openrouter.ai/) の API キー

### Ollama で実行する場合

1. Ollama サーバーを起動する:
   ```bash
   ollama serve
   ```
2. 別のターミナルで Hermes モデルを pull する:
   ```bash
   ollama pull hermes3
   ```
3. エージェントを起動する:
   ```bash
   python3 hermes_agent.py
   ```

### OpenRouter で実行する場合

1. [OpenRouter](https://openrouter.ai/keys) で API キーを取得する。
2. 環境変数にセットするか `--api-key` で渡す:
   ```bash
   export OPENROUTER_API_KEY=sk-or-...
   python3 hermes_agent.py --backend openrouter
   ```

いずれの場合もプロンプトが出たらメッセージを入力して会話できます。`exit` または `quit` で終了します。

### オプション

- `--backend`  : `ollama`（デフォルト） または `openrouter`
- `--model`    : 使用するモデル名を指定（デフォルトはバックエンドごとに異なる）
- `--host`     : Ollama サーバーの URL を指定（デフォルト: `http://localhost:11434`、`ollama` バックエンドのみ）
- `--api-key`  : OpenRouter API キー（未指定時は `OPENROUTER_API_KEY` 環境変数を使用、`openrouter` バックエンドのみ）

例:
```bash
python3 hermes_agent.py --backend ollama --model nous-hermes2 --host http://localhost:11434
python3 hermes_agent.py --backend openrouter --model nousresearch/hermes-3-llama-3.1-405b
```
