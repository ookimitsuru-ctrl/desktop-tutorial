# AT ARENA CLASH

Android向け 3D対面式ロボット対戦ゲーム。
機体デザインは **装甲騎兵ボトムズ** のAT（アーマードトルーパー）を思わせる武骨な低スラスターの人型MS、
ゲームシステムは **セガ「バーチャロン」** のロックオン対面カメラ + ダッシュ格闘 + 実弾/ミサイル戦を踏襲した
1対1タイマン対戦を実装しています。

Three.js + WebGL でフル3D実装しており、Android Chrome でそのまま遊べます。
Capacitor でラップすればそのままネイティブAPKとして書き出せる構成になっています。

## 遊び方

- **左スティック**：移動（ロックオンした相手を基準に前後/左右にダッシュ移動）
- **JUMP**：ジャンプ（空中射撃可）
- **DASH**：ブーストダッシュ（回避・回り込み。ブーストゲージ消費）
- **SABER**：近接ビームサーベル（間合いに入ると大ダメージ＋ダウン値大）
- **MSL（MISSILE）**：誘導ミサイル（弾数制限あり、自動回復）
- **SHOT**：腕部バルカン（連射可能、クールタイムのみ）

自機・敵機は常に相手を自動ロックオンして向き合う「対面式」戦闘で、カメラも
バーチャロンのように自機の背後から相手との軸線を捉え続けます。

キーボードでも操作可能（開発確認用）：`WASD`移動 / `Shift`ダッシュ / `Space`ジャンプ /
`J`ショット / `K`ミサイル / `L`サーベル。

## 開発

```bash
npm install
npm run dev       # 開発サーバー（PC/スマホブラウザで確認）
npm run build      # 本番ビルド → dist/
npm run preview    # ビルド結果をローカル確認
```

## Androidアプリ（APK）としてビルドする

[Capacitor](https://capacitorjs.com/) でラップしたネイティブAndroidプロジェクトを
**`android/` ディレクトリにコミット済み**です。`npx cap add android` は不要で、
Android SDKが使える環境であればそのままビルドできます。

```bash
npm install
npm run android:sync    # vite build + Web資産を android/ に反映
cd android
./gradlew assembleDebug # -> android/app/build/outputs/apk/debug/app-debug.apk
```

または Android Studio で `android/` フォルダを開いて `Build > Build Bundle(s) / APK(s) > Build APK(s)`
でも生成できます（`npm run android:open` でも開けます）。

ソースコード（`src/`）を変更した場合は、必ず `npm run android:sync` を実行してから
Gradleビルド／Android Studioでのビルドを行ってください（`android/app/src/main/assets/public`
配下のWeb資産を同期し直す必要があるため）。

> **注記**：このリポジトリを作成した開発コンテナはネットワークポリシーにより
> `dl.google.com`（Android Gradle PluginやAndroidXライブラリの配布元）への
> アクセスがブロックされており、コンテナ内では実際の `.apk` ファイルを
> コンパイルできませんでした。プロジェクト自体はGradleの依存解決の直前まで
> 正しく構成できていることを確認済みです。実際のAPK生成は、通常のインターネット
> アクセスがあるご自身のPC（Android Studio導入済み）か、GitHub Actions等のCI環境で
> 上記コマンドを実行してください。

`capacitor.config.json` に appId（`com.atarena.clash`）/ appName / webDir を設定済みです。
アプリアイコンやスプラッシュ画面は `android/app/src/main/res/` 配下の
`mipmap-*` / `drawable-*` リソースを差し替えてください。

### CIで自動ビルドする（自分のPCが無くてもAPKを取得できます）

`.github/workflows/android-build.yml` を追加済みです。GitHubリポジトリの
**Actions** タブから「Build Android APK」を手動実行（`workflow_dispatch`）するか、
このブランチに `src/` や `android/` の変更をpushすると自動でビルドが走り、
実行結果の Artifacts から `at-arena-clash-debug-apk`（`app-debug.apk`）を
ダウンロードできます。GitHub Actionsのランナーは通常のインターネットアクセスを
持つため、このコンテナ内では出来なかったAPKのコンパイルが可能です。

## 実装構成

```
src/
  main.js        ゲームループ・状態遷移（開始/カウントダウン/対戦/決着）の中核
  mechBuilder.js AT風メカのプロシージャル3Dモデル生成（モノアイ・背部スラスター等）
  mech.js        機体クラス（HP/ブースト/ダッシュ/ジャンプ/攻撃/歩行アニメーション）
  arena.js       対戦アリーナ（フィールド・障害物・外周リング）生成
  weapons.js     バルカン弾・誘導ミサイル・サーベル判定
  camera.js      バーチャロン風ロックオン追従カメラ
  ai.js          敵機AI（間合い管理・回避・攻撃選択）
  input.js       タッチスティック/ボタン + キーボード入力
  hud.js         HPゲージ・ブースト・ロックオンレティクル・レーダー等のHUD更新
  audio.js       WebAudioによる効果音（外部音声ファイル不要）
```

## 今後の拡張案

- キャラクター/機体セレクト（複数AT機体・武装バリエーション）
- オンライン対戦（WebRTC/WebSocketでのP2Pマッチング）
- ステージバリエーション（複数アリーナ、破壊可能オブジェクト）
- ガード/受け身などバーチャロンの防御アクション追加
