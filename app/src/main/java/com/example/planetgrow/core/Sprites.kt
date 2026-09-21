package com.example.planetgrow.core

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

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

    /** 植えたばかりの芽。 */
    val sprout: Sprite = Sprite.of(
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
            ".....g..g.......",
            "....gGg.Gg......",
            ".....gGGGg......",
            "......GGG.......",
            ".......G........",
            ".......G........",
            "......GGG......."
        ),
        mapOf('G' to rgbOf(0x5BA33C), 'g' to rgbOf(0x77C254))
    )

    /** 花は 4 種類。どれが咲くかは作ったときに決まる。 */
    val flowers: Array<Sprite> = arrayOf(
        flower(rgbOf(0xD3423A), rgbOf(0x2E2118)), // ポピー
        flower(rgbOf(0xF0C63A), rgbOf(0xB8862A)), // タンポポ
        flower(rgbOf(0x6A8CE0), rgbOf(0xE8E8F0)), // ヒスイラン
        flower(rgbOf(0xEFEFEF), rgbOf(0xE8C84A))  // シロツメクサ
    )

    val poppy: Sprite = flowers[0]
    val dandelion: Sprite = flowers[1]

    /** 何本かの花をまとめて咲かせた、ひとまわり大きい茂み。 */
    private fun flowerCluster(indices: IntArray): Sprite {
        val w = 28
        val h = 22
        val buf = PixelBuffer(w, h)
        val offsets = arrayOf(intArrayOf(0, 5), intArrayOf(9, 0), intArrayOf(17, 6))
        for (k in indices.indices) {
            val off = offsets[k % offsets.size]
            buf.draw(flowers[indices[k] % flowers.size], off[0], off[1])
        }
        return buf.toSprite()
    }

    /** 火山に追いやられて他の花と合体した、ひとまわり大きく賑やかな茂み。 */
    private fun flowerClusterBig(indices: IntArray): Sprite {
        val w = 40
        val h = 26
        val buf = PixelBuffer(w, h)
        val offsets = arrayOf(intArrayOf(0, 6), intArrayOf(8, 0), intArrayOf(17, 7), intArrayOf(26, 1))
        for (k in indices.indices) {
            val off = offsets[k % offsets.size]
            buf.draw(flowers[indices[k] % flowers.size], off[0], off[1])
        }
        return buf.toSprite()
    }

    /**
     * 花畑は 1 種類だけでなく、色んな花が一緒に咲く。
     * 4..7 は、火山に場所を譲って他の花と合体した「大きい花」の見た目 (Placed.target で選ばれる)。
     */
    val flowerClusters: Array<Sprite> = arrayOf(
        flowerCluster(intArrayOf(0, 1)),
        flowerCluster(intArrayOf(1, 2, 3)),
        flowerCluster(intArrayOf(2, 3, 0)),
        flowerCluster(intArrayOf(3, 0, 1)),
        flowerClusterBig(intArrayOf(0, 1, 2, 3)),
        flowerClusterBig(intArrayOf(1, 2, 3, 0)),
        flowerClusterBig(intArrayOf(2, 3, 0, 1)),
        flowerClusterBig(intArrayOf(3, 0, 1, 2))
    )

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

    // 生きもの ------------------------------------------------------------
    // 0 ヒツジ / 1 ニワトリ / 2 ブタ / 3 ウシ。種類は作ったときに決まる。
    private val SHEEP_PALETTE: Map<Char, Int> = mapOf(
        'W' to rgbOf(0xE9E9E4),
        'w' to rgbOf(0xD2D2CC),
        'F' to rgbOf(0xDDBBA8),
        'f' to rgbOf(0xC49E8B),
        'e' to rgbOf(0x2E2118),
        'L' to rgbOf(0xD2D2CC),
        'H' to rgbOf(0x4A4038)
    )

    private val SHEEP_BODY = listOf(
        "........................",
        "........................",
        ".....WWWWWWWWWW.........",
        "...WWWWWWWWWWWWWW..fff..",
        "..WWWWWWWWWWWWWWWW.FFFF.",
        "..WWWWWWWWWWWWWWWWwFFFFF",
        "..WWWWWWWWWWWWWWWWwFeFF.",
        "..WWWWWWWWWWWWWWWWwFFFF.",
        "..WWWWWWWWWWWWWWWW.FFFF.",
        "...WWWWWWWWWWWWWWW..ff..",
        "....wWWWWWWWWWWWw......."
    )

    private val SHEEP_LEGS_A = listOf(
        ".....LL.......LL........",
        ".....LL.......LL........",
        ".....LL.......LL........",
        ".....HH.......HH........",
        "........................"
    )

    private val SHEEP_LEGS_B = listOf(
        "....LL.........LL.......",
        "....LL.........LL.......",
        "...LL...........LL......",
        "...HH...........HH......",
        "........................"
    )

    /** 0 = 立ち, 1 = 歩き。 */
    val sheep: Array<Sprite> = arrayOf(
        Sprite.of(SHEEP_BODY + SHEEP_LEGS_A, SHEEP_PALETTE),
        Sprite.of(SHEEP_BODY + SHEEP_LEGS_B, SHEEP_PALETTE)
    )

    const val SHEEP_FOOT_Y = 16f
    const val SHEEP_CENTER_X = 12f

    private val CHICKEN_PALETTE: Map<Char, Int> = mapOf(
        'W' to rgbOf(0xF2F2EE),
        'w' to rgbOf(0xD8D8D2),
        'R' to rgbOf(0xD8453A),
        'y' to rgbOf(0xE8B43A),
        'e' to rgbOf(0x2E2118)
    )

    private val CHICKEN_BODY = listOf(
        "................",
        "................",
        "........RR......",
        ".......RRRR.....",
        "......WWWWWW....",
        "......WWeWWWyy..",
        ".....WWWWWWW....",
        "....WWWWWWWWW...",
        "...WWWWWWWWWW...",
        "...WWWWWWWWWw...",
        "...WWWWWWWWw....",
        "....WWWWWWW.....",
        ".....WWWWW......"
    )

    private val CHICKEN_LEGS_A = listOf(
        "......y.y.......",
        "......y.y.......",
        ".....yy.yy......"
    )

    private val CHICKEN_LEGS_B = listOf(
        ".....y...y......",
        ".....y...y......",
        "....yy...yy....."
    )

    private val PIG_PALETTE: Map<Char, Int> = mapOf(
        'P' to rgbOf(0xE8A0A8),
        'p' to rgbOf(0xD4868F),
        'n' to rgbOf(0xCE7686),
        'e' to rgbOf(0x2E2118),
        'L' to rgbOf(0xD4868F),
        'H' to rgbOf(0x6E4A50)
    )

    private val PIG_BODY = listOf(
        "......................",
        "....PPPPPPPPPP........",
        "..PPPPPPPPPPPPPP......",
        ".PPPPPPPPPPPPPPPPP....",
        ".PPPPPPPPPPPPPPPPPnn..",
        ".PPPPPPPPPPPPPPePPnn..",
        ".PPPPPPPPPPPPPPPPPnn..",
        ".PPPPPPPPPPPPPPPPPP...",
        "..PPPPPPPPPPPPPPPp....",
        "...pPPPPPPPPPPPPp....."
    )

    private val PIG_LEGS_A = listOf(
        "....LL......LL........",
        "....LL......LL........",
        "....HH......HH........",
        "......................"
    )

    private val PIG_LEGS_B = listOf(
        "...LL........LL.......",
        "...LL........LL.......",
        "...HH........HH.......",
        "......................"
    )

    private val COW_PALETTE: Map<Char, Int> = mapOf(
        'W' to rgbOf(0xEFEFEA),
        'w' to rgbOf(0xD6D6D0),
        'B' to rgbOf(0x3A3A3A),
        'F' to rgbOf(0xE0B8A8),
        'h' to rgbOf(0xD8CBA8),
        'e' to rgbOf(0x2E2118),
        'L' to rgbOf(0xD6D6D0),
        'H' to rgbOf(0x4A4038)
    )

    private val COW_BODY = listOf(
        "........................",
        "....WWWWWWWWWWWW........",
        "..WWWBBBWWWWWWWWWW......",
        ".WWWWBBBWWWWWWWWWWW.....",
        ".WWWWWWWWWWWWBBWWWWhh...",
        ".WWBBWWWWWWWWBBWWFFFFF..",
        ".WWBBWWWWWWWWWWWWFFeFF..",
        ".WWWWWWWWWWWWWWWWFFFFF..",
        ".WWWWWWWWWWWWWWWWwFFF...",
        "..WWWWWWWWWWWWWWWw......",
        "...wWWWWWWWWWWWWw......."
    )

    private val COW_LEGS_A = listOf(
        "....LL........LL........",
        "....LL........LL........",
        "....LL........LL........",
        "....HH........HH........",
        "........................"
    )

    private val COW_LEGS_B = listOf(
        "...LL..........LL.......",
        "...LL..........LL.......",
        "..LL............LL......",
        "..HH............HH......",
        "........................"
    )

    /** [種類][コマ] */
    val animals: Array<Array<Sprite>> = arrayOf(
        sheep,
        arrayOf(
            Sprite.of(CHICKEN_BODY + CHICKEN_LEGS_A, CHICKEN_PALETTE),
            Sprite.of(CHICKEN_BODY + CHICKEN_LEGS_B, CHICKEN_PALETTE)
        ),
        arrayOf(
            Sprite.of(PIG_BODY + PIG_LEGS_A, PIG_PALETTE),
            Sprite.of(PIG_BODY + PIG_LEGS_B, PIG_PALETTE)
        ),
        arrayOf(
            Sprite.of(COW_BODY + COW_LEGS_A, COW_PALETTE),
            Sprite.of(COW_BODY + COW_LEGS_B, COW_PALETTE)
        )
    )

    /** 種類ごとの足元と中心。 */
    fun animalFootY(variant: Int): Float = animals[variant % animals.size][0].h.toFloat()

    fun animalCenterX(variant: Int): Float = animals[variant % animals.size][0].w / 2f

    /** かえる前の卵。 */
    val egg: Sprite = Sprite.of(
        listOf(
            "................",
            "................",
            "................",
            "................",
            "......EEEE......",
            ".....EEEEEE.....",
            "....EEEEEEEE....",
            "....EEEEsEEE....",
            "....EEEEEEEE....",
            "....EEsEEEEE....",
            "....EEEEEEEE....",
            ".....EEEEEE.....",
            "......EEEE......",
            "................",
            "................",
            "................"
        ),
        mapOf('E' to rgbOf(0xEFE4D2), 's' to rgbOf(0xCBBBA0))
    )

    // 飛来物 ----------------------------------------------------------------
    /** 隕石 (鉱物のかたまり)。 */
    val meteor: Sprite = Sprite.of(
        listOf(
            "................",
            "................",
            "....RRRR........",
            "...RRMMRRR......",
            "..RRMMMMRRR.....",
            "..RMMMMMMRR.....",
            "..RRMMMMMRR.....",
            "...RRRMMRR......",
            "....RRRRR.......",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................"
        ),
        mapOf('R' to rgbOf(0x5A4A40), 'M' to rgbOf(0x8A7A6A))
    )

    /**
     * 宇宙のチリ (たねや卵のもと)。
     * 綿毛のついた種が、ふわふわと漂ってくる見た目にしてある。
     */
    val seedFluff: Sprite = run {
        val n = 16
        val cx = n / 2f - 0.5f
        val cy = n / 2f - 0.5f
        val px = IntArray(n * n)
        val rnd = Rnd(0x5EED)
        val fluff = rgbOf(0xF2EEDD)
        val fluffDim = rgbOf(0xC9DDB0)
        val tip = rgbOf(0xFFFFFF)
        val seedColor = rgbOf(0x8A6B42)

        val spokes = 11
        for (k in 0 until spokes) {
            val a = (k.toFloat() / spokes) * (2f * kotlin.math.PI.toFloat()) + rnd.range(-0.15f, 0.15f)
            val len = 5f + rnd.range(-0.7f, 1.0f)
            val dx = cos(a)
            val dy = sin(a)
            var t = 1.4f
            while (t <= len) {
                val x = (cx + dx * t).roundToInt()
                val y = (cy + dy * t).roundToInt()
                if (x in 0 until n && y in 0 until n) {
                    px[y * n + x] = when {
                        t > len - 1.1f -> tip
                        rnd.int(100) < 30 -> fluffDim
                        else -> fluff
                    }
                }
                t += 1f
            }
        }
        // 中心の種
        for (dy in -1..1) for (dx in -1..1) {
            if (abs(dx) + abs(dy) > 1) continue
            val x = (cx + dx).roundToInt()
            val y = (cy + dy).roundToInt()
            if (x in 0 until n && y in 0 until n) px[y * n + x] = seedColor
        }
        Sprite(n, n, px)
    }

    /**
     * 彗星の核 (家ほどの大きさ)。氷と岩が混じった塊で、惑星のわきをかすめて飛んでいく。
     * 進行方向は描画時に回転させる。
     */
    val cometNucleus: Sprite = run {
        val w = 88
        val h = 72
        val cx = w / 2f
        val cy = h / 2f
        val rx = w * 0.42f
        val ry = h * 0.40f
        val px = IntArray(w * h)
        val rock = rgbOf(0x6E7A8A)
        val rockDark = rgbOf(0x4E5868)
        val ice = rgbOf(0xCDE8F5)
        val iceBright = rgbOf(0xF0FAFF)
        for (y in 0 until h) {
            for (x in 0 until w) {
                val nx = (x - cx) / rx
                val ny = (y - cy) / ry
                val d = nx * nx + ny * ny
                val wobble = 1f + 0.10f * sin(atan2(ny, nx) * 5f + 1.7f)
                if (d > wobble) continue
                val noise = valueNoise(x * 0.09f, y * 0.09f, 0x77AA)
                px[y * w + x] = when {
                    noise > 0.74f -> iceBright
                    noise > 0.5f -> ice
                    noise > 0.26f -> rock
                    else -> rockDark
                }
            }
        }
        Sprite(w, h, px)
    }

    /**
     * 遠くを飛んでいく UFO (演出用。ゲームには関係ない)。
     * ドーム状の操縦席 (窓3つ) + 平たく広い円盤 (縁が光る) + 丸みを帯びた下部 +
     * 着陸脚3本 (先端が光る) の、アダムスキー型とひと目で分かる形にしてある。
     */
    val ufo: Sprite = run {
        val w = 56
        val h = 40
        val cx = w / 2f - 0.5f
        val px = IntArray(w * h)
        // 固定の光源 (左上) で陰影をつける。実際の太陽の向きとは連動しない
        val lx = -0.55f
        val ly = -0.65f

        val domeGlass = rgbOf(0xCFF3EE)
        val domeGlassDark = rgbOf(0x86C9BE)
        val portRing = rgbOf(0x33393F)
        val portGlow = rgbOf(0xFFF3B8)
        val hullLight = rgbOf(0xC7CFD8)
        val hullMid = rgbOf(0x969FAC)
        val hullDark = rgbOf(0x5B6472)
        val rimGlow = rgbOf(0x8FEBFF)
        val legColor = rgbOf(0x6B7280)
        val footGlow = rgbOf(0x9CFFEC)

        val domeCy = 14f
        val domeRx = 11f
        val domeRy = 9f
        for (y in 0 until h) for (x in 0 until w) {
            val nx = (x - cx) / domeRx
            val ny = (y - domeCy) / domeRy
            if (ny > 0.12f) continue
            val d2 = nx * nx + ny * ny
            if (d2 > 1f) continue
            val shade = (nx * lx + ny * ly + 0.55f).coerceIn(0f, 1f)
            px[y * w + x] = Col.lerp(domeGlassDark, domeGlass, shade)
        }
        for (i in -1..1) {
            val pcx = cx + i * 5.5f
            val pcy = domeCy + 1f
            for (dy in -2..2) for (dx in -2..2) {
                val d2 = dx * dx + dy * dy
                if (d2 > 4) continue
                val x = (pcx + dx).roundToInt()
                val y = (pcy + dy).roundToInt()
                if (x !in 0 until w || y !in 0 until h) continue
                px[y * w + x] = if (d2 <= 1) portGlow else portRing
            }
        }

        val discCy = 20f
        val discRx = 26f
        val discRy = 6f
        for (y in 0 until h) for (x in 0 until w) {
            val nx = (x - cx) / discRx
            val ny = (y - discCy) / discRy
            val d2 = nx * nx + ny * ny
            if (d2 > 1f) continue
            val shade = (nx * lx + ny * ly + 0.55f).coerceIn(0f, 1f)
            val base = Col.lerp(hullDark, hullLight, shade)
            val onRim = d2 > 0.78f
            px[y * w + x] = if (onRim && ((x + (y % 2)) % 5 == 0)) rimGlow else base
        }

        val underCy = 25f
        val underRx = 14f
        val underRy = 7f
        for (y in 0 until h) for (x in 0 until w) {
            val nx = (x - cx) / underRx
            val ny = (y - underCy) / underRy
            if (ny < -0.15f) continue
            val d2 = nx * nx + ny * ny
            if (d2 > 1f) continue
            val shade = (nx * lx + ny * ly + 0.4f).coerceIn(0f, 1f)
            px[y * w + x] = Col.lerp(hullDark, hullMid, shade)
        }

        val legTopY = 30f
        val legBottomY = 38f
        for (legX in floatArrayOf(cx - 9f, cx, cx + 9f)) {
            for (t in 0..8) {
                val ft = t / 8f
                val lxAt = legX + (cx - legX) * 0.2f * ft
                val y = (legTopY + (legBottomY - legTopY) * ft).roundToInt()
                val x0 = lxAt.roundToInt()
                for (x in x0..x0 + 1) {
                    if (x !in 0 until w || y !in 0 until h) continue
                    px[y * w + x] = legColor
                }
            }
            val fx = legX.roundToInt()
            val fy = legBottomY.roundToInt()
            for (dy in -1..1) for (dx in -1..1) {
                if (dx * dx + dy * dy > 2) continue
                val x = fx + dx
                val y = fy + dy
                if (x !in 0 until w || y !in 0 until h) continue
                px[y * w + x] = footGlow
            }
        }

        Sprite(w, h, px)
    }

    /**
     * 遠くを通り過ぎていく、よその惑星 (演出用)。自分の星と同じような作りだが、
     * 豆粒ほどの大きさなのでブロックには分けず、あらかじめ 1 枚の球として焼き込む。
     */
    val distantPlanet: Sprite = run {
        val n = 26
        val cx = n / 2f - 0.5f
        val cy = n / 2f - 0.5f
        val r = n / 2f - 1f
        val px = IntArray(n * n)
        val litGrass = rgbOf(0x7CC24A)
        val darkSide = rgbOf(0x28401F)
        val dirt = rgbOf(0x8A6141)
        for (y in 0 until n) {
            for (x in 0 until n) {
                val dx = x - cx
                val dy = y - cy
                val d = sqrt(dx * dx + dy * dy)
                if (d > r) continue
                // 固定の光源 (左上) で陰影をつける。実際の太陽の向きとは連動しない
                val lightF = ((-dx / r) * 0.55f + (-dy / r) * 0.35f + 0.35f).coerceIn(0f, 1f)
                val patch = valueNoise(x * 0.45f, y * 0.45f, 0x9E7)
                val base = if (patch > 0.76f) dirt else litGrass
                px[y * n + x] = Col.scale(Col.lerp(darkSide, base, lightF), 0.55f + 0.45f * lightF)
            }
        }
        Sprite(n, n, px)
    }

    fun skyFallSprite(kind: SkyFallKind): Sprite = when (kind) {
        SkyFallKind.METEOR -> meteor
        SkyFallKind.COSMIC_DUST -> seedFluff
        SkyFallKind.COMET_DUST -> cometNucleus
    }

    fun skyFallTrailColor(kind: SkyFallKind): Int = when (kind) {
        SkyFallKind.METEOR -> rgbOf(0xFF9A3A)
        SkyFallKind.COSMIC_DUST -> rgbOf(0x9BD46A)
        SkyFallKind.COMET_DUST -> rgbOf(0xAEE6FF)
    }

    /** 煙のつぶ (小さな四角)。 */
    fun smokeColor(alpha: Int): Int = Col.argb(alpha, 0xCF, 0xD4, 0xDC)
}
