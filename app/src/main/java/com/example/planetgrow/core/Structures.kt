package com.example.planetgrow.core

/**
 * ブロックを積んで作る建造物 (家・木・街灯・池・畑)。
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

    /** 広がった形の木 (オーク・シラカバ・サクラ)。 */
    private val TREE_BROAD = listOf(
        ".FFF.",
        "FFFFF",
        "FFTFF",
        ".FTF.",
        "..T..",
        "..T.."
    )

    /** とがった形の木 (マツ)。 */
    private val TREE_CONIFER = listOf(
        "..F..",
        ".FFF.",
        ".FFF.",
        "FFFFF",
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
        "aWa",
        "WWW",
        "aWa"
    )

    /** 畑も上から見た形。作物が育つ。 */
    private val FARM_LAYOUT = listOf(
        "xxx",
        "xxx",
        "xxx"
    )

    /** 火山。おとなしいうちは火口が黒く冷えている。 */
    private val VOLCANO_DORMANT_LAYOUT = listOf(
        "..q..",
        ".SSS.",
        ".SSS.",
        "SSSSS",
        "SSSSS"
    )

    /** 活発化すると火口が常に赤く光る (夜だけでなく昼も見える)。 */
    private val VOLCANO_ACTIVE_LAYOUT = listOf(
        "..K..",
        ".SSS.",
        ".SSS.",
        "SSSSS",
        "SSSSS"
    )

    val house: Structure = build(HOUSE_LAYOUT, 0, 0)
    val lamp: Structure = build(LAMP_LAYOUT, 0, 0)
    val pond: Structure = build(POND_LAYOUT, 0, 0)
    val volcanoDormant: Structure = build(VOLCANO_DORMANT_LAYOUT, 0, 0)
    val volcanoActive: Structure = build(VOLCANO_ACTIVE_LAYOUT, 0, 0)

    /** 木は 4 種類。 */
    val trees: Array<Structure> = Array(4) { v ->
        build(if (v == 2) TREE_CONIFER else TREE_BROAD, v, 0)
    }
    val saplings: Array<Structure> = Array(4) { v -> build(SAPLING_LAYOUT, v, 0) }

    /** 畑は作物の育ち具合で 3 段階。 */
    val farms: Array<Structure> = Array(3) { stage -> build(FARM_LAYOUT, 0, stage) }

    private fun bodyTex(ch: Char, col: Int, row: Int, treeVariant: Int, cropStage: Int): Sprite? {
        val v = Tex.variantFor(col * 31 + 7, row * 17 + 3)
        return when (ch) {
            'R' -> Tex.roof[v]
            'P' -> Tex.plank[v]
            'L' -> Tex.log[v]
            'T' -> Tex.logVariants[treeVariant % Tex.logVariants.size][v]
            'F' -> Tex.leafVariants[treeVariant % Tex.leafVariants.size][v]
            'C' -> Tex.cobble[v]
            'a' -> Tex.sand[v]
            'W' -> Tex.water[v]
            'g' -> Tex.soil[v]
            'x' -> Tex.soil[v]
            'I' -> Tex.ice[v]
            'S' -> Tex.stone[v]
            'q' -> Tex.deepslate[v]
            'K' -> Tex.core[v]
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

    private fun build(layout: List<String>, treeVariant: Int, cropStage: Int): Structure {
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
                val bodySprite = windowTexFor(ch) ?: bodyTex(ch, col, row, treeVariant, cropStage)
                bodySprite?.let { body.draw(it, x, y) }
                // 作物は土の上に重ねる
                if (ch == 'x') body.draw(Tex.wheat[cropStage.coerceIn(0, Tex.wheat.size - 1)], x, y)
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
    fun forBuild(kind: BuildKind, progress: Float, variant: Int, cropStage: Int): Structure? = when (kind) {
        BuildKind.HOUSE -> house
        BuildKind.LAMP -> lamp
        BuildKind.POND -> pond
        BuildKind.FARM -> farms[cropStage.coerceIn(0, farms.size - 1)]
        BuildKind.TREE -> if (progress < 0.55f) saplings[variant % saplings.size] else trees[variant % trees.size]
        BuildKind.VOLCANO -> if (cropStage > 0) volcanoActive else volcanoDormant
        else -> null
    }

    /** 1 ブロックで置くもの (花や卵、外周に立つペット)。 */
    fun flatSpriteFor(kind: BuildKind, progress: Float, variant: Int): Sprite? = when (kind) {
        BuildKind.FLOWER -> if (progress < 0.6f) Art.sprout else Art.flowerClusters[variant % Art.flowerClusters.size]
        BuildKind.ANIMAL -> if (progress < 1f) Art.egg else null
        BuildKind.PET -> if (progress < 1f) Art.egg else Art.animals[variant % Art.animals.size][0]
        BuildKind.TREE -> if (progress < 0.25f) Art.sprout else null
        else -> null
    }

    /** 地面に平らに置くもの (立ち上がらないもの)。 */
    fun isOnSurface(kind: BuildKind): Boolean =
        kind == BuildKind.POND || kind == BuildKind.FARM || kind == BuildKind.ANIMAL

    /** 建設中は下からだんだん現れる。木と花は段階で変わるので常に全部出す。 */
    fun revealsGradually(kind: BuildKind): Boolean = when (kind) {
        BuildKind.HOUSE, BuildKind.LAMP, BuildKind.POND, BuildKind.FARM -> true
        else -> false
    }
}
