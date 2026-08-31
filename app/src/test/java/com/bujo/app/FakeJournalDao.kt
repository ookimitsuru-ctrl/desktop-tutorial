package com.bujo.app

import com.bujo.app.data.local.CollectionSummary
import com.bujo.app.data.local.DayCount
import com.bujo.app.data.local.JournalDao
import com.bujo.app.data.local.MonthSummary
import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.JournalCollection
import com.bujo.app.data.model.LogType
import com.bujo.app.data.model.TaskState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/** テスト用のインメモリ DAO。SQLite の代わりにリストで同じ振る舞いを再現する。 */
class FakeJournalDao : JournalDao {

    val entries = MutableStateFlow<List<Entry>>(emptyList())
    private val collectionStore = MutableStateFlow<List<JournalCollection>>(emptyList())
    private var nextEntryId = 1L
    private var nextCollectionId = 1L

    fun snapshot(): List<Entry> = entries.value

    override suspend fun insert(entry: Entry): Long {
        val id = nextEntryId++
        entries.value = entries.value + entry.copy(id = id)
        return id
    }

    override suspend fun insertAll(entries: List<Entry>): List<Long> = entries.map { insert(it) }

    override suspend fun update(entry: Entry) {
        entries.value = entries.value.map { if (it.id == entry.id) entry else it }
    }

    override suspend fun updateAll(entries: List<Entry>) = entries.forEach { update(it) }

    override suspend fun delete(entry: Entry) {
        entries.value = entries.value.filterNot { it.id == entry.id }
    }

    override suspend fun findById(id: Long): Entry? = entries.value.find { it.id == id }

    override fun observeById(id: Long): Flow<Entry?> = entries.map { list -> list.find { it.id == id } }

    override fun entriesForDay(date: String): Flow<List<Entry>> = entries.map { list ->
        list.filter { it.logType == LogType.DAILY && it.date == date }.sortedBy { it.sortOrder }
    }

    override fun entriesForMonthlyLog(month: String): Flow<List<Entry>> = entries.map { list ->
        list.filter { it.logType == LogType.MONTHLY && it.monthKey == month }.sortedBy { it.sortOrder }
    }

    override fun futureEntries(startMonth: String, endMonth: String): Flow<List<Entry>> =
        entries.map { list ->
            list.filter {
                it.logType == LogType.FUTURE && it.monthKey != null &&
                    it.monthKey >= startMonth && it.monthKey <= endMonth
            }.sortedWith(compareBy({ it.monthKey }, { it.sortOrder }))
        }

    override suspend fun futureEntriesForMonth(month: String): List<Entry> =
        entries.value.filter { it.logType == LogType.FUTURE && it.monthKey == month }
            .sortedBy { it.sortOrder }

    override fun entriesForCollection(collectionId: Long): Flow<List<Entry>> = entries.map { list ->
        list.filter { it.collectionId == collectionId }.sortedBy { it.sortOrder }
    }

    override fun dayCounts(month: String): Flow<List<DayCount>> = entries.map { list ->
        list.filter { it.logType == LogType.DAILY && it.monthKey == month && it.date != null }
            .groupBy { it.date!! }
            .map { (date, group) -> DayCount(date, group.size, group.count { it.isOpenTask }) }
    }

    override fun openTasksBefore(today: String, currentMonth: String): Flow<List<Entry>> =
        entries.map { list -> list.filter { it.isPending(today, currentMonth) } }

    override fun openTaskCountBefore(today: String, currentMonth: String): Flow<Int> =
        entries.map { list -> list.count { it.isPending(today, currentMonth) } }

    override fun search(query: String): Flow<List<Entry>> = entries.map { list ->
        list.filter { it.content.contains(query) || it.note?.contains(query) == true }
    }

    override fun monthSummaries(): Flow<List<MonthSummary>> = entries.map { list ->
        list.filter { it.monthKey != null }
            .groupBy { it.monthKey!! }
            .map { (month, group) -> MonthSummary(month, group.size, group.count { it.isOpenTask }) }
            .sortedByDescending { it.monthKey }
    }

    override suspend fun nextOrderForDay(date: String): Int =
        (entries.value.filter { it.logType == LogType.DAILY && it.date == date }
            .maxOfOrNull { it.sortOrder } ?: -1) + 1

    override suspend fun nextOrderForMonth(logType: String, month: String): Int =
        (entries.value.filter { it.logType.name == logType && it.monthKey == month }
            .maxOfOrNull { it.sortOrder } ?: -1) + 1

    override suspend fun nextOrderForCollection(collectionId: Long): Int =
        (entries.value.filter { it.collectionId == collectionId }
            .maxOfOrNull { it.sortOrder } ?: -1) + 1

    override suspend fun insertCollection(collection: JournalCollection): Long {
        val id = nextCollectionId++
        collectionStore.value = collectionStore.value + collection.copy(id = id)
        return id
    }

    override suspend fun updateCollection(collection: JournalCollection) {
        collectionStore.value = collectionStore.value.map { if (it.id == collection.id) collection else it }
    }

    override suspend fun deleteCollection(collection: JournalCollection) {
        collectionStore.value = collectionStore.value.filterNot { it.id == collection.id }
    }

    override fun observeCollection(id: Long): Flow<JournalCollection?> =
        collectionStore.map { list -> list.find { it.id == id } }

    override fun collections(): Flow<List<JournalCollection>> = collectionStore

    override fun collectionSummaries(): Flow<List<CollectionSummary>> = collectionStore.map { list ->
        list.map { collection ->
            val owned = entries.value.filter { it.collectionId == collection.id }
            CollectionSummary(collection, owned.size, owned.count { it.isOpenTask })
        }
    }

    override suspend fun deleteEntriesOfCollection(collectionId: Long) {
        entries.value = entries.value.filterNot { it.collectionId == collectionId }
    }

    override suspend fun nextCollectionOrder(): Int =
        (collectionStore.value.maxOfOrNull { it.sortOrder } ?: -1) + 1

    private fun Entry.isPending(today: String, currentMonth: String): Boolean =
        type == EntryType.TASK && state == TaskState.OPEN && (
            (logType == LogType.DAILY && date != null && date < today) ||
                (logType == LogType.MONTHLY && monthKey != null && monthKey < currentMonth)
            )
}
