package com.bujo.app

import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.LogType
import com.bujo.app.data.model.TaskState
import com.bujo.app.data.repository.JournalRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth

/** 移動（マイグレーション）まわりの振る舞いを確かめる */
class JournalRepositoryTest {

    private lateinit var dao: FakeJournalDao
    private lateinit var repository: JournalRepository

    private val yesterday = LocalDate.of(2026, 8, 30)
    private val today = LocalDate.of(2026, 8, 31)

    @Before
    fun setUp() {
        dao = FakeJournalDao()
        repository = JournalRepository(dao)
    }

    @Test
    fun `別の日へ移動すると元は移動済みになり移動先に写しが増える`() = runTest {
        repository.addToDay(yesterday, "原稿を書く", EntryType.TASK)
        val original = dao.snapshot().single()

        repository.migrateToDay(original, today)

        val all = dao.snapshot()
        assertEquals(2, all.size)
        val source = all.first { it.id == original.id }
        val copy = all.first { it.id != original.id }
        assertEquals(TaskState.MIGRATED, source.state)
        assertEquals(yesterday.toString(), source.date)
        assertEquals(TaskState.OPEN, copy.state)
        assertEquals(today.toString(), copy.date)
        assertEquals("2026-08", copy.monthKey)
        assertEquals(original.id, copy.migratedFromId)
        assertEquals("原稿を書く", copy.content)
    }

    @Test
    fun `フューチャーログへ送ると元は予定へ移動の印になる`() = runTest {
        repository.addToDay(yesterday, "健康診断を予約", EntryType.TASK)
        val original = dao.snapshot().single()

        repository.scheduleToFuture(original, YearMonth.of(2026, 11))

        val all = dao.snapshot()
        val source = all.first { it.id == original.id }
        val copy = all.first { it.id != original.id }
        assertEquals(TaskState.SCHEDULED, source.state)
        assertEquals(LogType.FUTURE, copy.logType)
        assertEquals("2026-11", copy.monthKey)
        assertNull(copy.date)
        assertEquals(TaskState.OPEN, copy.state)
    }

    @Test
    fun `コレクションへ移すと日付が外れてコレクションに属する`() = runTest {
        val collectionId = repository.createCollection("読書リスト")
        repository.addToDay(yesterday, "『バレットジャーナル』を読む", EntryType.TASK)
        val original = dao.snapshot().single()

        repository.migrateToCollection(original, collectionId)

        val copy = dao.snapshot().first { it.id != original.id }
        assertEquals(LogType.COLLECTION, copy.logType)
        assertEquals(collectionId, copy.collectionId)
        assertNull(copy.date)
        assertNull(copy.monthKey)
    }

    @Test
    fun `移動が必要なのは過ぎた日の未完了タスクだけ`() = runTest {
        repository.addToDay(yesterday, "未完了のまま", EntryType.TASK)
        repository.addToDay(yesterday, "できごと", EntryType.EVENT)
        repository.addToDay(today, "今日のタスク", EntryType.TASK)
        val done = dao.snapshot().first { it.content == "未完了のまま" }
        repository.addToDay(yesterday, "済ませた", EntryType.TASK)
        repository.toggleTask(dao.snapshot().first { it.content == "済ませた" })

        val pending = repository.pendingMigrations(today).first()

        assertEquals(listOf("未完了のまま"), pending.map { it.content })
        assertEquals(1, repository.pendingMigrationCount(today).first())
        assertTrue(done.isOpenTask)
    }

    @Test
    fun `フューチャーログはマンスリーログへまとめて書き写せる`() = runTest {
        val month = YearMonth.of(2026, 9)
        repository.addToFutureLog(month, "引っ越しの見積り", EntryType.TASK)
        repository.addToFutureLog(month, "友人の結婚式", EntryType.EVENT)
        repository.addToFutureLog(YearMonth.of(2026, 10), "来月ではない予定", EntryType.TASK)

        val moved = repository.pullFutureLogInto(month)

        assertEquals(2, moved)
        val monthly = repository.entriesForMonthlyLog(month).first()
        assertEquals(listOf("引っ越しの見積り", "友人の結婚式"), monthly.map { it.content })
        assertEquals(listOf(0, 1), monthly.map { it.sortOrder })

        // 引き継ぎ済みには ＞ の印がつき、もう一度実行しても重複しない
        val futureTask = dao.snapshot().first { it.logType == LogType.FUTURE && it.content == "引っ越しの見積り" }
        assertEquals(TaskState.MIGRATED, futureTask.state)
        assertEquals(0, repository.pullFutureLogInto(month))
        assertEquals(2, repository.entriesForMonthlyLog(month).first().size)
    }

    @Test
    fun `やらないと決めたタスクは取り消しの印になる`() = runTest {
        repository.addToDay(yesterday, "気が変わった用事", EntryType.TASK)
        val entry = dao.snapshot().single()

        repository.cancel(entry)

        assertEquals(TaskState.CANCELLED, dao.snapshot().single().state)
        assertEquals(0, repository.pendingMigrationCount(today).first())
    }

    @Test
    fun `追加した順に並び順が振られる`() = runTest {
        repository.addToDay(today, "ひとつめ", EntryType.TASK)
        repository.addToDay(today, "ふたつめ", EntryType.NOTE)
        repository.addToDay(today, "みっつめ", EntryType.EVENT)

        val entries = repository.entriesForDay(today).first()
        assertEquals(listOf(0, 1, 2), entries.map { it.sortOrder })
        assertEquals(listOf("ひとつめ", "ふたつめ", "みっつめ"), entries.map { it.content })
    }
}
