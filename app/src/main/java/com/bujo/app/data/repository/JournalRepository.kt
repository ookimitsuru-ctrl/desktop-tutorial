package com.bujo.app.data.repository

import com.bujo.app.data.local.CollectionSummary
import com.bujo.app.data.local.DayCount
import com.bujo.app.data.local.JournalDao
import com.bujo.app.data.local.MonthSummary
import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.JournalCollection
import com.bujo.app.data.model.LogType
import com.bujo.app.data.model.Signifier
import com.bujo.app.data.model.TaskState
import kotlinx.coroutines.flow.Flow
import java.time.LocalDate
import java.time.YearMonth

/**
 * バレットジャーナルの操作をまとめたリポジトリ。
 * 「移動（マイグレーション）」は元のバレットを > や < に書き換え、
 * 移動先に新しいバレットを書き写す——という紙の手順をそのまま再現している。
 */
class JournalRepository(private val dao: JournalDao) {

    // ---------- 読み取り ----------

    fun entriesForDay(date: LocalDate): Flow<List<Entry>> = dao.entriesForDay(date.toString())

    fun entriesForMonthlyLog(month: YearMonth): Flow<List<Entry>> =
        dao.entriesForMonthlyLog(month.toString())

    fun futureEntries(from: YearMonth, months: Int): Flow<List<Entry>> =
        dao.futureEntries(from.toString(), from.plusMonths((months - 1).toLong()).toString())

    fun entriesForCollection(collectionId: Long): Flow<List<Entry>> =
        dao.entriesForCollection(collectionId)

    fun dayCounts(month: YearMonth): Flow<List<DayCount>> = dao.dayCounts(month.toString())

    fun collections(): Flow<List<JournalCollection>> = dao.collections()

    fun collectionSummaries(): Flow<List<CollectionSummary>> = dao.collectionSummaries()

    fun collection(id: Long): Flow<JournalCollection?> = dao.observeCollection(id)

    fun monthSummaries(): Flow<List<MonthSummary>> = dao.monthSummaries()

    fun search(query: String): Flow<List<Entry>> = dao.search(query)

    fun pendingMigrations(today: LocalDate): Flow<List<Entry>> =
        dao.openTasksBefore(today.toString(), YearMonth.from(today).toString())

    fun pendingMigrationCount(today: LocalDate): Flow<Int> =
        dao.openTaskCountBefore(today.toString(), YearMonth.from(today).toString())

    // ---------- 追加 ----------

    suspend fun addToDay(
        date: LocalDate,
        content: String,
        type: EntryType,
        signifier: Signifier = Signifier.NONE,
        note: String? = null
    ): Long = dao.insert(
        Entry.daily(date, content.trim(), type).copy(
            signifier = signifier,
            note = note?.takeIf { it.isNotBlank() },
            sortOrder = dao.nextOrderForDay(date.toString())
        )
    )

    suspend fun addToMonthlyLog(
        month: YearMonth,
        content: String,
        type: EntryType,
        signifier: Signifier = Signifier.NONE,
        note: String? = null
    ): Long = dao.insert(
        Entry.monthly(month, content.trim(), type).copy(
            signifier = signifier,
            note = note?.takeIf { it.isNotBlank() },
            sortOrder = dao.nextOrderForMonth(LogType.MONTHLY.name, month.toString())
        )
    )

    suspend fun addToFutureLog(
        month: YearMonth,
        content: String,
        type: EntryType,
        signifier: Signifier = Signifier.NONE,
        note: String? = null
    ): Long = dao.insert(
        Entry.future(month, content.trim(), type).copy(
            signifier = signifier,
            note = note?.takeIf { it.isNotBlank() },
            sortOrder = dao.nextOrderForMonth(LogType.FUTURE.name, month.toString())
        )
    )

    suspend fun addToCollection(
        collectionId: Long,
        content: String,
        type: EntryType,
        signifier: Signifier = Signifier.NONE,
        note: String? = null
    ): Long = dao.insert(
        Entry.collection(collectionId, content.trim(), type).copy(
            signifier = signifier,
            note = note?.takeIf { it.isNotBlank() },
            sortOrder = dao.nextOrderForCollection(collectionId)
        )
    )

    // ---------- 編集 ----------

    suspend fun updateEntry(entry: Entry) = dao.update(entry.touched())

    suspend fun deleteEntry(entry: Entry) = dao.delete(entry)

    /** バレットをタップしたときの状態遷移: 未完了 → 完了 → 未完了 */
    suspend fun toggleTask(entry: Entry) {
        if (entry.type != EntryType.TASK) return
        val next = when (entry.state) {
            TaskState.DONE -> TaskState.OPEN
            else -> TaskState.DONE
        }
        dao.update(entry.copy(state = next).touched())
    }

    suspend fun setState(entry: Entry, state: TaskState) =
        dao.update(entry.copy(state = state).touched())

    suspend fun setSignifier(entry: Entry, signifier: Signifier) =
        dao.update(entry.copy(signifier = signifier).touched())

    /** 並び替え（表示順のリストをそのまま保存する） */
    suspend fun reorder(entries: List<Entry>) =
        dao.updateAll(entries.mapIndexed { index, entry -> entry.copy(sortOrder = index).touched() })

    // ---------- マイグレーション（移動） ----------

    /** 別の日のデイリーログへ移す（元は > 印） */
    suspend fun migrateToDay(entry: Entry, date: LocalDate) {
        dao.update(entry.copy(state = TaskState.MIGRATED).touched())
        dao.insert(
            entry.copyForMove(
                logType = LogType.DAILY,
                date = date.toString(),
                monthKey = YearMonth.from(date).toString(),
                collectionId = null,
                order = dao.nextOrderForDay(date.toString())
            )
        )
    }

    /** マンスリーログへ移す（元は > 印） */
    suspend fun migrateToMonth(entry: Entry, month: YearMonth) {
        dao.update(entry.copy(state = TaskState.MIGRATED).touched())
        dao.insert(
            entry.copyForMove(
                logType = LogType.MONTHLY,
                date = null,
                monthKey = month.toString(),
                collectionId = null,
                order = dao.nextOrderForMonth(LogType.MONTHLY.name, month.toString())
            )
        )
    }

    /** フューチャーログへ送る（元は < 印） */
    suspend fun scheduleToFuture(entry: Entry, month: YearMonth) {
        dao.update(entry.copy(state = TaskState.SCHEDULED).touched())
        dao.insert(
            entry.copyForMove(
                logType = LogType.FUTURE,
                date = null,
                monthKey = month.toString(),
                collectionId = null,
                order = dao.nextOrderForMonth(LogType.FUTURE.name, month.toString())
            )
        )
    }

    /** コレクションへ移す（元は > 印） */
    suspend fun migrateToCollection(entry: Entry, collectionId: Long) {
        dao.update(entry.copy(state = TaskState.MIGRATED).touched())
        dao.insert(
            entry.copyForMove(
                logType = LogType.COLLECTION,
                date = null,
                monthKey = null,
                collectionId = collectionId,
                order = dao.nextOrderForCollection(collectionId)
            )
        )
    }

    /** 「やらない」と決めて手放す（~ 印） */
    suspend fun cancel(entry: Entry) = setState(entry, TaskState.CANCELLED)

    /**
     * 月初のセットアップ: フューチャーログのその月の項目を
     * マンスリーログへ書き写す。すでに引き継ぎ済みのものは対象外。
     */
    suspend fun pullFutureLogInto(month: YearMonth): Int {
        // 引き継ぎ済み（＞ の印がついたもの）は二度と対象にしない
        val pending = dao.futureEntriesForMonth(month.toString())
            .filter { it.state == TaskState.OPEN }
        var order = dao.nextOrderForMonth(LogType.MONTHLY.name, month.toString())
        pending.forEach { entry ->
            dao.update(entry.copy(state = TaskState.MIGRATED).touched())
            dao.insert(
                entry.copyForMove(
                    logType = LogType.MONTHLY,
                    date = null,
                    monthKey = month.toString(),
                    collectionId = null,
                    order = order++
                )
            )
        }
        return pending.size
    }

    // ---------- コレクション ----------

    suspend fun createCollection(title: String, description: String? = null): Long =
        dao.insertCollection(
            JournalCollection(
                title = title.trim(),
                description = description?.takeIf { it.isNotBlank() },
                sortOrder = dao.nextCollectionOrder()
            )
        )

    suspend fun updateCollection(collection: JournalCollection) = dao.updateCollection(collection)

    suspend fun deleteCollection(collection: JournalCollection) {
        dao.deleteEntriesOfCollection(collection.id)
        dao.deleteCollection(collection)
    }

    private fun Entry.touched() = copy(updatedAt = System.currentTimeMillis())

    private fun Entry.copyForMove(
        logType: LogType,
        date: String?,
        monthKey: String?,
        collectionId: Long?,
        order: Int
    ) = copy(
        id = 0,
        logType = logType,
        date = date,
        monthKey = monthKey,
        collectionId = collectionId,
        state = if (type == EntryType.TASK) TaskState.OPEN else state,
        sortOrder = order,
        migratedFromId = id,
        createdAt = System.currentTimeMillis(),
        updatedAt = System.currentTimeMillis()
    )
}
