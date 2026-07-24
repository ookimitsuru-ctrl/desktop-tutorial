# 停車計 (Stop-Time Logger) — Kotlin / Android (Jetpack Compose)

GPSの速度（取得できない場合は加速度センサー）で「走行中」か「停止」かを判定し、
**2km/h以下を停止**、**15秒以上続いた停車のみ**を合計時間に加算するAndroidアプリです。

## 動作の仕組み

- `LocationManager` (GPS / NETWORK プロバイダ) から `location.speed` (m/s) を取得し km/h に変換
- 取得値はノイズ低減のため指数移動平均 (EMA) でならす
- 速度 ≤ 2km/h を「停止」と判定
- GPS速度が取得できない場合は、加速度センサー (`TYPE_LINEAR_ACCELERATION`) の振動量(分散)から
  走行/停止を推定するフォールバックを使用
- 停止が始まった時点を記録し、走行再開時にその停車時間が **15秒以上** であれば
  合計加算時間 (`totalMs`) に加算。15秒未満は無効として捨てる
- 15秒を超えて停車中はリアルタイムで合計表示が増えていく

主なパラメータは `MainActivity.kt` 冒頭の定数で調整できます。

```kotlin
private const val STOP_SPEED_KMH = 2.0       // 停止判定の速度しきい値 (km/h)
private const val QUALIFY_MS = 15_000L       // 加算対象となる最小停車時間 (ms)
private const val ACCEL_VAR_THRESHOLD = 0.5  // GPS速度が無い場合の加速度分散しきい値
```

## ビルド方法

1. Android Studio で `StopMeter` フォルダを「Open」（既存プロジェクトを開く）
2. Gradle Sync が完了するのを待つ
3. 実機 (Android 8.0 / API 26 以上) を接続し、Run ▶ で実行

`build.gradle.kts` 等のバージョンはAndroid Studioのバージョンによって
Sync時に互換バージョンへの更新を提案される場合があります。提案に従って更新してください。

## 権限

- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`
  「計測開始」ボタンを押した際にリクエストされます。屋外でGPSの精度が出やすい環境で使用してください。
- 加速度センサーは通常ランタイム許可不要です（Androidに権限宣言は不要）。

## 注意

- 走行中の操作は危険です。開始・停止ボタンは停車中、または同乗者の操作で行ってください。
- GPSの`speed`値は端末・電波状況によって取得できない/精度が低い場合があります。
  その場合は加速度センサーによる推定にフォールバックしますが、これはあくまで簡易的な目安です。
