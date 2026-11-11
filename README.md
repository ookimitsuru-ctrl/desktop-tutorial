# ローカル推論スタック: Hermes Agent + kapitsa + Qwen3.6-35B-A3B

Mac (Apple silicon) 上で、ローカルの LLM を推論エンジンで動かし、そのエンドポイントに Hermes Agent を接続する構成のメモです。

## 構成

```
Hermes Agent  ──(OpenAI / Anthropic 互換 API)──▶  kapitsa serve  ──▶  Qwen3.6-35B-A3B (alias: 35b)
                                              http://127.0.0.1:8000
```

| コンポーネント | 役割 |
| --- | --- |
| Hermes Agent | Nous Research のエージェント。ツール実行や対話を担当 |
| kapitsa | Apple silicon 向けのオープンソース推論エンジン（Nace AI, Apache 2.0） |
| Qwen3.6-35B-A3B | MoE モデル（総パラメータ 35B、推論時の有効パラメータ約 3B） |

## 動作要件

- Apple silicon の Mac（M1 以降）
- macOS 14 以降
- メモリ目安（kapitsa の案内より）
  - 16 GB: `9b`（速さ優先なら `4b`）
  - 32〜36 GB: `35b`（既定は 4bit）
  - 48 GB: `35b`（既定は 6bit）

## セットアップ

### 1. kapitsa のインストール

```bash
brew install nace-ai/tap/kapitsa
# または
curl -fsSL https://raw.githubusercontent.com/nace-ai/kapitsa/main/install.sh | bash
```

### 2. 推論サーバーの起動

```bash
kapitsa serve --model 35b
```

- 既定の待ち受け先は `http://127.0.0.1:8000`（チャット、OpenAI 互換 API、Anthropic 互換 API）
- 精度を指定する場合は `35b:6bit` のように `名前:バリアント` 形式を使う

### 3. Hermes Agent からの接続

kapitsa は Hermes を含むエージェントをローカルモデルに向けて起動する機能を持つとされています。

```bash
kapitsa hermes --model 35b
```

> **注意**: このコマンドは kapitsa の公式ページのパターン（`kapitsa <agent> --model 35b`）からの推定です。動かない場合は、kapitsa の利用ガイドと Hermes Agent 側の設定で、OpenAI 互換エンドポイント `http://127.0.0.1:8000` を指定してください。

利用ガイド: https://github.com/nace-ai/kapitsa/blob/main/docs/usage.md

## 注意事項

- 本 README の手順は公開情報をもとにまとめたもので、実機での検証は行っていません。
- モデルのメモリ使用量や速度は、量子化の種類と Mac の構成によって大きく変わります。
- エージェントに実行権限を与える場合は、対象ディレクトリと操作範囲を事前に確認してください。

## 参考

- kapitsa: https://github.com/nace-ai/kapitsa （wiki: https://github.com/nace-ai/kapitsa/wiki）
- Hermes Agent / Qwen3.6-35B-A3B のローカル実行ガイド（NVIDIA, AMD, Ollama 等の解説記事）は、バックエンドごとに設定が異なるため、個別に確認してください。
