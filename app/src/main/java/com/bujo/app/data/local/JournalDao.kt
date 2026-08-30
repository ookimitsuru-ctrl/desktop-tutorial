package com.bujo.app.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.JournalCollection
import kotlinx.coroutines.flow.Flow

@Dao
interface JournalDao {

    // ---------- エントリー ----------

    @Insert
    suspend fun insert(entry: Entry): Long

    @Insert
    suspend fun insertAll(entries: List<Entry>): List<Long>

    @Update
    suspend fun update(entry: Entry)

    @Update
    suspend fun updateAll(entries: List<Entry>)

    @Delete
    suspend fun delete(entry: Entry)

    @Query("SELECT * FROM entries WHERE id = :id")
    suspend fun findById(id: Long): Entry?

    @Query("SELECT * FROM entries WHERE id = :id")
    fun observeById(id: Long): Flow<Entry?>

    /** デイリーログ（1日分） */
    @Query("SELECT * FROM entries WHERE logType = 'DAILY' AND date = :date ORDER BY sortOrder, id")
    fun entriesForDay(date: String): Flow<List<Entry>>

    /** マンスリーログのタスク/イベント一覧 */
    @Query("SELECT * FROM entries WHERE logType = 'MONTHLY' AND monthKey = :month ORDER BY sortOrder, id")
    fun entriesForMonthlyLog(month: String): Flow<List<Entry>>

    /** フューチャーログ（指定した月の範囲） */
    @Query(
        "SELECT * FROM entries WHERE logType = 'FUTURE' AND monthKey BETWEEN :startMonth AND :endMonth " +
            "ORDER BY monthKey, sortOrder, id"
    )
    fun futureEntries(startMonth: String, endMonth: String): Flow<List<Entry>>

    /** ある月のフューチャーログ（マンスリーへ引き継ぐときに使う） */
    @Query("SELECT * FROM entries WHERE logType = 'FUTURE' AND monthKey = :month ORDER BY sortOrder, id")
    suspend fun futureEntriesForMonth(month: String): List<Entry>

    @Query("SELECT * FROM entries WHERE collectionId = :collectionId ORDER BY sortOrder, id")
    fun entriesForCollection(collectionId: Long): Flow<List<Entry>>

    /** デイリーログのカレンダー用の日別集計 */
    @Query(
        "SELECT date AS date, COUNT(*) AS total, " +
            "SUM(CASE WHEN type = 'TASK' AND state = 'OPEN' THEN 1 ELSE 0 END) AS openTasks " +
            "FROM entries WHERE logType = 'DAILY' AND date IS NOT NULL AND monthKey = :month GROUP BY date"
    )
    fun dayCounts(month: String): Flow<List<DayCount>>

    /**
     * マイグレーション（移動）の対象。
     * 過ぎた日のデイリーログ、および終わった月のマンスリーログに残った未完了タスク。
     */
    @Query(
        "SELECT * FROM entries WHERE type = 'TASK' AND state = 'OPEN' AND (" +
            "(logType = 'DAILY' AND date < :today) OR " +
            "(logType = 'MONTHLY' AND monthKey < :currentMonth)) " +
            "ORDER BY date IS NULL, date, monthKey, sortOrder, id"
    )
    fun openTasksBefore(today: String, currentMonth: String): Flow<List<Entry>>

    @Query(
        "SELECT COUNT(*) FROM entries WHERE type = 'TASK' AND state = 'OPEN' AND (" +
            "(logType = 'DAILY' AND date < :today) OR " +
            "(logType = 'MONTHLY' AND monthKey < :currentMonth))"
    )
    fun openTaskCountBefore(today: String, currentMonth: String): Flow<Int>

    @Query(
        "SELECT * FROM entries WHERE content LIKE '%' || :query || '%' OR note LIKE '%' || :query || '%' " +
            "ORDER BY updatedAt DESC LIMIT 200"
    )
    fun search(query: String): Flow<List<Entry>>

    @Query(
        "SELECT monthKey AS monthKey, COUNT(*) AS total, " +
            "SUM(CASE WHEN type = 'TASK' AND state = 'OPEN' THEN 1 ELSE 0 END) AS openTasks " +
            "FROM entries WHERE monthKey IS NOT NULL GROUP BY monthKey ORDER BY monthKey DESC"
    )
    fun monthSummaries(): Flow<List<MonthSummary>>

    @Query("SELECT COALESCE(MAX(sortOrder), -1) + 1 FROM entries WHERE logType = 'DAILY' AND date = :date")
    suspend fun nextOrderForDay(date: String): Int

    @Query("SELECT COALESCE(MAX(sortOrder), -1) + 1 FROM entries WHERE logType = :logType AND monthKey = :month")
    suspend fun nextOrderForMonth(logType: String, month: String): Int

    @Query("SELECT COALESCE(MAX(sortOrder), -1) + 1 FROM entries WHERE collectionId = :collectionId")
    suspend fun nextOrderForCollection(collectionId: Long): Int

    // ---------- コレクション ----------

    @Insert
    suspend fun insertCollection(collection: JournalCollection): Long

    @Update
    suspend fun updateCollection(collection: JournalCollection)

    @Delete
    suspend fun deleteCollection(collection: JournalCollection)

    @Query("SELECT * FROM collections WHERE id = :id")
    fun observeCollection(id: Long): Flow<JournalCollection?>

    @Query("SELECT * FROM collections ORDER BY archived, sortOrder, id")
    fun collections(): Flow<List<JournalCollection>>

    @Transaction
    @Query(
        "SELECT c.*, " +
            "(SELECT COUNT(*) FROM entries e WHERE e.collectionId = c.id) AS total, " +
            "(SELECT COUNT(*) FROM entries e WHERE e.collectionId = c.id AND e.type = 'TASK' AND e.state = 'OPEN') AS openTasks " +
            "FROM collections c ORDER BY c.archived, c.sortOrder, c.id"
    )
    fun collectionSummaries(): Flow<List<CollectionSummary>>

    @Query("DELETE FROM entries WHERE collectionId = :collectionId")
    suspend fun deleteEntriesOfCollection(collectionId: Long)

    @Query("SELECT COALESCE(MAX(sortOrder), -1) + 1 FROM collections")
    suspend fun nextCollectionOrder(): Int
}
