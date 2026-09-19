package com.example.planetgrow.core

/**
 * ブロックを積んで作る建造物 (家・木・街灯・池)。
 * ブロック配置は文字列で書く。1 文字 = 1 ブロック = 16px。
 */
class Structure(
    /** 通常の見た目 (太陽光で明暗がつく部分)。 */
    val body: Sprite,
    /** 夜に光る部分 (窓・ランタン)。null なら無し。 */
    val lights: Sprite?,
    /** 建設中に見える足場。 */
    val scaffold: Sprite,
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
        ".LwDwL.",
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

    private val SAPLING_LAYOUT = listOf(
        ".F.",
        "FFF",
        ".T.",
        ".T."
    )

    private val LAMP_LAYOUT = listOf(
        "N",
        "T",
        "T",
        "T"
    )

    /** 池は上から見た形。惑星の面に平らに置く。 */
    private val POND_LAYOUT = listOf(
        ".aaa.",
        "aWWWa",
        "aWWWa",
        ".aaa."
    )

    val house: Structure = build(HOUSE_LAYOUT)
    val tree: Structure = build(TREE_LAYOUT)
    val sapling: Structure = build(SAPLING_LAYOUT)
    val lamp: Structure = build(LAMP_LAYOUT)
    val pond: Structure = build(POND_LAYOUT)

    private fun bodyTex(ch: Char, col: Int, row: Int): Sprite? {
        val v = Tex.variantFor(col * 31 + 7, row * 17 + 3)
        return when (ch) {
            'R' -> Tex.roof[v]
            'P' -> Tex.plank[v]
            'L' -> Tex.log[v]
            'T' -> Tex.log[v]
            'F' -> Tex.leaves[v]
            'C' -> Tex.cobble[v]
            'a' -> Tex.sand[v]
            'W' -> Tex.water[v]
            'I' -> Tex.ice[v]
            'D' -> Tex.doorTop
            'd' -> Tex.doorBottom
            'N' -> LANTERN
            else -> null
        }
    }

    private fun windowTexFor(ch: Char): Sprite? = if (ch == 'w') Tex.windowDay else null

    private fun lightTex(ch: Char): Sprite? = when (ch) {
        'w' -> Tex.windowNight
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
                val raw = if (col < line.length) line[col] else '.'
                if (raw == '.' || raw == ' ') continue
                // 'W' は家では窓・池では水。家の窓は小文字で書く
                val ch = raw
                val x = col * Tex.SIZE
                val y = row * Tex.SIZE
                val bodySprite = windowTexFor(ch) ?: bodyTex(ch, col, row)
                bodySprite?.let { body.draw(it, x, y) }
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
            scaffold = scaffoldFor(cols, rows),
            anchorX = w / 2f,
            anchorY = h.toFloat(),
            lightSpots = spots,
            chimney = chimney
        )
    }

    /** 建設中に建物を囲む足場。 */
    private fun scaffoldFor(cols: Int, rows: Int): Sprite {
        val w = cols * Tex.SIZE
        val h = rows * Tex.SIZE
        val buf = PixelBuffer(w, h)
        val pole = Col.argb(150, 0xA8, 0x82, 0x4E)
        val rung = Col.argb(110, 0x8A, 0x68, 0x3C)
        val left = 2
        val right = w - 4
        for (y in 0 until h) {
            buf.set(left, y, pole)
            buf.set(left + 1, y, pole)
            buf.set(right, y, pole)
            buf.set(right + 1, y, pole)
        }
        var y = Tex.SIZE / 2
        while (y < h) {
            for (x in left until right + 2) buf.set(x, y, rung)
            y += Tex.SIZE
        }
        return buf.toSprite()
    }

    /**
     * 建てているもの・建っているものの見た目。
     * progress は 0..1。木は育つ途中で姿が変わる。
     */
    fun forBuild(kind: BuildKind, progress: Float): Structure? = when (kind) {
        BuildKind.HOUSE -> house
        BuildKind.LAMP -> lamp
        BuildKind.POND -> pond
        BuildKind.TREE -> if (progress < 0.55f) sapling else tree
        else -> null
    }

    /** 1 ブロックで置くもの (花や卵)。 */
    fun flatSpriteFor(kind: BuildKind, progress: Float): Sprite? = when (kind) {
        BuildKind.FLOWER -> if (progress < 0.6f) Art.sprout else Art.poppy
        BuildKind.SHEEP -> if (progress < 1f) Art.egg else null
        BuildKind.TREE -> if (progress < 0.25f) Art.sprout else null
        else -> null
    }

    /** 地面に平らに置くもの (立ち上がらないもの)。 */
    fun isOnSurface(kind: BuildKind): Boolean = kind == BuildKind.POND

    /** 建設中は下からだんだん現れる。木と花は段階で変わるので常に全部出す。 */
    fun revealsGradually(kind: BuildKind): Boolean = when (kind) {
        BuildKind.HOUSE, BuildKind.LAMP, BuildKind.POND -> true
        else -> false
    }
}
