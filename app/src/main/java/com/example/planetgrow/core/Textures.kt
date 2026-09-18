package com.example.planetgrow.core

/**
 * マインクラフト風の 16x16 ブロックテクスチャを手続き的に生成する。
 * 画像アセットを一切持たないので、どの端末でも同じ見た目になる。
 */
object Tex {
    const val SIZE = 16
    private const val VARIANTS = 3

    // ---- 色 (マインクラフト寄りのパレット) ----
    private val DIRT_COLORS = intArrayOf(rgbOf(0x8A6141), rgbOf(0x7A5537), rgbOf(0x9A7150), rgbOf(0x6E4C31))
    private val DIRT_W = intArrayOf(5, 4, 3, 2)

    private val GRASS_COLORS = intArrayOf(rgbOf(0x6FAF3E), rgbOf(0x63A035), rgbOf(0x7CBE49), rgbOf(0x558F2C))
    private val GRASS_W = intArrayOf(5, 4, 3, 2)

    private val STONE_COLORS = intArrayOf(rgbOf(0x7C7C7C), rgbOf(0x888888), rgbOf(0x6E6E6E), rgbOf(0x949494))
    private val STONE_W = intArrayOf(5, 4, 3, 1)

    private val DEEP_COLORS = intArrayOf(rgbOf(0x4A4A52), rgbOf(0x3F3F47), rgbOf(0x55555E), rgbOf(0x35353C))
    private val DEEP_W = intArrayOf(5, 4, 3, 2)

    // マグマブロック: 黒い岩に橙の割れ目
    private val CORE_COLORS = intArrayOf(rgbOf(0x4A2317), rgbOf(0x5C2C18), rgbOf(0x3A1A10), rgbOf(0x6B3A1E))
    private val CORE_W = intArrayOf(5, 4, 3, 2)
    private val CORE_GLOW = intArrayOf(rgbOf(0xFF8A1E), rgbOf(0xFFC94A), rgbOf(0xE2560F))

    private val PLANK_COLORS = intArrayOf(rgbOf(0xB08A54), rgbOf(0xA37E4A), rgbOf(0xBE985F))
    private val PLANK_W = intArrayOf(5, 3, 2)
    private val PLANK_LINE = rgbOf(0x6E5233)

    private val ROOF_COLORS = intArrayOf(rgbOf(0x6B4326), rgbOf(0x5C381F), rgbOf(0x7A4E2D))
    private val ROOF_W = intArrayOf(5, 4, 2)
    private val ROOF_LINE = rgbOf(0x40260F)

    private val LOG_DARK = rgbOf(0x5A4229)
    private val LOG_MID = rgbOf(0x6E5233)
    private val LOG_LIGHT = rgbOf(0x7E5F3D)

    private val COBBLE_COLORS = intArrayOf(rgbOf(0x8A8A8A), rgbOf(0x9A9A9A), rgbOf(0x767676), rgbOf(0xA6A6A6))
    private val COBBLE_W = intArrayOf(4, 3, 3, 2)
    private val COBBLE_MORTAR = rgbOf(0x5E5E5E)

    private val LEAF_COLORS = intArrayOf(rgbOf(0x4E8F32), rgbOf(0x3E7327), rgbOf(0x5FA33C), rgbOf(0x356322))
    private val LEAF_W = intArrayOf(5, 4, 3, 2)

    private val WATER_COLORS = intArrayOf(rgbOf(0x3A6FD8), rgbOf(0x3263C6), rgbOf(0x4A7FE6))
    private val WATER_W = intArrayOf(5, 3, 2)

    private val SAND_COLORS = intArrayOf(rgbOf(0xDBD0A0), rgbOf(0xCFC392), rgbOf(0xE6DCB0))
    private val SAND_W = intArrayOf(5, 3, 2)

    private val GLASS_DAY = rgbOf(0x9FD6EA)
    private val GLASS_DAY_HI = rgbOf(0xC8ECF7)
    private val GLASS_NIGHT = rgbOf(0xFFCF6A)
    private val GLASS_NIGHT_HI = rgbOf(0xFFF0B8)
    private val FRAME = rgbOf(0x5A4229)

    // ---- 生成済みテクスチャ ----
    /** 草ブロック: [向き 0=上,1=右,2=下,3=左][バリエーション] */
    val grass: Array<Array<Sprite>> = Array(4) { dir ->
        Array(VARIANTS) { v -> grassSide(0x6A51 + v * 97).rotate90(dir) }
    }
    val dirt: Array<Sprite> = Array(VARIANTS) { v -> clusterNoise(0x1234 + v * 131, DIRT_COLORS, DIRT_W) }
    val stone: Array<Sprite> = Array(VARIANTS) { v -> clusterNoise(0x2345 + v * 137, STONE_COLORS, STONE_W) }
    val deepslate: Array<Sprite> = Array(VARIANTS) { v -> clusterNoise(0x3456 + v * 139, DEEP_COLORS, DEEP_W) }
    val core: Array<Sprite> = Array(VARIANTS) { v -> coreTex(0x4567 + v * 149) }
    val plank: Array<Sprite> = Array(VARIANTS) { v -> plankTex(0x5678 + v * 151, PLANK_COLORS, PLANK_W, PLANK_LINE) }
    val roof: Array<Sprite> = Array(VARIANTS) { v -> roofTex(0x6789 + v * 157) }
    val log: Array<Sprite> = Array(VARIANTS) { v -> logTex(0x789A + v * 163) }
    val cobble: Array<Sprite> = Array(VARIANTS) { v -> cobbleTex(0x89AB + v * 167) }
    val leaves: Array<Sprite> = Array(VARIANTS) { v -> leavesTex(0x9ABC + v * 173) }
    val water: Array<Sprite> = Array(VARIANTS) { v -> clusterNoise(0xABCD + v * 179, WATER_COLORS, WATER_W) }
    val sand: Array<Sprite> = Array(VARIANTS) { v -> clusterNoise(0xBCDE + v * 181, SAND_COLORS, SAND_W) }

    val windowDay: Sprite = windowTex(GLASS_DAY, GLASS_DAY_HI)
    val windowNight: Sprite = windowTex(GLASS_NIGHT, GLASS_NIGHT_HI)
    val doorTop: Sprite = doorTex(true)
    val doorBottom: Sprite = doorTex(false)

    fun variantFor(i: Int, j: Int): Int {
        var h = i * 374761393 + j * 668265263
        h = (h xor (h ushr 13)) * 1274126177
        return ((h ushr 16) and 0x7FFFFFFF) % VARIANTS
    }

    // ---- 生成関数 ----

    private fun pick(rnd: Rnd, colors: IntArray, weights: IntArray): Int {
        var total = 0
        for (w in weights) total += w
        var k = rnd.int(total)
        for (i in colors.indices) {
            k -= weights[i]
            if (k < 0) return colors[i]
        }
        return colors[0]
    }

    /** 2x2 のかたまりでムラを作る (マイクラのテクスチャに近い粒感)。 */
    private fun clusterNoise(seed: Int, colors: IntArray, weights: IntArray): Sprite {
        val rnd = Rnd(seed)
        val px = IntArray(SIZE * SIZE)
        val half = SIZE / 2
        val small = IntArray(half * half)
        for (i in small.indices) small[i] = pick(rnd, colors, weights)
        for (y in 0 until SIZE) for (x in 0 until SIZE) {
            px[y * SIZE + x] = small[(y / 2) * half + (x / 2)]
        }
        // 2x2 の均一さを崩す
        for (i in px.indices) if (rnd.int(100) < 18) px[i] = pick(rnd, colors, weights)
        return Sprite(SIZE, SIZE, px)
    }

    /** 草ブロックの側面 (上が草・下が土)。 */
    private fun grassSide(seed: Int): Sprite {
        val rnd = Rnd(seed)
        val s = clusterNoise(seed xor 0x55AA, DIRT_COLORS, DIRT_W)
        val px = s.px
        for (x in 0 until SIZE) {
            val depth = 4 + rnd.int(3) // 4..6
            for (y in 0 until depth) {
                px[y * SIZE + x] = pick(rnd, GRASS_COLORS, GRASS_W)
            }
            // 草と土の境目に少し濃い緑を置く
            px[(depth - 1) * SIZE + x] = GRASS_COLORS[3]
            if (rnd.int(100) < 35 && depth < SIZE - 1) px[depth * SIZE + x] = GRASS_COLORS[1]
        }
        // 上端を少し明るく
        for (x in 0 until SIZE) if (rnd.int(100) < 45) px[x] = GRASS_COLORS[2]
        return Sprite(SIZE, SIZE, px)
    }

    private fun plankTex(seed: Int, colors: IntArray, weights: IntArray, line: Int): Sprite {
        val rnd = Rnd(seed)
        val px = IntArray(SIZE * SIZE)
        for (y in 0 until SIZE) for (x in 0 until SIZE) px[y * SIZE + x] = pick(rnd, colors, weights)
        // 横の板の切れ目
        for (x in 0 until SIZE) {
            px[7 * SIZE + x] = line
            px[15 * SIZE + x] = line
        }
        // 縦の継ぎ目 (段違いに)
        for (y in 0 until 7) px[y * SIZE + 5] = line
        for (y in 8 until 15) px[y * SIZE + 11] = line
        return Sprite(SIZE, SIZE, px)
    }

    private fun roofTex(seed: Int): Sprite {
        val rnd = Rnd(seed)
        val px = IntArray(SIZE * SIZE)
        for (y in 0 until SIZE) for (x in 0 until SIZE) px[y * SIZE + x] = pick(rnd, ROOF_COLORS, ROOF_W)
        // 瓦・板葺きのような横線
        for (x in 0 until SIZE) {
            px[3 * SIZE + x] = ROOF_LINE
            px[9 * SIZE + x] = ROOF_LINE
            px[15 * SIZE + x] = ROOF_LINE
        }
        for (y in 4 until 9) px[y * SIZE + 7] = ROOF_LINE
        for (y in 10 until 15) px[y * SIZE + 3] = ROOF_LINE
        for (y in 10 until 15) px[y * SIZE + 12] = ROOF_LINE
        return Sprite(SIZE, SIZE, px)
    }

    private fun logTex(seed: Int): Sprite {
        val rnd = Rnd(seed)
        val px = IntArray(SIZE * SIZE)
        val cols = intArrayOf(LOG_MID, LOG_DARK, LOG_LIGHT)
        val w = intArrayOf(5, 3, 2)
        for (x in 0 until SIZE) {
            val base = pick(rnd, cols, w)
            for (y in 0 until SIZE) {
                px[y * SIZE + x] = if (rnd.int(100) < 22) pick(rnd, cols, w) else base
            }
        }
        // 縦の木目
        for (y in 0 until SIZE) {
            px[y * SIZE + 2] = LOG_DARK
            px[y * SIZE + 9] = LOG_DARK
            px[y * SIZE + 13] = LOG_LIGHT
        }
        // 節
        val kx = 4 + rnd.int(3)
        val ky = 5 + rnd.int(5)
        for (dy in 0 until 3) for (dx in 0 until 2) {
            px[((ky + dy) % SIZE) * SIZE + ((kx + dx) % SIZE)] = LOG_DARK
        }
        return Sprite(SIZE, SIZE, px)
    }

    private fun cobbleTex(seed: Int): Sprite {
        val rnd = Rnd(seed)
        val s = clusterNoise(seed xor 0x7C3, COBBLE_COLORS, COBBLE_W)
        val px = s.px
        // 石の継ぎ目 (モルタル)
        for (x in 0 until SIZE) {
            px[5 * SIZE + x] = COBBLE_MORTAR
            px[11 * SIZE + x] = COBBLE_MORTAR
        }
        for (y in 0 until 6) px[y * SIZE + 6] = COBBLE_MORTAR
        for (y in 6 until 12) px[y * SIZE + 11] = COBBLE_MORTAR
        for (y in 12 until SIZE) px[y * SIZE + 4] = COBBLE_MORTAR
        return Sprite(SIZE, SIZE, px)
    }

    /** 葉: 隙間を少し開けて塊に見えないようにする。 */
    private fun leavesTex(seed: Int): Sprite {
        val rnd = Rnd(seed)
        val s = clusterNoise(seed xor 0x2D5, LEAF_COLORS, LEAF_W)
        val px = s.px
        repeat(10) {
            val x = rnd.int(SIZE)
            val y = rnd.int(SIZE)
            // 端のほうほど穴があきやすい
            val edge = (x == 0 || y == 0 || x == SIZE - 1 || y == SIZE - 1)
            if (edge || rnd.int(100) < 30) px[y * SIZE + x] = Col.CLEAR
        }
        // 影になる濃い葉
        repeat(18) {
            px[rnd.int(SIZE) * SIZE + rnd.int(SIZE)] = LEAF_COLORS[3]
        }
        return Sprite(SIZE, SIZE, px)
    }

    private fun coreTex(seed: Int): Sprite {
        val rnd = Rnd(seed)
        val s = clusterNoise(seed xor 0x3F1, CORE_COLORS, CORE_W)
        val px = s.px
        // 溶岩の割れ目を縦横に走らせる
        repeat(2) {
            var x = 2 + rnd.int(SIZE - 4)
            for (y in 0 until SIZE) {
                val xi = x.coerceIn(0, SIZE - 1)
                px[y * SIZE + xi] = CORE_GLOW[rnd.int(2)]
                if (rnd.int(100) < 30 && xi + 1 < SIZE) px[y * SIZE + xi + 1] = CORE_GLOW[2]
                if (rnd.int(100) < 55) x += rnd.int(3) - 1
            }
        }
        repeat(2) {
            var y = 2 + rnd.int(SIZE - 4)
            for (x in 0 until SIZE) {
                val yi = y.coerceIn(0, SIZE - 1)
                px[yi * SIZE + x] = CORE_GLOW[rnd.int(2)]
                if (rnd.int(100) < 50) y += rnd.int(3) - 1
            }
        }
        return Sprite(SIZE, SIZE, px)
    }

    private fun windowTex(glass: Int, highlight: Int): Sprite {
        val px = IntArray(SIZE * SIZE)
        for (y in 0 until SIZE) for (x in 0 until SIZE) {
            val edge = x == 0 || y == 0 || x == SIZE - 1 || y == SIZE - 1
            val cross = x == 7 || x == 8 || y == 7 || y == 8
            px[y * SIZE + x] = when {
                edge || cross -> FRAME
                else -> glass
            }
        }
        // ガラスの光沢
        for (k in 0 until 4) {
            val x = 2 + k
            val y = 5 - k
            if (y in 1 until SIZE - 1) px[y * SIZE + x] = highlight
        }
        for (k in 0 until 3) {
            val x = 10 + k
            val y = 13 - k
            if (x in 1 until SIZE - 1 && y in 1 until SIZE - 1) px[y * SIZE + x] = highlight
        }
        return Sprite(SIZE, SIZE, px)
    }

    private fun doorTex(top: Boolean): Sprite {
        val rnd = Rnd(if (top) 0xD001 else 0xD002)
        val px = IntArray(SIZE * SIZE)
        for (y in 0 until SIZE) for (x in 0 until SIZE) px[y * SIZE + x] = pick(rnd, PLANK_COLORS, PLANK_W)
        // 枠
        for (i in 0 until SIZE) {
            px[i * SIZE] = FRAME
            px[i * SIZE + SIZE - 1] = FRAME
        }
        for (x in 0 until SIZE) {
            if (top) px[x] = FRAME else px[(SIZE - 1) * SIZE + x] = FRAME
        }
        if (top) {
            // 上半分は小窓付き
            for (y in 3 until 9) for (x in 3 until 13) {
                px[y * SIZE + x] = if (y == 3 || y == 8 || x == 3 || x == 12) FRAME else GLASS_DAY
            }
            for (y in 9 until SIZE) for (x in 0 until SIZE) if (y == 11) px[y * SIZE + x] = FRAME
        } else {
            for (x in 2 until 14) {
                px[2 * SIZE + x] = FRAME
                px[12 * SIZE + x] = FRAME
            }
            for (y in 2 until 13) {
                px[y * SIZE + 2] = FRAME
                px[y * SIZE + 13] = FRAME
            }
            // ノブ
            px[7 * SIZE + 11] = rgbOf(0x2E2118)
            px[8 * SIZE + 11] = rgbOf(0x2E2118)
        }
        return Sprite(SIZE, SIZE, px)
    }
}
