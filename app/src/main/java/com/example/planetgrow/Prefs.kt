package com.example.planetgrow

import android.content.Context
import java.time.LocalDate
import java.time.ZoneId

/**
 * 惑星の誕生日 (初回起動日) を覚えておく。
 * 「地球の 1 日 = 惑星の 1 日」なので、ここからの経過日数がそのまま成長日数になる。
 */
class PlanetPrefs(context: Context) {

    private val sp = context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    /** 初回起動日 (epoch day)。まだ無ければ今日を記録する。 */
    fun startEpochDay(zone: ZoneId = ZoneId.systemDefault()): Long {
        val saved = sp.getLong(KEY_START, -1L)
        if (saved >= 0L) return saved
        val today = LocalDate.now(zone).toEpochDay()
        sp.edit().putLong(KEY_START, today).apply()
        return today
    }

    /** 今日が何日目か (初日は 1)。 */
    fun dayNumber(zone: ZoneId = ZoneId.systemDefault()): Int {
        val start = startEpochDay(zone)
        val today = LocalDate.now(zone).toEpochDay()
        return (today - start + 1L).coerceIn(1L, 100000L).toInt()
    }

    companion object {
        private const val NAME = "planet_grow"
        private const val KEY_START = "start_epoch_day"
    }
}
