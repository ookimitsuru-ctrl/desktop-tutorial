# Welcome to GitHub Desktop!

This is your README. READMEs are where you can communicate what your project is and how to use it.

Write your name on line 6, save it, and then head back to GitHub Desktop.

## Hermes エージェントのセットアップ

Ollama でローカル実行する Hermes モデルを使ったシンプルなチャットボットです。

### 必要なもの

- [Ollama](https://ollama.com/) がインストール済みであること
- Python 3.9 以上（標準ライブラリのみ使用、追加インストール不要）

### セットアップ手順

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
4. プロンプトが出たらメッセージを入力して会話できます。`exit` または `quit` で終了します。

### オプション

- `--model` : 使用するモデル名を指定（デフォルト: `hermes3`）
- `--host`  : Ollama サーバーの URL を指定（デフォルト: `http://localhost:11434`）

例:
```bash
python3 hermes_agent.py --model nous-hermes2 --host http://localhost:11434
```
