package com.example.stopmeter

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * アプリ全体で共有する計測状態。
 * StopTimerService（バックグラウンド計測）と MainActivity（UI表示）の両方から
 * 同一プロセス内で直接参照・更新する。
 */
internal object AppState {
    var running          by mutableStateOf(false)
    var totalMs          by mutableStateOf(0L)
    var currentStopMs    by mutableStateOf(0L)
    var displaySpeed     by mutableStateOf<Double?>(null)
    var statusKind       by mutableStateOf(StatusKind.IDLE)
    var message          by mutableStateOf("")

    // ---- 連続運転時間 ----
    var lastBreakEndMs       by mutableStateOf<Long?>(null)
    var measurementStartMs   by mutableStateOf<Long?>(null)
    var intervalMs           by mutableStateOf(0L)
    var breakWarning         by mutableStateOf(BreakWarning.NONE)
    var currentStopQualified by mutableStateOf(false)

    // ---- 予約 ----
    var reserved by mutableStateOf(false)

    // ---- 手動カウント ----
    var manualStop by mutableStateOf(false)

    // ---- 設定: 休憩とみなす停車時間（分） ----
    var qualifyMinutes by mutableStateOf(Prefs.QUALIFY_MIN_DEFAULT)

    /** 加算対象となる最小停車時間 (ms)。設定値から算出する */
    val qualifyMs: Long get() = qualifyMinutes * 60_000L

    // ---- 休憩履歴 ----
    val breaks = mutableStateListOf<BreakRecord>()

    /** 休憩が成立したときに履歴へ追加し、永続化する */
    fun recordBreak(ctx: Context?, startMs: Long, endMs: Long) {
        breaks.add(BreakRecord(startMs, endMs))
        if (ctx != null) Prefs.saveBreaks(ctx, breaks.toList())
    }

    val engine = EngineState()

    fun fullReset() {
        totalMs             = 0L
        currentStopMs       = 0L
        lastBreakEndMs       = null
        measurementStartMs   = if (running) System.currentTimeMillis() else null
        intervalMs           = 0L
        breakWarning         = BreakWarning.NONE
        reserved             = false
        manualStop           = false
        engine.currentStopStart = null
        statusKind = if (running) statusKind else StatusKind.IDLE
    }
}
