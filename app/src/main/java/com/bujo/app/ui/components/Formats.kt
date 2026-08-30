package com.bujo.app.ui.components

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle
import java.util.Locale

private val JP = Locale.JAPAN

fun LocalDate.formatFull(): String =
    "${year}年${monthValue}月${dayOfMonth}日（${dayOfWeek.shortJp()}）"

fun LocalDate.formatShort(): String = "${monthValue}/${dayOfMonth}（${dayOfWeek.shortJp()}）"

fun YearMonth.formatJp(): String = "${year}年${monthValue}月"

fun DayOfWeek.shortJp(): String = getDisplayName(TextStyle.NARROW, JP)

val weekHeaders: List<String> = listOf("月", "火", "水", "木", "金", "土", "日")

fun relativeLabel(date: LocalDate, today: LocalDate = LocalDate.now()): String? = when (date) {
    today -> "今日"
    today.minusDays(1) -> "昨日"
    today.plusDays(1) -> "明日"
    else -> null
}
