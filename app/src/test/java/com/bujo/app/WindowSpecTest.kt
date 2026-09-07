package com.bujo.app

import com.bujo.app.ui.layout.WindowSpec
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** 画面の形からレイアウトを決める判定 */
class WindowSpecTest {

    // Unihertz Titan: 1080x1200 px。密度によって dp はこのあたりに落ちる
    private val titanXhdpi = WindowSpec(widthDp = 540, heightDp = 600)   // density 2.0
    private val titanXxhdpi = WindowSpec(widthDp = 360, heightDp = 400)  // density 3.0
    private val phone = WindowSpec(widthDp = 411, heightDp = 891)        // 一般的な縦長スマホ
    private val phoneLandscape = WindowSpec(widthDp = 891, heightDp = 411)

    @Test
    fun `正方形に近い画面ではナビゲーションレールを使う`() {
        assertTrue(titanXhdpi.useNavigationRail)
        assertTrue(titanXxhdpi.useNavigationRail)
        assertTrue(phoneLandscape.useNavigationRail)
        assertFalse(phone.useNavigationRail)
    }

    @Test
    fun `縦が短い画面では余白を詰める`() {
        assertTrue(titanXhdpi.isDense)
        assertTrue(titanXxhdpi.isDense)
        assertFalse(phone.isDense)
    }

    @Test
    fun `横幅が足りるときだけカレンダーと一覧を左右に並べる`() {
        assertTrue(titanXhdpi.useTwoPane)
        assertFalse(titanXxhdpi.useTwoPane)   // 幅が足りない
        assertFalse(phone.useTwoPane)         // 縦長なので上下に並べる
    }

    @Test
    fun `カレンダーのマスには上限がある`() {
        assertTrue(titanXhdpi.calendarCellMaxDp < phone.calendarCellMaxDp)
    }

    @Test
    fun `幅がゼロでも落ちない`() {
        val degenerate = WindowSpec(widthDp = 0, heightDp = 0)
        assertTrue(degenerate.useNavigationRail)
        assertFalse(degenerate.useTwoPane)
    }
}
