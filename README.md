# バレットジャーナル for Android

紙のバレットジャーナル（Bullet Journal / BuJo）の考え方を、そのまま Android アプリにしたものです。
Kotlin + Jetpack Compose + Room で書かれた、オフライン完結・単一モジュールのアプリです。

## 再現しているバレットジャーナルの要素

| BuJo の要素 | アプリでの実装 |
| --- | --- |
| ラピッドログ（箇条書き） | タスク `•` / イベント `○` / メモ `—` の3種類のバレットを1行で追加 |
| タスクの状態 | 完了 `✕`、移動 `＞`、フューチャーログへ `＜`、取り消し `〜` |
| サインファイア | 優先 `*`、ひらめき `!`、要調査 `?` をバレットの左に付与 |
| デイリーログ | 日付ごとのページ。前後の日へ移動、カレンダーから日付選択 |
| マンスリーログ | カレンダー（未完了がある日にドット）＋ その月のタスク一覧 |
| フューチャーログ | 12か月分を月ごとに一覧。月初にマンスリーへ一括で書き写せる |
| コレクション | 「読書リスト」「旅の準備」など自由なテーマのページ。アーカイブ可 |
| インデックス | 記号の凡例（キー）と、月・コレクションごとの入り口 |
| マイグレーション（移動） | 過ぎた日・過ぎた月に残った未完了タスクを一覧し、今日／別の日／マンスリー／フューチャー／コレクションへ移す。やらないと決めることもできる |

移動の実装は紙の手順に忠実です。元のバレットは `＞` や `＜` に書き換えられて履歴として残り、
移動先には新しいバレットが書き写されます（`migratedFromId` で元の項目を辿れます）。

## 画面

- **デイリー** — その日のラピッドログ。持ち越しタスクがあると上部に案内が出る
- **マンスリー** — カレンダー＋今月のタスク。日付をタップするとその日のデイリーログへ
- **フューチャー** — 先12か月。月見出しの `＋` からその月へ追加
- **コレクション** — テーマ別ページの作成・改名・アーカイブ・削除
- **インデックス** — 記号の凡例、月ごとの件数、コレクション一覧、検索と移動への入り口
- **検索** — 本文と補足メモの全文検索。結果には「どこに書いたか」を表示
- **移動** — マイグレーション専用画面。一件ずつ、またはまとめて移動

## 構成

```
app/src/main/java/com/bujo/app/
├── BujoApplication.kt          Application（手書きDIコンテナの保持）
├── MainActivity.kt
├── data/
│   ├── model/                  Entry, JournalCollection, 記号まわりの enum
│   ├── local/                  Room の DAO・DB・TypeConverter・集計用データ
│   └── repository/             JournalRepository（移動などの操作を集約）
├── di/                         AppContainer（Hilt なしの小さな DI）
└── ui/
    ├── BujoApp.kt              Navigation とボトムナビ
    ├── BaseEntryViewModel      画面共通のバレット操作
    ├── components/             バレット記号、行、入力シート、操作シート、カレンダー、各種ダイアログ
    └── screens/                daily / monthly / future / collections / index / search / migration
```

- **DB**: Room（`bujo.db`）。日付は `yyyy-MM-dd`、月は `yyyy-MM` の文字列で保存し、SQLite 上で範囲比較・並び替えができるようにしています
- **状態管理**: `StateFlow` + `collectAsStateWithLifecycle`。ViewModel は Activity スコープで共有し、画面をまたいだ日付・月の受け渡しに使っています
- **DI**: ライブラリなし。`AppContainer` と `viewModelFactory` のみ

## ビルド

```bash
./gradlew assembleDebug      # APK を作る
./gradlew installDebug       # 接続中の端末に入れる
./gradlew testDebugUnitTest  # ユニットテスト
```

- 必要環境: JDK 17、Android SDK 35（`local.properties` の `sdk.dir`、または `ANDROID_HOME`）
- minSdk 26 / targetSdk 35（`java.time` をそのまま使うため minSdk は 26）

## 検証状況

開発コンテナからは `dl.google.com`（Android Gradle Plugin と androidx の唯一の配布元、および Android SDK の配信元）へ
到達できないため、`assembleDebug` によるフルビルドはこの環境では実行できていません。
代わりに、依存関係なしで確認できる範囲を検証してあります。

| 項目 | 結果 |
| --- | --- |
| Gradle ラッパー（8.11.1）の取得と起動 | OK |
| `./gradlew assembleDebug` | 失敗（AGP 8.7.3 を解決できない。ネットワーク制約であってコードの問題ではない） |
| 全 Kotlin ソースの構文チェック（kotlinc 2.0.21） | 構文エラー 0 件（残る診断はすべて androidx 不在による未解決参照） |
| データ層（モデル / DAO / リポジトリ / 日付整形）の型チェック | OK（Room 注釈はスタブ、コルーチンは実物） |
| ユニットテスト 10 件（記号の対応、移動、フューチャー→マンスリーの引き継ぎ、並び順） | 10 件すべて成功 |

UI 層（Compose）はコンパイル未検証です。手元の Android Studio / SDK のある環境で
`./gradlew assembleDebug` を実行してください。
