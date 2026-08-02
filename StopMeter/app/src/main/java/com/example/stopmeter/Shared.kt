package com.example.stopmeter

import androidx.compose.ui.graphics.Color

// ---- 判定パラメータ ----
internal const val STOP_SPEED_KMH       = 5.0        // 停止判定しきい値 (km/h)
// 加算対象となる最小停車時間は AppState.qualifyMs（設定画面で 5〜60分・5分刻み）
internal const val TICK_MS              = 250L
internal const val RESERVE_CANCEL_SPEED = 25.0       // 予約を自動解除する速度 (km/h)
internal const val ACCEL_VAR_THRESHOLD  = 0.5        // 加速度センサーで「動いている」と判定する分散しきい値
internal const val GPS_STALE_MS         = 4_000L     // これ以上GPS更新が無いと加速度センサーに切替
internal const val APP_VERSION          = "ver.2.51" // アプリバージョン表記

// ---- 連続運転時間 警告しきい値 ----
internal const val WARN_MS   = 14_400_000L  // 4時間 → 注意（黄）
internal const val DANGER_MS = 18_000_000L  // 5時間 → 危険（赤）

// ---- 配色 ----
internal val BgColor      = Color(0xFF0C1016)
internal val PanelColor   = Color(0xFF161C26)
internal val PanelEdge    = Color(0xFF22293A)
internal val AmberColor   = Color(0xFFFFB454)
internal val GreenColor   = Color(0xFF5FD68F)
internal val IdleColor    = Color(0xFF5B6577)
internal val TextColor    = Color(0xFFE6EDF3)
internal val MutedColor   = Color(0xFF8B949E)
internal val DangerColor  = Color(0xFFFF6B6B)
internal val WarnColor    = Color(0xFFFFD166)
internal val ReserveColor = Color(0xFF5BC4FF)  // 予約ボタン色
internal val NormalColor  = Color(0xFF5BC4FF)  // 連続運転時間: 4時間未満（青）
internal val ManualColor  = Color(0xFFFF9F5B)  // 手動カウントボタン色

internal enum class StatusKind { IDLE, MOVING, PENDING, COUNTING }
internal enum class BreakWarning { NONE, WARN, DANGER }

internal class EngineState {
    var currentStopStart: Long? = null
    var smoothedSpeedKmh: Double? = null
    var lastGpsSpeedKmh: Double? = null
    var lastGpsUpdateAt: Long = 0L

    val accelBuffer = ArrayDeque<Double>()

    fun pushAccel(mag: Double) {
        accelBuffer.addLast(mag)
        if (accelBuffer.size > 40) accelBuffer.removeFirst()
    }
    fun accelVariance(): Double {
        if (accelBuffer.size < 5) return 0.0
        val mean = accelBuffer.average()
        return accelBuffer.sumOf { (it - mean) * (it - mean) } / accelBuffer.size
    }
}

internal fun fmtHMS(ms: Long): String {
    val s = ms / 1000
    return "%02d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60)
}
internal fun fmtMS(ms: Long): String {
    val s = ms / 1000
    return "%02d:%02d".format(s / 60, s % 60)
}
internal fun fmtHM(ms: Long): String {
    val m = ms / 60000
    return "%02d:%02d".format(m / 60, m % 60)
}
