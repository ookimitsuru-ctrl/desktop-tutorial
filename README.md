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

## 正方形に近い画面と物理キーボード（Unihertz Titan など）

別 APK は作らず、同じアプリが画面の形を見てレイアウトを切り替えます。判定は dp で
行うので画面密度に依存しません（`ui/layout/WindowSpec.kt`）。

| 条件 | 変わること |
| --- | --- |
| 縦横比が 1.45 未満（1080×1200 など、横向きのスマホも該当） | 下部ナビをやめて左のナビゲーションレールへ。縦を約 80dp 取り戻す |
| 上に加えて幅 520dp 以上 | マンスリーログを紙の見開きどおり左にカレンダー・右に一覧の2ペインに |
| 高さ 700dp 未満 | 行間・バレット・トップバーを詰め、日付を1行に収める |
| 横に広い | カレンダーのマスに上限を設けて間延びを防ぐ |

物理キーボードのある端末では次のキーが使えます（インデックス画面にも同じ表が出ます）。

| キー | 操作 |
| --- | --- |
| `N` | 新しいバレットを書く |
| `J` / `K`（矢印も可） | 一覧の選択を上下に動かす |
| `Space` | 選択中のタスクの完了を切り替える |
| `E` / `Enter` | 選択中のバレットの操作メニュー |
| `H` / `L`（矢印も可） | 前の日 / 次の日 |
| `T` | 今日へ戻る |
| `/` | 検索 |
| `M` | 移動（マイグレーション） |
| `1`〜`5` | デイリー / マンスリー / フューチャー / コレクション / インデックス |
| `Ctrl+Enter` | 入力中の内容を保存 |
| `Esc` | 選択を外す / 閉じる |

キー処理は子要素を先に通す `onKeyEvent` なので、文字入力中に横取りされません
（入力シートだけは `Ctrl+Enter` と `Esc` を先回りして拾います）。

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

## ビルド状況

GitHub Actions（`.github/workflows/android.yml`）でビルドとテストを実行しています。
[最新の実行](https://github.com/ookimitsuru-ctrl/desktop-tutorial/actions/runs/34109981250)まで
グリーンで、UI 層を含む全ソースのコンパイル、Room のコード生成、
APK のパッケージングまで通ることが確認できています。

| 項目 | 結果 |
| --- | --- |
| `./gradlew testDebugUnitTest`（＝全ソースのコンパイル＋ユニットテスト20件） | 成功 |
| `./gradlew assembleDebug` | 成功 |
| デバッグ APK | 生成・アーティファクトとして保存 |

### APK の入手とインストール

ビルド済みの APK は Actions の実行ページ下部「Artifacts」の `app-debug-apk` から
ダウンロードできます（GitHub にログインした状態で開いてください）。

- 直リンク: https://github.com/ookimitsuru-ctrl/desktop-tutorial/actions/runs/34109981250/artifacts/10014058531
- 実行ページ: https://github.com/ookimitsuru-ctrl/desktop-tutorial/actions/runs/34109981250

GitHub CLI があれば一行です。

```bash
gh run download 34109981250 -R ookimitsuru-ctrl/desktop-tutorial -n app-debug-apk
adb install -r app-debug.apk        # USB 接続した端末へ
```

スマホに直接ダウンロードした場合は、ファイルアプリから APK をタップし、
「提供元不明のアプリのインストール」を許可してください。

### 手元に持ってくる

```bash
git clone -b claude/android-bullet-journal-go0o5z \
  https://github.com/ookimitsuru-ctrl/desktop-tutorial.git bullet-journal
```

Android Studio でそのフォルダを開けばビルドできます（JDK 17 と Android SDK 35 が必要）。

なお、この開発コンテナ自体からは `dl.google.com`（Android Gradle Plugin・androidx・
Android SDK の唯一の配布元）へ到達できないため、ローカルでのビルドはできません。
そのため CI 上でビルドしています。
