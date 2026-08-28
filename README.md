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

このコンテナにはAndroid SDK / Android Studio が無いため、実機用APKの生成はご自身の
Android開発環境（Android Studio導入済みのPC）で行ってください。[Capacitor](https://capacitorjs.com/)
でこのWebゲームをそのままネイティブAndroidプロジェクトにラップできます。

```bash
npm install
npm run build
npm install @capacitor/core @capacitor/android
npx cap add android
npx cap copy android
npx cap open android   # Android Studio が開くので Build > Build APK
```

`capacitor.config.json` に appId / appName / webDir を設定済みです。アイコンや
スプラッシュ画面は `npx cap` 実行後に生成される `android/` プロジェクト内の
リソースを差し替えてください。

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
