package com.example.planetgrow.preview

import com.example.planetgrow.core.BuildJob
import com.example.planetgrow.core.BuildKind
import com.example.planetgrow.core.Placed
import com.example.planetgrow.core.PixelBuffer
import com.example.planetgrow.core.PlanetState
import com.example.planetgrow.core.Recipes
import com.example.planetgrow.core.Scene
import com.example.planetgrow.core.Sky
import com.example.planetgrow.core.Tex
import com.example.planetgrow.core.World
import com.example.planetgrow.core.rgbOf
import com.example.planetgrow.core.tiledSwatch
import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO

/**
 * 端末が無くても惑星の見た目を確認するためのプレビュー。
 * アプリ本体と同じ描画コード (core パッケージ) を使って PNG を書き出す。
 *
 *   cd preview && ../gradlew run
 *   cd preview && ../gradlew run --args="out 2 06:00 12:00 19:00 23:00"
 *                                   ^出力先 ^育ち具合(0-3) ^時刻...
 */
fun main(args: Array<String>) {
    if (args.isNotEmpty() && args[0] == "swatch") {
        renderSwatches(File(if (args.size > 1) args[1] else "out"))
        return
    }
    if (args.isNotEmpty() && args[0] == "fx") {
        renderFallEffects(File(if (args.size > 1) args[1] else "out"))
        return
    }
    if (args.isNotEmpty() && args[0] == "ufo") {
        renderUfo(File(if (args.size > 1) args[1] else "out"))
        return
    }
    if (args.isNotEmpty() && args[0] == "ufosprite") {
        renderUfoSprite(File(if (args.size > 1) args[1] else "out"))
        return
    }
    if (args.isNotEmpty() && args[0] == "aliens") {
        renderAlienFeatures(File(if (args.size > 1) args[1] else "out"))
        return
    }
    val outDir = File(if (args.isNotEmpty()) args[0] else "out")
    outDir.mkdirs()
    val level = if (args.size > 1) args[1].toIntOrNull() ?: 0 else 0
    val times = if (args.size > 2) args.drop(2) else listOf("06:00", "09:00", "12:00", "17:30", "20:00", "00:00")

    val now = System.currentTimeMillis()
    val state = demoState(level, now)
    val viewBlocks = Scene.viewBlocksFor(state, now)
    val blockPx = Scene.blockPxFor(viewBlocks)
    val size = Scene.bufferSize(1080, 2340, viewBlocks, blockPx)
    val scene = Scene(size[0], size[1], blockPx)
    println("育ち具合 $level / 視野 $viewBlocks ブロック / 1ブロック ${blockPx}px / バッファ ${size[0]}x${size[1]}")
    for (pl in state.placed) println("    ${pl.kind} angle=${pl.angleDeg} variant=${pl.variant}")
    println("  建物 ${state.placed.size} / 建設中 ${state.jobs.size} / 鉱石 ${state.mineral} たね ${state.seed} 氷 ${state.ice}")

    val sheet = ArrayList<PixelBuffer>()
    for (t in times) {
        val world = World(state)
        world.syncFromState(now)
        val sky = Sky(parseTime(t), now)
        val dt = 1f / 30f
        var elapsed = 0f
        repeat(900) {
            world.update(dt, sky.sunDirX, sky.sunDirY)
            elapsed += dt
        }
        // 飛来の様子も 1 つ見えるようにする
        if (t == times.first()) {
            world.addFalling(com.example.planetgrow.core.SkyFallKind.METEOR, 40f, 2)
            repeat(30) { world.update(dt, sky.sunDirX, sky.sunDirY) }
        }
        val start = System.nanoTime()
        scene.render(world, sky, elapsed, dt)
        val ms = (System.nanoTime() - start) / 1_000_000.0
        val name = "lv%d_%s".format(level, t.replace(":", ""))
        writePng(scene.frame, File(outDir, "$name.png"))
        writePng(zoom(scene.frame, (viewBlocks - 2) * blockPx, 2), File(outDir, "${name}_zoom.png"))
        println("  %s  %5.1f ms".format(t, ms))
        if (sheet.size < 4) sheet.add(copyOf(scene.frame))

        // 衛星があれば、そこへ寄った絵も出す (タップで移動したときの見え方)
        if (state.satellites(now).isNotEmpty() && t == times.first()) {
            scene.focus = 0
            repeat(60) { scene.render(world, sky, elapsed, 1f / 30f) }
            writePng(scene.frame, File(outDir, "${name}_sat.png"))
            scene.focus = Scene.FOCUS_PLANET
            repeat(60) { scene.render(world, sky, elapsed, 1f / 30f) }
        }
    }
    if (sheet.size > 1) writePng(横に並べる(sheet), File(outDir, "lv%d_sheet.png".format(level)))
    println("-> ${outDir.absolutePath}")
}

/** 見た目を確かめるための、育ち具合ごとの状態。 */
private fun demoState(level: Int, now: Long): PlanetState {
    val ageDays = when (level) {
        0 -> 1L
        1 -> 4L
        2 -> 12L
        3 -> 30L
        4 -> 88L   // 3ヶ月直後 (衛星ができはじめる)
        else -> 125L // 衛星が育ちきって橋がかかる
    }
    val s = PlanetState.newPlanet(now - ageDays * 24L * 3600L * 1000L)
    s.mineral = 6
    s.seed = 4
    s.ice = 3
    s.crop = 5f
    fun place(kind: BuildKind, variant: Int = 0) {
        if (com.example.planetgrow.core.Structures.isOnSurface(kind)) {
            val slot = s.freeFaceSlot(now) ?: return
            s.placed.add(Placed(kind, slot[1], now, variant, -1, slot[0]))
            return
        }
        val a = s.freeAngleFor(kind) ?: return
        s.placed.add(Placed(kind, a, now, variant))
    }
    if (level >= 1) {
        place(BuildKind.FLOWER, 0)
        place(BuildKind.LAMP)
    }
    if (level >= 2) {
        place(BuildKind.TREE, 0)
        place(BuildKind.POND)
        place(BuildKind.ANIMAL, 0)
        place(BuildKind.FARM)
    }
    if (level >= 3) {
        place(BuildKind.HOUSE)
        place(BuildKind.TREE, 1)
        place(BuildKind.TREE, 2)
        place(BuildKind.FLOWER, 2)
        place(BuildKind.ANIMAL, 1)
    }
    if (level >= 4) {
        place(BuildKind.TREE, 3)
        place(BuildKind.ANIMAL, 2)
        place(BuildKind.ANIMAL, 3)
        place(BuildKind.FLOWER, 1)
    }
    if (level >= 5) {
        // 育ちきった衛星に橋をかけた状態
        val sat = s.satellites(now).firstOrNull { it.habitable(now) }
        if (sat != null) {
            s.bridged.add(sat.index)
            s.placed.add(Placed(BuildKind.BRIDGE, sat.angleDeg(now), now, 0, sat.index))
        }
    }
    // 建設中のものも 1 つ見えるようにする
    if (level in 1..3) {
        val r = Recipes.of(BuildKind.FLOWER)
        val angle = s.freeAngleFor(BuildKind.FLOWER)
        if (angle != null) {
            s.jobs.add(BuildJob(BuildKind.FLOWER, angle, now - r.durationMillis / 2, now + r.durationMillis / 2))
        }
    }
    s.lastTickMillis = now
    return s
}

/** タイトル文字に使うブロックのタイルを確かめる。 */
private fun renderSwatches(outDir: File) {
    outDir.mkdirs()
    val sets = listOf(
        "grass" to Tex.grassTop,
        "dirt" to Tex.dirt,
        "stone" to Tex.stone,
        "log" to Tex.log,
        "plank" to Tex.plank
    )
    for ((name, variants) in sets) {
        val sw = tiledSwatch(variants, 6)
        val buf = PixelBuffer(sw.w, sw.h)
        System.arraycopy(sw.px, 0, buf.px, 0, sw.px.size)
        writePng(buf, File(outDir, "swatch_$name.png"))
        writePng(zoom(buf, sw.w, 4), File(outDir, "swatch_${name}_big.png"))
    }
    println("-> ${outDir.absolutePath}")
}

/** 花畑・荒れ地・宇宙船襲来の当たり方を確かめる (仕様変更の確認用)。 */
private fun renderAlienFeatures(outDir: File) {
    outDir.mkdirs()

    // 1) 花の茂み (大きさ・色のバリエーション)
    run {
        val clusters = com.example.planetgrow.core.Art.flowerClusters
        val w = clusters.maxOf { it.w }
        val h = clusters.sumOf { it.h + 2 }
        val buf = PixelBuffer(w * 6, h)
        var x = 0
        for (c in clusters) {
            buf.draw(c, x, 0)
            x += c.w + 4
        }
        val factor = 5
        val big = PixelBuffer(buf.width * factor, buf.height * factor)
        for (y in 0 until big.height) for (bx in 0 until big.width) {
            big.px[y * big.width + bx] = buf.px[(y / factor) * buf.width + (bx / factor)]
        }
        writePng(big, File(outDir, "flower_clusters.png"))
    }

    // 2) 荒れ地 (惑星の 1/4 が荒れ地になっている状態)
    run {
        val now = System.currentTimeMillis()
        val state = PlanetState.newPlanet(now - 10L * 24 * 3600 * 1000)
        state.wastelandStartMillis = now
        state.wastelandCenterDeg = 0f
        val world = World(state)
        world.syncFromState(now)
        val viewBlocks = Scene.viewBlocksFor(state, now)
        val blockPx = Scene.blockPxFor(viewBlocks)
        val size = Scene.bufferSize(1080, 1080, viewBlocks, blockPx)
        val scene = Scene(size[0], size[1], blockPx)
        val sky = Sky(0.5f, now)
        scene.render(world, sky, 0f, 0f)
        writePng(scene.frame, File(outDir, "wasteland.png"))
    }

    // 3) ペット (どうぶつ) が正面の面に座っているか
    run {
        val now = System.currentTimeMillis()
        val state = PlanetState.newPlanet(now - 10L * 24 * 3600 * 1000)
        val slot = state.freeFaceSlot(now)!!
        state.placed.add(Placed(BuildKind.ANIMAL, slot[1], now, 0, -1, slot[0]))
        val slot2 = state.freeFaceSlot(now)!!
        state.placed.add(Placed(BuildKind.ANIMAL, slot2[1], now, 2, -1, slot2[0]))
        val slot3 = state.freeFaceSlot(now)!!
        val r = Recipes.of(BuildKind.ANIMAL)
        state.jobs.add(BuildJob(BuildKind.ANIMAL, slot3[1], now - r.durationMillis / 2, now + r.durationMillis / 2, -1, slot3[0]))
        val world = World(state)
        world.syncFromState(now)
        val viewBlocks = Scene.viewBlocksFor(state, now)
        val blockPx = Scene.blockPxFor(viewBlocks)
        val size = Scene.bufferSize(1080, 1080, viewBlocks, blockPx)
        val scene = Scene(size[0], size[1], blockPx)
        val sky = Sky(0.5f, now)
        scene.render(world, sky, 0f, 0f)
        writePng(scene.frame, File(outDir, "pets_on_surface.png"))
        writePng(zoom(scene.frame, (viewBlocks - 4) * blockPx, 3), File(outDir, "pets_on_surface_zoom.png"))
    }

    // 4) 宇宙船襲来の結果分布 (運まかせの結果がだいたい狙い通りか)
    run {
        val birth = 0L
        val state = PlanetState.newPlanet(birth)
        state.placed.add(Placed(BuildKind.ANIMAL, 0f, birth, 0, -1, 0f))
        var t = birth
        val counts = linkedMapOf("DAMAGE" to 0, "RETREAT" to 0, "VICTORY" to 0)
        var drops = 0
        repeat(400) {
            t += PlanetState.ALIEN_INTERVAL_MILLIS
            state.advanceTo(t)
            for (e in state.pendingAlienEvents) {
                counts[e.outcome.name] = (counts[e.outcome.name] ?: 0) + 1
                if (e.droppedResource != null) drops++
            }
            state.pendingAlienEvents.clear()
        }
        println("花0本での400回の襲来結果: $counts (撤退時ドロップ $drops 回)")

        val state2 = PlanetState.newPlanet(birth)
        state2.placed.add(Placed(BuildKind.ANIMAL, 0f, birth, 0, -1, 0f))
        repeat(6) { i -> state2.placed.add(Placed(BuildKind.FLOWER, i * 40f, birth)) }
        var t2 = birth
        val counts2 = linkedMapOf("DAMAGE" to 0, "RETREAT" to 0, "VICTORY" to 0)
        repeat(400) {
            t2 += PlanetState.ALIEN_INTERVAL_MILLIS
            state2.advanceTo(t2)
            for (e in state2.pendingAlienEvents) counts2[e.outcome.name] = (counts2[e.outcome.name] ?: 0) + 1
            state2.pendingAlienEvents.clear()
        }
        println("花6本での400回の襲来結果: $counts2")
    }

    println("-> ${outDir.absolutePath}")
}

/** UFO のドット絵そのものを拡大して確かめる (ドーム・窓・脚が分かるか)。 */
private fun renderUfoSprite(outDir: File) {
    outDir.mkdirs()
    val sprite = com.example.planetgrow.core.Art.ufo
    val buf = PixelBuffer(sprite.w, sprite.h)
    buf.fill(rgbOf(0x0A0E1C))
    buf.draw(sprite, 0, 0)
    val factor = 8
    val big = PixelBuffer(buf.width * factor, buf.height * factor)
    for (y in 0 until big.height) {
        for (x in 0 until big.width) {
            big.px[y * big.width + x] = buf.px[(y / factor) * buf.width + (x / factor)]
        }
    }
    writePng(big, File(outDir, "ufo_sprite_big.png"))
    println("-> ${outDir.absolutePath}")
}

/** UFO の飛び方 (急加速・急停止・直角ターンなど) を確かめる。 */
private fun renderUfo(outDir: File) {
    outDir.mkdirs()
    val now = System.currentTimeMillis()
    val state = PlanetState.newPlanet(now - 10L * 24 * 3600 * 1000)
    val viewBlocks = Scene.viewBlocksFor(state, now)
    val blockPx = Scene.blockPxFor(viewBlocks)
    val size = Scene.bufferSize(1080, 2340, viewBlocks, blockPx)
    val scene = Scene(size[0], size[1], blockPx)
    val world = World(state)
    world.syncFromState(now)
    val sky = Sky(0.5f, now)
    val dt = 1f / 30f
    val shots = intArrayOf(50, 65, 80, 95, 115, 140, 170, 200)
    var shotIdx = 0
    var frameNo = 0
    var t = 0f
    while (shotIdx < shots.size) {
        scene.render(world, sky, t, dt)
        t += dt
        frameNo++
        if (frameNo == shots[shotIdx]) {
            writePng(scene.frame, File(outDir, "ufo_%03d.png".format(frameNo)))
            writePng(cropTop(scene.frame, 0.6f), File(outDir, "ufo_%03d_top.png".format(frameNo)))
            shotIdx++
        }
    }
    println("-> ${outDir.absolutePath}")
}

/** 飛来の演出 (隕石・たね・彗星) を、決まったコマ数まで進めて書き出す。 */
private fun renderFallEffects(outDir: File) {
    outDir.mkdirs()
    val now = System.currentTimeMillis()
    val state = PlanetState.newPlanet(now - 10L * 24 * 3600 * 1000)
    val viewBlocks = Scene.viewBlocksFor(state, now)
    val blockPx = Scene.blockPxFor(viewBlocks)
    val size = Scene.bufferSize(1080, 2340, viewBlocks, blockPx)
    val sky = Sky(0.5f, now) // 真昼
    println("視野 $viewBlocks ブロック / 1ブロック ${blockPx}px / バッファ ${size[0]}x${size[1]}")

    fun renderAt(name: String, kind: com.example.planetgrow.core.SkyFallKind, angle: Float, steps: Int) {
        val scene = Scene(size[0], size[1], blockPx)
        val world = World(state)
        world.syncFromState(now)
        world.addFalling(kind, angle, 2)
        val dt = 1f / 30f
        repeat(steps) { world.update(dt, sky.sunDirX, sky.sunDirY) }
        scene.render(world, sky, steps * dt, dt)
        writePng(scene.frame, File(outDir, "$name.png"))
        writePng(zoom(scene.frame, (viewBlocks - 2) * blockPx, 2), File(outDir, "${name}_zoom.png"))
        println("  $name  (${steps}コマ)")
    }

    // 隕石: 落下中 → 着弾の光
    renderAt("meteor_mid", com.example.planetgrow.core.SkyFallKind.METEOR, 40f, 40)
    renderAt("meteor_impact", com.example.planetgrow.core.SkyFallKind.METEOR, 40f, 95)

    // たね: 漂っている途中 → 着地直後
    renderAt("seed_mid", com.example.planetgrow.core.SkyFallKind.COSMIC_DUST, -30f, 195)
    renderAt("seed_land", com.example.planetgrow.core.SkyFallKind.COSMIC_DUST, -30f, 245)

    // 彗星: 近づいてくる → 最接近で氷をまく → 通り過ぎたあと
    renderAt("comet_approach", com.example.planetgrow.core.SkyFallKind.COMET_DUST, 0f, 45)
    renderAt("comet_pass", com.example.planetgrow.core.SkyFallKind.COMET_DUST, 0f, 84)
    renderAt("comet_after", com.example.planetgrow.core.SkyFallKind.COMET_DUST, 0f, 130)

    println("-> ${outDir.absolutePath}")
}

private fun parseTime(s: String): Float {
    val parts = s.split(":")
    val h = parts.getOrNull(0)?.toIntOrNull() ?: 12
    val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
    return (h * 3600 + m * 60).toFloat() / 86400f
}

private fun copyOf(buf: PixelBuffer): PixelBuffer {
    val out = PixelBuffer(buf.width, buf.height)
    System.arraycopy(buf.px, 0, out.px, 0, buf.px.size)
    return out
}

/** 時刻ごとの絵を横に並べた 1 枚を作る (README 用)。 */
private fun 横に並べる(frames: List<PixelBuffer>): PixelBuffer {
    val gap = 10
    val w = frames.sumOf { it.width } + gap * (frames.size - 1)
    val h = frames.maxOf { it.height }
    val out = PixelBuffer(w, h)
    out.fill(rgbOf(0x000000))
    var x = 0
    for (f in frames) {
        for (y in 0 until f.height) {
            System.arraycopy(f.px, y * f.width, out.px, y * out.width + x, f.width)
        }
        x += f.width + gap
    }
    return out
}

/** 上側だけ切り出す (画面の広い範囲を動き回る演出の確認用)。 */
private fun cropTop(buf: PixelBuffer, fraction: Float): PixelBuffer {
    val h = (buf.height * fraction).toInt().coerceIn(1, buf.height)
    val out = PixelBuffer(buf.width, h)
    System.arraycopy(buf.px, 0, out.px, 0, buf.width * h)
    return out
}

/** 中央を切り出して拡大する (ドットの確認用)。 */
private fun zoom(buf: PixelBuffer, cropSize: Int, factor: Int): PixelBuffer {
    val c = minOf(cropSize, buf.width, buf.height)
    val x0 = (buf.width - c) / 2
    val y0 = (buf.height - c) / 2
    val out = PixelBuffer(c * factor, c * factor)
    for (y in 0 until c * factor) {
        for (x in 0 until c * factor) {
            out.px[y * out.width + x] = buf.px[(y0 + y / factor) * buf.width + (x0 + x / factor)]
        }
    }
    return out
}

private fun writePng(buf: PixelBuffer, file: File) {
    val img = BufferedImage(buf.width, buf.height, BufferedImage.TYPE_INT_RGB)
    img.setRGB(0, 0, buf.width, buf.height, buf.px, 0, buf.width)
    ImageIO.write(img, "png", file)
}
