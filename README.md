# 町ガチャ（仮）

毎日ランダムに割り当てられる「今日の担当地（市区町村）」で、同じ地に当たった人同士が語り合う匿名SNS。設計の経緯・データモデルの詳細は `~/.claude/plans/taglly-cosmic-bonbon.md` を参照。

## 構成
- `public/` — フロントエンド（素のHTML/JS、Firebase JS SDKをCDNから読み込み）。今回のバックエンド設定パスでは、hostingエミュレータ用の最小プレースホルダー（`index.html`）のみ。本UIは別タスク。
- `functions/` — Cloud Functions（`dailyRollover` / `assignToday` / `postMessage` / `touchActive`）
- `scripts/seed-municipalities.js` — [[cityconquer-project]]（塗るタウン！）の `muni.json` から市区町村マスタをFirestoreへ投入するワンオフスクリプト
- Firestore + Firebase Anonymous Auth

## セットアップ（ここから先はユーザー側の作業が必要）

Claude Codeはブラウザ認証やFirebaseプロジェクトの新規作成を代行できないため、以下はターミナルで直接実行してください（`!`プレフィックスでこのセッションから実行することもできます）。

1. **Firebaseにログイン**
   ```
   npx firebase-tools login
   ```
2. **Firebaseコンソール** (https://console.firebase.google.com/) でプロジェクトを新規作成する。
3. **Blazeプラン（従量課金）へのアップグレードが必須。** `dailyRollover` はスケジュール実行のためCloud Schedulerを使い、Sparkプランでは動かない。無料枠内なら課金は発生しない。
4. プロジェクトルートに `.firebaserc` を作成:
   ```
   npx firebase-tools use --add
   ```
5. Firebaseコンソール > プロジェクトの設定 > 全般 > マイアプリ でWebアプリを追加し、表示された設定値を使って `public/firebase-config.sample.js` を `public/firebase-config.js` としてコピー・編集する（このファイルはgitignore対象）。
6. Authentication > Sign-in method で「匿名」を有効化する。
7. 依存関係をインストール:
   ```
   npm install
   cd functions && npm install && cd ..
   ```
8. 市区町村マスタをseed（サービスアカウントキーはFirebaseコンソール > プロジェクトの設定 > サービスアカウント から発行）。`muni.json` は `[[cityconquer-project]]` から入手してリポジトリ直下に配置する（本リポジトリには含まれていない）:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
   FIREBASE_PROJECT_ID=あなたのプロジェクトID \
   npm run seed
   ```
9. **ローカル動作確認（エミュレータ、課金なし）:**
   ```
   npm run emulators
   ```
   ブラウザで `http://localhost:5050` を開く。エミュレータ利用時は上記8のseedを `FIRESTORE_EMULATOR_HOST=localhost:8080` を付けて実行すればエミュレータのFirestoreに投入できる。`dailyRollover` はスケジュール実行なのでエミュレータでは自動発火しない — Emulator UI (`http://localhost:4000`) のFunctionsタブから手動トリガーして確認する。
10. **本番デプロイ:**
    ```
    npm run deploy
    ```

## 既知の未確定事項（プラン参照）
- `targetGroupSize`（1部屋の目標人数、初期値8）は運用しながら調整。
- モデレーション機能（通報など）は未実装。Tagllyでの反省を踏まえ早めに追加を検討。
- 部屋の閲覧範囲は「読み取り全公開・書き込みは当日の担当者のみ」。

## 実装メモ（このバックエンド設定パスでの判断）

`~/.claude/plans/taglly-cosmic-bonbon.md`（設計の経緯・データモデル詳細）と `[[cityconquer-project]]` の `muni.json` は本セッションの環境から参照できなかったため、以下は本README・機能名から推測して実装した。将来プラン内容と食い違いがあれば要調整。

- **`targetGroupSize` の解釈**: 「目標人数」という表現（上限ではなく目標）を根拠に、部屋あたりの人数はハードキャップではなくソフトターゲットとして扱った。`assignToday` は当日の空き部屋（`status: "open"`）を優先的に埋め、なければ新しい市区町村をランダムに1つ「開室」する。市区町村ごとに部屋は1つ（シャーディングなし）。設計の経緯次第でハード上限方式（複数インスタンス化）へ拡張する場合は、部屋ドキュメントIDを `{municipalityId}__{instanceIndex}` に変更する形で追加できる。
- **データモデル**: `dailyEpochs/{dateId}`（当日コンテナ）配下に `rooms/{municipalityId}`、`rooms/{municipalityId}/messages/{messageId}`、`rooms/{municipalityId}/members/{uid}`、`assignments/{uid}` を配置。`municipalities/{municipalityId}` はマスタ、`presence/{uid}` はグローバルなプレゼンス（心拍）用。
- **Firestoreセキュリティルール**: 読み取りは原則公開、直接の書き込みはすべて拒否し、Cloud Functions（Admin SDK）経由の書き込みのみを許可する方式にした。「当日の担当者かどうか」の判定をルール側でも独自実装すると、日付境界（JST）の扱いがFunctions側と食い違うリスクがあるため。
- **`muni.json` の想定形**: 実データ未入手のため `[{ code, prefecture, city, kana? }, ...]` という配列を仮定。`scripts/seed-municipalities.js` の `normalize()` 関数がその変換部分を担っており、実際の形式が分かり次第そこだけ書き換えれば良い設計にした。
- **その他のデフォルト値**（コード内 `functions/src/lib/config.js` にまとめてあるので調整しやすい）: `MAX_MESSAGE_LENGTH=500`、簡易レート制限 `MIN_MESSAGE_INTERVAL_MS=1000`（モデレーション機能の代替ではなく、単なる連投防止）、`dailyEpochs` の保持期間 `RETENTION_DAYS=30`、Cloud Functionsのリージョン `asia-northeast1`。
- **`presence/{uid}` の読み取り範囲**: 「読み取り全公開」はREADME上「部屋」についての記述と解釈し、プレゼンス（心拍）情報自体は本人のみ読み取り可にした。
- **`public/index.html`**: バックエンド動作確認用の最小プレースホルダーのみ設置（hostingエミュレータがディレクトリ必須のため）。本格的なUIは別タスクとする想定。
