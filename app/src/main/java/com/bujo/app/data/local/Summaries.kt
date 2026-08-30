package com.bujo.app.data.local

import androidx.room.Embedded
import com.bujo.app.data.model.JournalCollection

/** インデックス表示用: 月ごとの件数集計 */
data class MonthSummary(
    val monthKey: String,
    val total: Int,
    val openTasks: Int
)

/** コレクション一覧用: 件数付きコレクション */
data class CollectionSummary(
    @Embedded val collection: JournalCollection,
    val total: Int,
    val openTasks: Int
)

/** マンスリーログのカレンダー用: 日ごとの件数 */
data class DayCount(
    val date: String,
    val total: Int,
    val openTasks: Int
)
