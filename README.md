# 文字起こしカメラ

スマホのカメラで撮影した文書・看板・メモなどの文字を読み取り、テキストに変換（文字起こし）する Android アプリです。

## 主な機能

- **カメラで撮影して文字を読み取り** — 撮影するとすぐに文字認識を行います
- **ギャラリーの画像からも読み取り** — 既存の写真やスクリーンショットにも対応
- **日本語・英数字に対応** — Google ML Kit の日本語モデルを使用（英数字も認識）
- **オフラインで動作** — 認識モデルはアプリに同梱されており、画像が外部に送信されることはありません
- **読み取り結果の編集・コピー・共有** — 誤認識をその場で修正し、クリップボードへコピーや他アプリへ共有できます
- **「改行を結合」** — 紙面の折り返しで入った改行を段落ごとにまとめます（日本語は詰めて、英単語の間は空白で結合）
- **ライト（トーチ）の切り替え、タップでピント合わせ、ピンチでズーム**

## 使い方

1. アプリを起動し、カメラの使用を許可します
2. 文字が画面に収まるようにしてシャッターボタンを押します（左下のボタンでギャラリーから選ぶこともできます）
3. 読み取り結果が表示されます。必要に応じて修正し、「コピー」または右上の共有ボタンで利用します
4. 「撮り直す」または戻るボタンでカメラに戻ります

## APK の入手方法

GitHub Actions がプッシュのたびにデバッグ版 APK をビルドします。

1. リポジトリの **Actions** タブを開き、最新の「Android build」の実行結果を選択します
2. 画面下部の **Artifacts** から `mojiokoshi-debug-apk` をダウンロードして解凍します
3. `app-debug.apk` をスマホに転送し、インストールします（「提供元不明のアプリ」のインストール許可が必要です）

> デバッグ版はビルドごとに署名鍵が変わるため、上書きインストールできない場合は古いアプリを一度アンインストールしてください。

## 自分でビルドする場合

Android Studio でこのフォルダを開いて実行するか、Android SDK が入った環境で次のコマンドを実行します。

```sh
./gradlew assembleDebug
# 出力先: app/build/outputs/apk/debug/app-debug.apk
```

単体テスト:

```sh
./gradlew testDebugUnitTest
```

## 動作環境・技術構成

- Android 8.0（API 26）以上
- Kotlin / Jetpack Compose（Material 3）
- CameraX（`LifecycleCameraController`）
- ML Kit Text Recognition v2（日本語モデル・端末内処理）

## ソース構成

```
app/src/main/java/com/example/mojiokoshi/
├── MainActivity.kt          # 画面の切り替え（カメラ ⇔ 結果）
├── OcrViewModel.kt          # 画像の読み込みと文字認識の実行
├── OcrUiState.kt            # 画面の状態
├── ocr/
│   ├── ImageLoader.kt       # 画像の読み込み（向き補正・縮小）
│   ├── RecognizedText.kt    # 認識結果の保持
│   └── TextFormatter.kt     # 改行の結合・文字数カウント
└── ui/
    ├── camera/CameraScreen.kt   # カメラ画面・権限リクエスト
    ├── result/ResultScreen.kt   # 読み取り結果の表示・編集・コピー・共有
    └── theme/Theme.kt
```

※ パッケージ名 `com.example.mojiokoshi` は仮のものです。Google Play で公開する場合は `app/build.gradle.kts` の `applicationId` を独自のものに変更してください。
