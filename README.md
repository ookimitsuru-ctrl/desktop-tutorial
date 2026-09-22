# Ollama + Hermes + Qwen エージェント環境

Ollama上で **Hermes**(ツール呼び出し/function calling担当)と **Qwen**(汎用応答担当)の
2つのモデルを動かし、Pythonから使い分けるエージェントのサンプル環境です。

## 構成

```
docker-compose.yml     # Ollamaサーバーのコンテナ定義
scripts/pull-models.sh # Hermes/Qwenモデルをpullするスクリプト
agent/
  config.py            # モデル名・接続先の設定(環境変数で上書き可)
  ollama_client.py      # Ollama APIを叩く薄いラッパー
  tools.py             # エージェントが呼び出せるツール(計算・現在時刻取得)の定義
  main.py              # 対話ループ本体
requirements.txt
```

### 役割分担

- **Hermes** (`hermes3`): ユーザーの発言を見て、ツール呼び出し(計算・時刻取得など)が
  必要かどうかを判断し、必要であればツールを実行して結果をまとめる。
- **Qwen** (`qwen3`): ツールが不要な一般的な質問・会話に対して応答する。

## セットアップ

### 1. Ollamaコンテナを起動

```bash
docker compose up -d
```

### 2. モデルをpull

```bash
./scripts/pull-models.sh
```

使用するモデルタグを変えたい場合は環境変数で指定できます。

```bash
HERMES_MODEL=hermes3:8b QWEN_MODEL=qwen3:8b ./scripts/pull-models.sh
```

### 3. Python依存関係をインストール

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. エージェントを起動

```bash
python -m agent.main
```

プロンプトが表示されたら日本語・英語どちらでも話しかけられます。

```
あなた: 123 * 456 を計算して
エージェント: 56088

あなた: 今何時?
エージェント: 2026-09-22 12:34:56

あなた: おすすめの本を教えて
エージェント: (Qwenによる一般的な応答)
```

## 設定の変更

`agent/config.py` は以下の環境変数を読みます。

| 環境変数 | デフォルト | 説明 |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama APIの接続先 |
| `HERMES_MODEL` | `hermes3` | ツール呼び出し担当モデル |
| `QWEN_MODEL` | `qwen3` | 汎用応答担当モデル |

## ツールの追加方法

`agent/tools.py` の `TOOL_FUNCTIONS`(実際に呼ばれるPython関数)と
`TOOL_SCHEMAS`(モデルに見せる関数定義)に追加するだけで、Hermesが新しいツールを
呼び出せるようになります。
