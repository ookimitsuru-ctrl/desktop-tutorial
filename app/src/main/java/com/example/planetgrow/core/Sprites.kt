package com.example.planetgrow.core

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min

/**
 * 住人・太陽・月・草花などのドット絵。
 * 1 ブロック = 16px なので、住人は 16x32 = 2 ブロックの背丈。
 */
object Art {

    private val VILLAGER_PALETTE: Map<Char, Int> = mapOf(
        'H' to rgbOf(0x3F2E1E), // 髪
        'S' to rgbOf(0xC68F63), // 肌
        's' to rgbOf(0xA9754C), // 肌 (影)
        'B' to rgbOf(0x3A2A1C), // 眉
        'E' to rgbOf(0xF2F2F2), // 白目
        'P' to rgbOf(0x2E2118), // 瞳
        'N' to rgbOf(0xB87E52), // 鼻
        'n' to rgbOf(0x97633E), // 鼻 (影)
        'R' to rgbOf(0x6B4A2E), // ローブ
        'r' to rgbOf(0x553A22), // ローブ (影)
        'G' to rgbOf(0x4E7A3A), // 前掛け
        'g' to rgbOf(0x3D6130), // 前掛け (影)
        'L' to rgbOf(0x4A3520), // 脚
        'F' to rgbOf(0x2E2118)  // 靴
    )

    // 頭と胴 (歩行フレーム共通) ------------------------------------------------
    private val VILLAGER_BODY = listOf(
        "................",
        "................",
        "....HHHHHHHH....",
        "...HHHHHHHHHH...",
        "...HHHHHHHHHH...",
        "...HSSSSSSSSH...",
        "...HBBBBBBBBH...",
        "...HSEPSSPESH...",
        "...HSSSNNSSSH...",
        "...HSSSNNSSSH...",
        "...HSSSNnSSSH...",
        "....SSSNnSSS....",
        ".....SssssS.....",
        "......ssss......",
        "....RRRRRRRR....",
        "...RRRRRRRRRR...",
        "...RRGGGGGGRR...",
        "...RRGGGGGGRR...",
        "...RrGGGGGGrR...",
        "...RrSSSSSSrR...",
        "...RrSSSSSSrR...",
        "...RRGGGGGGRR...",
        "...RRGGGGGGRR...",
        "...RRggggggRR...",
        "...RRRRRRRRRR...",
        "...RRRRRRRRRR...",
        "....RRRRRRRR...."
    )

    // 脚 (立ち / 歩き) --------------------------------------------------------
    private val LEGS_STAND = listOf(
        "....LL....LL....",
        "....LL....LL....",
        "....LL....LL....",
        "....FF....FF....",
        "...FFF....FFF..."
    )

    private val LEGS_WALK = listOf(
        "...LL......LL...",
        "...LL......LL...",
        "..LL........LL..",
        "..FF........FF..",
        ".FFF........FFF."
    )

    /** 0 = 立ち, 1 = 歩き。歩きフレームは 1px 沈むので描画側で調整する。 */
    val villager: Array<Sprite> = arrayOf(
        Sprite.of(VILLAGER_BODY + LEGS_STAND, VILLAGER_PALETTE),
        Sprite.of(VILLAGER_BODY + LEGS_WALK, VILLAGER_PALETTE)
    )

    /** 住人の足元 (スプライト内での接地位置)。 */
    const val VILLAGER_FOOT_Y = 32f
    const val VILLAGER_CENTER_X = 8f

    // 草花 --------------------------------------------------------------------
    private fun flower(petal: Int, center: Int): Sprite {
        val palette = mapOf(
            'R' to petal,
            'Y' to center,
            'G' to rgbOf(0x4E8F32),
            'g' to rgbOf(0x3E7327)
        )
        return Sprite.of(
            listOf(
                "................",
                "................",
                "................",
                "......RR........",
                ".....RRRR.......",
                "....RRYYRR......",
                ".....RRRR.......",
                "......RR........",
                "......GG........",
                "......G.........",
                ".....GG.gg......",
                "......G.gg......",
                "......GG........",
                "......G.........",
                "......G.........",
                ".....GGG........"
            ),
            palette
        )
    }

    val poppy: Sprite = flower(rgbOf(0xD3423A), rgbOf(0x2E2118))
    val dandelion: Sprite = flower(rgbOf(0xF0C63A), rgbOf(0xB8862A))

    val grassTuft: Sprite = Sprite.of(
        listOf(
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "..G.......G.....",
            "..G..G....G.....",
            ".GG..G...GG.....",
            ".GG.GG..GG..G...",
            ".GGGGGG.GG.GG...",
            "..GGGGGGGGGG....",
            "..GGGGGGGGGG...."
        ),
        mapOf('G' to rgbOf(0x5BA33C))
    )

    // 太陽 --------------------------------------------------------------------
    /** マイクラの太陽と同じく四角い。2 ブロック (32x32)。 */
    val sun: Sprite = run {
        val n = 32
        val px = IntArray(n * n)
        val rnd = Rnd(0x50B1)
        val core = rgbOf(0xFFF7D0)
        val mid = rgbOf(0xFFE06A)
        val edge = rgbOf(0xFFC431)
        for (y in 0 until n) for (x in 0 until n) {
            val d = max2(abs(x - (n - 1) / 2f), abs(y - (n - 1) / 2f)) / (n / 2f)
            val c = when {
                d < 0.45f -> core
                d < 0.75f -> mid
                else -> edge
            }
            // 角を少し落として丸みを出す
            val cornerCut = (abs(x - 15.5f) + abs(y - 15.5f)) > 25f
            px[y * n + x] = if (cornerCut) Col.CLEAR else if (rnd.int(100) < 8) Col.lerp(c, core, 0.5f) else c
        }
        Sprite(n, n, px)
    }

    private fun max2(a: Float, b: Float): Float = if (a > b) a else b

    // 月 (8 相) ---------------------------------------------------------------
    /** index 0 = 新月, 4 = 満月 (マイクラと同じ 8 段階)。 */
    val moonPhases: Array<Sprite> = Array(8) { phase -> moonSprite(phase) }

    private fun moonSprite(phase: Int): Sprite {
        val n = 32
        val px = IntArray(n * n)
        val rnd = Rnd(0x3007 + phase)
        val light = rgbOf(0xE8ECF5)
        val mid = rgbOf(0xCBD2E0)
        val crater = rgbOf(0xA8B0C2)
        // 0..1 の満ち欠け (0 = 新月, 0.5 = 満月)
        val p = phase / 8f
        val waxing = p < 0.5f
        val litFrac = if (waxing) p * 2f else (1f - p) * 2f
        val litPx = (n * litFrac).toInt()
        for (y in 0 until n) for (x in 0 until n) {
            val cornerCut = (abs(x - 15.5f) + abs(y - 15.5f)) > 25f
            if (cornerCut) continue
            val lit = if (waxing) x >= n - litPx else x < litPx
            if (!lit) continue
            val c = if (rnd.int(100) < 20) mid else light
            px[y * n + x] = c
        }
        // クレーター
        val spots = arrayOf(intArrayOf(10, 9, 3), intArrayOf(20, 16, 4), intArrayOf(13, 23, 2), intArrayOf(24, 8, 2))
        for (s in spots) {
            for (dy in -s[2]..s[2]) for (dx in -s[2]..s[2]) {
                if (dx * dx + dy * dy > s[2] * s[2]) continue
                val x = s[0] + dx
                val y = s[1] + dy
                if (x < 0 || y < 0 || x >= n || y >= n) continue
                if (px[y * n + x] == 0) continue
                px[y * n + x] = crater
            }
        }
        return Sprite(n, n, px)
    }

    /**
     * 実際の月齢 (0..1) を求める。0 = 新月, 0.5 = 満月。
     * 2000-01-06 18:14 UTC の新月を基準にした簡易計算。
     */
    fun moonPhaseFraction(epochMillis: Long): Float {
        val synodic = 29.530588853
        val knownNewMoon = 947182440000.0 // 2000-01-06T18:14:00Z
        val days = (epochMillis - knownNewMoon) / 86400000.0
        var f = (days / synodic) % 1.0
        if (f < 0) f += 1.0
        return f.toFloat()
    }

    fun moonSpriteFor(epochMillis: Long): Sprite {
        val f = moonPhaseFraction(epochMillis)
        val idx = (Math.round(f * 8.0).toInt()) % 8
        return moonPhases[idx]
    }

    /** 煙のつぶ (小さな四角)。 */
    fun smokeColor(alpha: Int): Int = Col.argb(alpha, 0xCF, 0xD4, 0xDC)
}
