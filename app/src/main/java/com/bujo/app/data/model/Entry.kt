package com.bujo.app.data.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.time.LocalDate
import java.time.YearMonth

/**
 * ラピッドログの1行。デイリー / マンスリー / フューチャー / コレクションの
 * いずれかに属する。日付は ISO 文字列（yyyy-MM-dd）、月は yyyy-MM で保存し、
 * SQLite 上でそのまま範囲比較・並び替えができるようにしている。
 */
@Entity(
    tableName = "entries",
    indices = [
        Index("date"),
        Index("monthKey"),
        Index("collectionId"),
        Index("logType")
    ]
)
data class Entry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val content: String,
    val type: EntryType = EntryType.TASK,
    val state: TaskState = TaskState.OPEN,
    val signifier: Signifier = Signifier.NONE,
    val logType: LogType = LogType.DAILY,
    /** デイリーログの日付。マンスリー/フューチャー/コレクションでは null */
    val date: String? = null,
    /** 所属する月（yyyy-MM）。コレクション専用エントリーでは null */
    val monthKey: String? = null,
    val collectionId: Long? = null,
    /** 補足メモ（バレットの下にぶら下げる説明） */
    val note: String? = null,
    /** 同一ログ内での並び順。小さいほど上 */
    val sortOrder: Int = 0,
    /** 移動元エントリーの id（移動の履歴を辿るため） */
    val migratedFromId: Long? = null,
    @ColumnInfo(defaultValue = "0") val createdAt: Long = System.currentTimeMillis(),
    @ColumnInfo(defaultValue = "0") val updatedAt: Long = System.currentTimeMillis()
) {
    val isOpenTask: Boolean get() = type == EntryType.TASK && state == TaskState.OPEN

    val localDate: LocalDate? get() = date?.let(LocalDate::parse)

    val yearMonth: YearMonth? get() = monthKey?.let(YearMonth::parse)

    companion object {
        fun daily(date: LocalDate, content: String, type: EntryType = EntryType.TASK) = Entry(
            content = content,
            type = type,
            logType = LogType.DAILY,
            date = date.toString(),
            monthKey = YearMonth.from(date).toString()
        )

        fun monthly(month: YearMonth, content: String, type: EntryType = EntryType.TASK) = Entry(
            content = content,
            type = type,
            logType = LogType.MONTHLY,
            monthKey = month.toString()
        )

        fun future(month: YearMonth, content: String, type: EntryType = EntryType.TASK) = Entry(
            content = content,
            type = type,
            logType = LogType.FUTURE,
            monthKey = month.toString()
        )

        fun collection(collectionId: Long, content: String, type: EntryType = EntryType.TASK) = Entry(
            content = content,
            type = type,
            logType = LogType.COLLECTION,
            collectionId = collectionId
        )
    }
}

/**
 * コレクション（自由なテーマのまとめページ）。
 * 読書リスト、旅の計画、習慣トラッカーなど。
 */
@Entity(tableName = "collections")
data class JournalCollection(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val description: String? = null,
    val archived: Boolean = false,
    val sortOrder: Int = 0,
    val createdAt: Long = System.currentTimeMillis()
)
