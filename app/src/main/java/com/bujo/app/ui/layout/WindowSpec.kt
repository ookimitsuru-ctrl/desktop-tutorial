package com.bujo.app.ui.layout

/**
 * 画面の形からレイアウトの選び方を決める。
 *
 * Unihertz Titan のような正方形に近い画面（1080x1200 など）は、
 * 普通のスマホ（1080x2400 前後）に比べて縦が極端に短い。
 * 縦を食う下部ナビゲーションをやめて左側のレールへ寄せ、
 * 余っている横幅を使うのが基本方針。
 *
 * dp で判断しているので画面密度に依存しない。純粋な計算なので単体テストできる。
 */
data class WindowSpec(val widthDp: Int, val heightDp: Int) {

    /** 縦横比（高さ ÷ 幅）。1.0 で正方形、普通のスマホは 2.0 前後 */
    val aspect: Float
        get() = if (widthDp <= 0) 1f else heightDp.toFloat() / widthDp.toFloat()

    /** 正方形に近い、または横長 */
    val isSquarish: Boolean get() = aspect < SQUARISH_ASPECT

    /** 縦の余裕がない。行間やバーの高さを詰める */
    val isDense: Boolean get() = heightDp < DENSE_HEIGHT_DP

    /** 下部ナビゲーションではなく、左のナビゲーションレールを使う */
    val useNavigationRail: Boolean get() = isSquarish || heightDp < VERY_SHORT_HEIGHT_DP

    /** マンスリーログでカレンダーと一覧を横に並べる */
    val useTwoPane: Boolean get() = isSquarish && widthDp >= TWO_PANE_MIN_WIDTH_DP

    /** カレンダーの1マスの上限。狭い画面で巨大なマスになるのを防ぐ */
    val calendarCellMaxDp: Int get() = if (isDense) 40 else 56

    companion object {
        /** これより縦横比が小さければ「正方形に近い」とみなす */
        const val SQUARISH_ASPECT = 1.45f

        /** これより低ければ余白を詰める */
        const val DENSE_HEIGHT_DP = 700

        /** 縦長でもここまで低ければレールにする（横向きの端末など） */
        const val VERY_SHORT_HEIGHT_DP = 500

        /** 2ペインに必要な最低幅 */
        const val TWO_PANE_MIN_WIDTH_DP = 520
    }
}
