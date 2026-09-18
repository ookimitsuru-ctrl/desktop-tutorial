package com.example.planetgrow.preview

import com.example.planetgrow.core.PixelBuffer
import com.example.planetgrow.core.Scene
import com.example.planetgrow.core.Sky
import com.example.planetgrow.core.World
import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO

/**
 * 端末が無くても惑星の見た目を確認するためのプレビュー。
 * アプリ本体と同じ描画コード (core パッケージ) を使って PNG を書き出す。
 *
 *   cd preview && ../gradlew run
 *   cd preview && ../gradlew run --args="out 20 06:00 12:00 19:00 23:00"
 *                                   ^出力先 ^何日目 ^時刻...
 */
fun main(args: Array<String>) {
    val outDir = File(if (args.isNotEmpty()) args[0] else "out")
    outDir.mkdirs()
    val day = if (args.size > 1) args[1].toIntOrNull() ?: 1 else 1
    val times = if (args.size > 2) args.drop(2) else listOf("06:00", "09:00", "12:00", "17:30", "20:00", "00:00")

    // よくある縦長スマホの画面を想定する
    val viewBlocks = Scene.viewBlocksFor(day)
    val size = Scene.bufferSize(1080, 2340, viewBlocks)
    val scene = Scene(size[0], size[1])
    println("${day}日目 / 視野 ${viewBlocks} ブロック / バッファ ${size[0]}x${size[1]}")

    val sheet = ArrayList<PixelBuffer>()
    for (t in times) {
        val world = World(day)
        val sky = Sky(parseTime(t), System.currentTimeMillis())
        // 住人や煙が動き出した状態にしてから描く
        val dt = 1f / 30f
        var elapsed = 0f
        repeat(900) {
            world.update(dt, sky.sunDirX, sky.sunDirY)
            elapsed += dt
        }
        val start = System.nanoTime()
        scene.render(world, sky, elapsed, dt)
        val ms = (System.nanoTime() - start) / 1_000_000.0
        val name = "day%02d_%s".format(day, t.replace(":", ""))
        writePng(scene.frame, File(outDir, "$name.png"))
        writePng(zoom(scene.frame, (viewBlocks - 2) * Scene.BLOCK, 2), File(outDir, "${name}_zoom.png"))
        println("  %s  %5.1f ms".format(t, ms))
        if (sheet.size < 4) sheet.add(copyOf(scene.frame))
    }
    if (sheet.size > 1) writePng(横に並べる(sheet), File(outDir, "day%02d_sheet.png".format(day)))
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
    out.fill(com.example.planetgrow.core.rgbOf(0x000000))
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
