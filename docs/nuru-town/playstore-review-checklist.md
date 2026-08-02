# 塗るタウン(Nuru Town) Play ストア審査 準備チェックリスト

対象アプリ: 「塗るタウン！」— GPSで訪れた市区町村を地図上で塗っていくAndroidネイティブアプリ
パッケージ名: `jp.nulltown.app` / バージョン 1.15 (versionCode 115)
配布形態: Google ドライブ「自作app/塗るタウン！」に `nuru-town.apk` として保管(`docs/自作app-保存ルール.md` 参照、PR #2)

> **注意**: このリポジトリの `claude/nurutaun-joygaq` ブランチにある `index.html`(クリックで塗るだけのSVG塗り絵Webページ)は、実際に配布されている `nuru-town.apk` とは**別物**です。実物のAPKを解析した結果、ネイティブのGPS連動アプリであることが判明しました(クラス名は `com.example.cityconquer.*`)。本チェックリストは実際のAPKの解析結果に基づいています。

## APK解析で判明した事実

- ネイティブAndroidアプリ(WebViewラッパーではない)。`index.html`等のWebアセットは含まれない
- 権限: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `FOREGROUND_SERVICE_LOCATION`, `FOREGROUND_SERVICE`, `POST_NOTIFICATIONS`
- `TrackService` というフォアグラウンドサービスで位置情報を継続取得
- `assets/muni.json`, `geom_map.bin`, `geom_hit.bin` — 市区町村境界データを端末内に同梱し、GPS座標との照合をローカルで実施
- `ACCESS_BACKGROUND_LOCATION` は要求していない(フォアグラウンドサービス方式のため、より厳格な「バックグラウンド位置情報」ポリシーの対象外)
- 位置情報は**端末内処理のみ**、外部送信なし(開発者確認済み)
- minSdk 26 / targetSdk 36
- 署名: v2のみ
- `GoogleApiActivity` の存在から Google Play Services ライブラリを使用(Maps/Location関連の可能性)

## 必須対応チェックリスト

### 1. プライバシーポリシー(必須)
- [x] `privacy-policy.md` を実態(位置情報取得・端末内処理のみ)に合わせて作成済み
- [ ] Web上で公開できるURLを用意する(GitHub Pages、Googleサイト等)
- [ ] Play Console の「アプリのコンテンツ」→「プライバシーポリシー」欄にURLを登録
- [ ] ストア掲載ページにもプライバシーポリシーへのリンクを掲載

### 2. データセーフティ フォーム(必須)
- [ ] 位置情報(おおよそ/正確)を「収集」項目に追加するか検討する
  - Google公式の定義上、**端末外に送信しないデータは「収集」に該当しない**ため「データを収集していません」も選択しうるが、位置情報という機微なデータを扱う以上、透明性の観点から「収集するが共有はしない・端末内処理のみ」と申告する方が安全
- [ ] 「第三者と共有」は「いいえ」
- [ ] データの用途は「アプリの機能」を選択

### 3. 権限の使用目的の説明(重要)
- [ ] Play Console の審査担当者向けに、位置情報権限(Fine/Coarse)とフォアグラウンドサービス位置情報の使用目的(市区町村の訪問判定によるゲーム進行)を明記
- [ ] アプリ内で位置情報の使用目的をユーザーに明示するダイアログ・説明文があるか確認(Playポリシー上、実行時権限リクエスト前後で目的説明が推奨される)
- [ ] `ACCESS_BACKGROUND_LOCATION` を将来的に追加する場合は、Play Consoleの「機密性の高い権限の申告」フォームと、アプリ内の事前説明(Prominent Disclosure)が別途必須になる点に注意

### 4. コンテンツレーティング(IARC質問票)
- [ ] 暴力・成人向け要素は無いため「全年齢対象」で回答できる見込み
- [ ] 位置情報の使用有無を問う設問には正直に回答する

### 5. 技術要件
- [x] targetSdkVersion 36(最新要件を満たす見込み。Play Consoleアップロード時に最終確認)
- [ ] 64-bit(arm64-v8a等)対応の確認(ネイティブライブラリ非使用のためJava/Kotlinのみなら通常問題なし)
- [ ] Android App Bundle(.aab)形式での提出(現状は`.apk`のため、Play Console提出時は`.aab`が必要な場合あり)
- [ ] 実機での動作確認(クラッシュ・ANRが発生しないか、特に位置情報権限が拒否された場合の挙動)

### 6. ストア掲載情報
- [ ] アプリアイコン(高解像度版含む)
- [ ] フィーチャーグラフィック
- [ ] スクリーンショット(実際の画面と一致させる。地図を塗っていくゲーム性が伝わるものが望ましい)
- [ ] タイトル・説明文に位置情報を使う旨を含める(誤解を招かないため)
- [ ] キーワードの過剰な詰め込みを避ける

### 7. 開発者アカウント
- [ ] Play Console 開発者アカウントの本人確認が完了しているか

## 未確認・要調査事項

1. アプリ内での位置情報権限リクエスト時に、目的説明(Prominent Disclosure相当)を表示しているか(UI/コードの確認が必要)
2. 進捗データ(訪問済み市区町村)の保存先が端末内のどこか(内部ストレージ/SharedPreferences等)、バックアップ設定(自動バックアップでクラウドに含まれないか)
3. Google Play Servicesの具体的な利用機能(Maps SDK / Location API / Sign-In等、`GoogleApiActivity`の用途)
4. `.aab`形式のビルド有無(現状Googleドライブにあるのは`.apk`のみ)
