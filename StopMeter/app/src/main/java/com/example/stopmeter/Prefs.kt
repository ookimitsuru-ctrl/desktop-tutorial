package com.example.stopmeter

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 1件の休憩記録（開始時刻・終了時刻・長さ） */
internal data class BreakRecord(
    val startMs: Long,
    val endMs: Long,
) {
    val durationMs: Long get() = endMs - startMs
    val durationMin: Long get() = durationMs / 60_000

    fun encode(): String = "$startMs,$endMs"

    companion object {
        fun decode(s: String): BreakRecord? {
            val p = s.split(",")
            if (p.size != 2) return null
            val a = p[0].toLongOrNull() ?: return null
            val b = p[1].toLongOrNull() ?: return null
            return BreakRecord(a, b)
        }
    }
}

internal fun fmtClock(ms: Long): String =
    SimpleDateFormat("HH:mm", Locale.JAPAN).format(Date(ms))

internal fun fmtDate(ms: Long): String =
    SimpleDateFormat("yyyy/MM/dd", Locale.JAPAN).format(Date(ms))

internal fun fmtDateTime(ms: Long): String =
    SimpleDateFormat("yyyy/MM/dd HH:mm:ss", Locale.JAPAN).format(Date(ms))

/**
 * 設定値と休憩履歴の永続化。
 * アプリを再起動しても設定・履歴が残るよう SharedPreferences に保存する。
 */
internal object Prefs {
    private const val FILE = "stopmeter_prefs"
    private const val KEY_QUALIFY_MIN = "qualify_minutes"
    private const val KEY_BREAKS      = "break_records"

    const val QUALIFY_MIN_DEFAULT = 15
    const val QUALIFY_MIN_MIN     = 5
    const val QUALIFY_MIN_MAX     = 60
    const val QUALIFY_MIN_STEP    = 5

    /** 選択可能な値: 5, 10, 15 ... 60 */
    val qualifyOptions: List<Int> =
        (QUALIFY_MIN_MIN..QUALIFY_MIN_MAX step QUALIFY_MIN_STEP).toList()

    private fun prefs(ctx: Context) =
        ctx.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    // ---- 休憩とみなす時間（分） ----
    fun loadQualifyMinutes(ctx: Context): Int =
        prefs(ctx).getInt(KEY_QUALIFY_MIN, QUALIFY_MIN_DEFAULT)

    fun saveQualifyMinutes(ctx: Context, min: Int) {
        prefs(ctx).edit().putInt(KEY_QUALIFY_MIN, min).apply()
    }

    // ---- 休憩履歴 ----
    fun loadBreaks(ctx: Context): List<BreakRecord> {
        val raw = prefs(ctx).getString(KEY_BREAKS, "") ?: ""
        if (raw.isBlank()) return emptyList()
        return raw.split(";").mapNotNull { BreakRecord.decode(it) }
    }

    fun saveBreaks(ctx: Context, list: List<BreakRecord>) {
        prefs(ctx).edit()
            .putString(KEY_BREAKS, list.joinToString(";") { it.encode() })
            .apply()
    }

    /** アプリ起動時／サービス起動時に、保存済みの設定と履歴を AppState へ読み込む */
    fun loadInto(ctx: Context) {
        AppState.qualifyMinutes = loadQualifyMinutes(ctx)
        AppState.breaks.clear()
        AppState.breaks.addAll(loadBreaks(ctx))
    }
}

/** 休憩履歴をCSV文字列に変換する（Excelでの文字化けを防ぐためBOM付きで書き出す想定） */
internal fun buildBreaksCsv(list: List<BreakRecord>): String {
    val sb = StringBuilder()
    sb.append("日付,開始時刻,終了時刻,休憩時間(分),休憩時間(HH:MM)\n")
    for (r in list) {
        sb.append(fmtDate(r.startMs)).append(',')
            .append(fmtClock(r.startMs)).append(',')
            .append(fmtClock(r.endMs)).append(',')
            .append(r.durationMin).append(',')
            .append(fmtHM(r.durationMs)).append('\n')
    }
    val totalMin = list.sumOf { it.durationMin }
    sb.append(",,合計,").append(totalMin).append(',')
        .append(fmtHM(list.sumOf { it.durationMs })).append('\n')
    return sb.toString()
}
