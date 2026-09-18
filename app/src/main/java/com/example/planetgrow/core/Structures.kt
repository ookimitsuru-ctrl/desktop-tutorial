package com.example.planetgrow.core

/**
 * ブロックを積んで作る建造物 (家・木・街灯)。
 * ブロック配置は文字列で書く。1 文字 = 1 ブロック = 16px。
 */
class Structure(
    /** 通常の見た目 (太陽光で明暗がつく部分)。 */
    val body: Sprite,
    /** 夜に光る部分 (窓・ランタン)。null なら無し。 */
    val lights: Sprite?,
    /** 地面に接する位置 (スプライト内の座標)。 */
    val anchorX: Float,
    val anchorY: Float,
    /** 光源 [x, y, 半径]。夜のグローに使う。 */
    val lightSpots: List<FloatArray>,
    /** 煙突の口 [x, y]。無ければ null。 */
    val chimney: FloatArray?
)

object Structures {

    private val LANTERN: Sprite = Sprite.of(
        listOf(
            "................",
            ".......DD.......",
            "......D..D......",
            ".....DDDDDD.....",
            "....DDDDDDDD....",
            "....DYYYYYYD....",
            "....DYWWWWYD....",
            "....DYWWWWYD....",
            "....DYWWWWYD....",
            "....DYWWWWYD....",
            "....DYYYYYYD....",
            "....DDDDDDDD....",
            ".....DDDDDD.....",
            ".......DD.......",
            "................",
            "................"
        ),
        mapOf(
            'D' to rgbOf(0x3A3A3E),
            'Y' to rgbOf(0xFFC85A),
            'W' to rgbOf(0xFFF0B0)
        )
    )

    /**
     * 家。壁 5 ブロック・屋根 3 段・煙突 1 で高さ 7 ブロック。
     * 惑星の直径 (13 ブロック) のちょうど半分ほどの大きさになる。
     */
    private val HOUSE_LAYOUT = listOf(
        "....C..",
        "..RRR..",
        ".RRRRR.",
        "RRRRRRR",
        ".LPPPL.",
        ".LWDWL.",
        ".LPdPL."
    )

    private val TREE_LAYOUT = listOf(
        ".FFF.",
        "FFFFF",
        "FFTFF",
        ".FTF.",
        "..T..",
        "..T.."
    )

    private val LAMP_LAYOUT = listOf(
        "N",
        "T",
        "T",
        "T"
    )

    val house: Structure = build(HOUSE_LAYOUT)
    val tree: Structure = build(TREE_LAYOUT)
    val lamp: Structure = build(LAMP_LAYOUT)

    private fun bodyTex(ch: Char, col: Int, row: Int): Sprite? {
        val v = Tex.variantFor(col * 31 + 7, row * 17 + 3)
        return when (ch) {
            'R' -> Tex.roof[v]
            'P' -> Tex.plank[v]
            'L' -> Tex.log[v]
            'T' -> Tex.log[v]
            'F' -> Tex.leaves[v]
            'C' -> Tex.cobble[v]
            'W' -> Tex.windowDay
            'D' -> Tex.doorTop
            'd' -> Tex.doorBottom
            'N' -> LANTERN
            else -> null
        }
    }

    private fun lightTex(ch: Char): Sprite? = when (ch) {
        'W' -> Tex.windowNight
        'N' -> LANTERN
        else -> null
    }

    private fun build(layout: List<String>): Structure {
        val cols = layout.maxOf { it.length }
        val rows = layout.size
        val w = cols * Tex.SIZE
        val h = rows * Tex.SIZE
        val body = PixelBuffer(w, h)
        val lights = PixelBuffer(w, h)
        var hasLights = false
        val spots = ArrayList<FloatArray>()
        var chimney: FloatArray? = null

        for (row in 0 until rows) {
            val line = layout[row]
            for (col in 0 until cols) {
                val ch = if (col < line.length) line[col] else '.'
                if (ch == '.' || ch == ' ') continue
                val x = col * Tex.SIZE
                val y = row * Tex.SIZE
                bodyTex(ch, col, row)?.let { body.draw(it, x, y) }
                lightTex(ch)?.let {
                    lights.draw(it, x, y)
                    hasLights = true
                    spots.add(floatArrayOf(x + Tex.SIZE / 2f, y + Tex.SIZE / 2f, 26f))
                }
                if (ch == 'C') chimney = floatArrayOf(x + Tex.SIZE / 2f, y.toFloat())
            }
        }
        return Structure(
            body = body.toSprite(),
            lights = if (hasLights) lights.toSprite() else null,
            anchorX = w / 2f,
            anchorY = h.toFloat(),
            lightSpots = spots,
            chimney = chimney
        )
    }

    fun forProp(kind: PropKind): Structure? = when (kind) {
        PropKind.HOUSE -> house
        PropKind.TREE -> tree
        PropKind.LAMP -> lamp
        else -> null
    }

    /** 草花は 1 ブロックのスプライトをそのまま置く。 */
    fun flatSpriteFor(kind: PropKind): Sprite? = when (kind) {
        PropKind.POPPY -> Art.poppy
        PropKind.DANDELION -> Art.dandelion
        PropKind.TUFT -> Art.grassTuft
        else -> null
    }
}
