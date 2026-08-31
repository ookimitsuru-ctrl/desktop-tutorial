package com.bujo.app

import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.TaskState
import com.bujo.app.data.model.bulletGlyph
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class BulletTest {

    private fun task(state: TaskState) = bulletGlyph(EntryType.TASK, state)

    @Test
    fun `タスクの状態がバレット記号に対応する`() {
        assertEquals("•", task(TaskState.OPEN))
        assertEquals("✕", task(TaskState.DONE))
        assertEquals("＞", task(TaskState.MIGRATED))
        assertEquals("＜", task(TaskState.SCHEDULED))
        assertEquals("〜", task(TaskState.CANCELLED))
    }

    @Test
    fun `イベントとメモは状態によらず記号が変わらない`() {
        assertEquals("○", bulletGlyph(EntryType.EVENT, TaskState.DONE))
        assertEquals("—", bulletGlyph(EntryType.NOTE, TaskState.OPEN))
    }

    @Test
    fun `デイリーログの作成時に日付と月キーが揃う`() {
        val entry = Entry.daily(LocalDate.of(2026, 8, 30), "原稿を書く")
        assertEquals("2026-08-30", entry.date)
        assertEquals("2026-08", entry.monthKey)
        assertTrue(entry.isOpenTask)
        assertFalse(entry.copy(state = TaskState.DONE).isOpenTask)
    }
}
