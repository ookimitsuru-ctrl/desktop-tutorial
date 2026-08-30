package com.bujo.app

import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.TaskState
import com.bujo.app.ui.components.bulletGlyph
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class BulletTest {

    private fun task(state: TaskState) =
        Entry(content = "テスト", type = EntryType.TASK, state = state)

    @Test
    fun `タスクの状態がバレット記号に対応する`() {
        assertEquals("•", bulletGlyph(task(TaskState.OPEN)))
        assertEquals("✕", bulletGlyph(task(TaskState.DONE)))
        assertEquals("＞", bulletGlyph(task(TaskState.MIGRATED)))
        assertEquals("＜", bulletGlyph(task(TaskState.SCHEDULED)))
        assertEquals("〜", bulletGlyph(task(TaskState.CANCELLED)))
    }

    @Test
    fun `イベントとメモは状態によらず記号が変わらない`() {
        val event = Entry(content = "打ち合わせ", type = EntryType.EVENT, state = TaskState.DONE)
        val note = Entry(content = "気づき", type = EntryType.NOTE, state = TaskState.OPEN)
        assertEquals("○", bulletGlyph(event))
        assertEquals("—", bulletGlyph(note))
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
