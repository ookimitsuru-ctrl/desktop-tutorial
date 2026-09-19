package com.example.planetgrow.preview

import com.example.planetgrow.core.BuildJob
import com.example.planetgrow.core.BuildKind
import com.example.planetgrow.core.Placed
import com.example.planetgrow.core.PixelBuffer
import com.example.planetgrow.core.PlanetState
import com.example.planetgrow.core.Recipes
import com.example.planetgrow.core.Scene
import com.example.planetgrow.core.Sky
import com.example.planetgrow.core.World
import com.example.planetgrow.core.rgbOf
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
        val r = Recipes.of(BuildKind.HOUSE)
        val angle = s.freeAngleFor(BuildKind.HOUSE)
        if (angle != null) {
            s.jobs.add(BuildJob(BuildKind.HOUSE, angle, now - r.durationMillis / 2, now + r.durationMillis / 2))
        }
    }
    s.lastTickMillis = now
    return s
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
