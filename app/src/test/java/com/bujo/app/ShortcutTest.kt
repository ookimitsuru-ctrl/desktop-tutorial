package com.bujo.app

import com.bujo.app.ui.input.ShortcutAction
import com.bujo.app.ui.input.ShortcutKey
import com.bujo.app.ui.input.actionFor
import com.bujo.app.ui.input.moveSelection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** 物理キーボード（Unihertz Titan など）の操作 */
class ShortcutTest {

    @Test
    fun `単独キーが操作に対応する`() {
        assertEquals(ShortcutAction.NEW_ENTRY, actionFor(ShortcutKey.N))
        assertEquals(ShortcutAction.OPEN_SEARCH, actionFor(ShortcutKey.SLASH))
        assertEquals(ShortcutAction.OPEN_MIGRATION, actionFor(ShortcutKey.M))
        assertEquals(ShortcutAction.GO_TODAY, actionFor(ShortcutKey.T))
        assertEquals(ShortcutAction.TOGGLE_SELECTED, actionFor(ShortcutKey.SPACE))
        assertEquals(ShortcutAction.DISMISS, actionFor(ShortcutKey.ESCAPE))
    }

    @Test
    fun `vim風のキーと矢印キーは同じ動きをする`() {
        assertEquals(actionFor(ShortcutKey.J), actionFor(ShortcutKey.DOWN))
        assertEquals(actionFor(ShortcutKey.K), actionFor(ShortcutKey.UP))
        assertEquals(actionFor(ShortcutKey.H), actionFor(ShortcutKey.LEFT))
        assertEquals(actionFor(ShortcutKey.L), actionFor(ShortcutKey.RIGHT))
        assertEquals(ShortcutAction.SELECT_NEXT, actionFor(ShortcutKey.J))
        assertEquals(ShortcutAction.PREVIOUS_DAY, actionFor(ShortcutKey.H))
    }

    @Test
    fun `数字キーでタブを切り替える`() {
        assertEquals(ShortcutAction.TAB_DAILY, actionFor(ShortcutKey.D1))
        assertEquals(ShortcutAction.TAB_INDEX, actionFor(ShortcutKey.D5))
    }

    @Test
    fun `保存は Ctrl+Enter だけ。他の Ctrl 併用は何もしない`() {
        assertEquals(ShortcutAction.SUBMIT, actionFor(ShortcutKey.ENTER, ctrlPressed = true))
        assertNull(actionFor(ShortcutKey.N, ctrlPressed = true))
        assertNull(actionFor(ShortcutKey.J, ctrlPressed = true))
        // Ctrl なしの Enter は操作メニュー
        assertEquals(ShortcutAction.OPEN_ACTIONS, actionFor(ShortcutKey.ENTER))
    }

    @Test
    fun `選択は端で止まり、空の一覧では選択なしのまま`() {
        assertEquals(0, moveSelection(current = -1, size = 3, delta = 1))
        assertEquals(2, moveSelection(current = -1, size = 3, delta = -1))
        assertEquals(1, moveSelection(current = 0, size = 3, delta = 1))
        assertEquals(2, moveSelection(current = 2, size = 3, delta = 1))
        assertEquals(0, moveSelection(current = 0, size = 3, delta = -1))
        assertEquals(-1, moveSelection(current = 0, size = 0, delta = 1))
    }
}
