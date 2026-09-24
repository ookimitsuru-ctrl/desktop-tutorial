package com.example.planetgrow.preview

import com.example.planetgrow.core.BuildJob
import com.example.planetgrow.core.BuildKind
import com.example.planetgrow.core.DAY_MS
import com.example.planetgrow.core.Placed
import com.example.planetgrow.core.PixelBuffer
import com.example.planetgrow.core.PlanetState
import com.example.planetgrow.core.Recipes
import com.example.planetgrow.core.Scene
import com.example.planetgrow.core.Sky
import com.example.planetgrow.core.Tex
import com.example.planetgrow.core.World
import com.example.planetgrow.core.rgbOf
import com.example.planetgrow.core.shortestAngle
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
    if (args.isNotEmpty() && args[0] == "specupdate") {
        renderSpecUpdate(File(if (args.size > 1) args[1] else "out"))
        return
    }
    if (args.isNotEmpty() && args[0] == "volcano") {
        renderVolcanoUpdate(File(if (args.size > 1) args[1] else "out"))
        return
    }
    if (args.isNotEmpty() && args[0] == "movement") {
        renderMovementUpdate(File(if (args.size > 1) args[1] else "out"))
        return
    }
    if (args.isNotEmpty() && args[0] == "events") {
        renderEventsUpdate(File(if (args.size > 1) args[1] else "out"))
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

/** 家畜3頭孵化・レア卵からペット・略奪の当たり方を確かめる (仕様変更の確認用)。 */
private fun renderSpecUpdate(outDir: File) {
    outDir.mkdirs()

    // 1) 卵をかえす -> 家畜が3頭 (面の空きに)
    run {
        val birth = 0L
        val state = PlanetState.newPlanet(birth)
        state.seed = 10
        state.ice = 10
        val r = Recipes.of(BuildKind.ANIMAL)
        println("卵をかえす: ${r.durationMillis / 3600000}時間")
        check(state.startBuild(r, birth)) { "卵をかえすを開始できなかった" }
        val hatchAt = birth + r.durationMillis + 1000L
        state.advanceTo(hatchAt)
        val born = state.placed.count { it.kind == BuildKind.ANIMAL }
        println("家畜のうまれた数: $born (面配置: ${state.placed.filter { it.kind == BuildKind.ANIMAL }.all { it.dist >= 0f }})")
    }

    // 2) レア卵 -> ペットが外周に1頭
    run {
        val birth = 0L
        val state = PlanetState.newPlanet(birth)
        state.rareItem = 1
        state.advanceTo(birth + 1000L) // rareItem を見て孵化ジョブを開始するはず
        val hatching = state.jobs.any { it.kind == BuildKind.PET }
        println("レア卵: 孵化ジョブ開始 = $hatching (在庫 ${state.rareItem})")
        val hatchAt = birth + PlanetState.PET_HATCH_MILLIS + 2000L
        state.advanceTo(hatchAt)
        val pet = state.placed.firstOrNull { it.kind == BuildKind.PET }
        println("ペットうまれた = ${pet != null}, 外周配置 (dist<0) = ${pet?.dist?.let { it < 0f }}")

        // 見た目を確認
        val world = World(state)
        world.syncFromState(hatchAt)
        val viewBlocks = Scene.viewBlocksFor(state, hatchAt)
        val blockPx = Scene.blockPxFor(viewBlocks)
        val size = Scene.bufferSize(1080, 1080, viewBlocks, blockPx)
        val scene = Scene(size[0], size[1], blockPx)
        val sky = Sky(0.5f, hatchAt)
        scene.render(world, sky, 0f, 0f)
        writePng(scene.frame, File(outDir, "pet_rim.png"))
        writePng(zoom(scene.frame, (viewBlocks - 4) * blockPx, 3), File(outDir, "pet_rim_zoom.png"))
    }

    // 3) 略奪: 家畜がいるときの DAMAGE は荒れ地でなく略奪になるか (何度も回して確認)
    run {
        val birth = 0L
        val state = PlanetState.newPlanet(birth)
        repeat(5) { state.placed.add(Placed(BuildKind.ANIMAL, 0f, birth, 0, -1, it * 3.6f)) }
        var t = birth
        var abductions = 0
        var wastelands = 0
        repeat(60) {
            t += PlanetState.ALIEN_INTERVAL_MILLIS
            state.advanceTo(t)
            for (e in state.pendingAlienEvents) {
                if (e.outcome == com.example.planetgrow.core.AlienOutcome.DAMAGE) {
                    if (e.abductedAnimal) abductions++ else wastelands++
                }
            }
            state.pendingAlienEvents.clear()
        }
        println("家畜5頭ありでの60回試行: 略奪$abductions 回 / 荒れ地$wastelands 回 (家畜がいる限り略奪のはず) / 残り家畜${state.countOf(BuildKind.ANIMAL)}頭")
        println("宇宙人襲来の間隔: ${PlanetState.ALIEN_INTERVAL_MILLIS / 3600000}時間 (1日に${DAY_MS / PlanetState.ALIEN_INTERVAL_MILLIS}度)")
    }

    println("-> ${outDir.absolutePath}")
}

/**
 * 地殻変動 (3日ごと、9日で1周期: 火山出現→活発化→惑星成長) の確認用。
 */
private fun renderVolcanoUpdate(outDir: File) {
    outDir.mkdirs()
    val tick = PlanetState.TECTONIC_TICK_MILLIS

    // 1) 周期そのもの: 3日目に出現、6日目に活発化、9日目に成長、これが繰り返す
    run {
        val state = PlanetState.newPlanet(0L)
        val startRadius = state.radius(0L)

        state.advanceTo(tick - 1000L)
        println("2日目: 火山 ${state.countOf(BuildKind.VOLCANO)}個 (0のはず)")

        state.advanceTo(tick + 1000L)
        val v1 = state.placed.first { it.kind == BuildKind.VOLCANO }
        println("3日目: 火山 ${state.countOf(BuildKind.VOLCANO)}個 (1のはず) 角度=${v1.angleDeg}")

        state.advanceTo(tick * 2 - 1000L)
        println("6日目直前: 噴火予告 ${state.pendingEruptions.size}件 (0のはず)")

        state.advanceTo(tick * 2 + 1000L)
        val erupted1 = state.pendingEruptions.toList()
        state.pendingEruptions.clear()
        println("6日目: 噴火 ${erupted1.size}件 (1のはず) 角度一致=${erupted1.firstOrNull() == v1.angleDeg}")

        state.advanceTo(tick * 3 + 1000L)
        val r9 = state.radius(tick * 3 + 1000L)
        println("9日目: 半径 $r9 (${startRadius + PlanetState.RADIUS_PER_PERIOD} のはず) 火山 ${state.countOf(BuildKind.VOLCANO)}個 (惑星が育つと無くなるので0のはず)")

        state.advanceTo(tick * 4 + 1000L)
        println("12日目: 火山 ${state.countOf(BuildKind.VOLCANO)}個 (1のはず、2周目の出現)")

        state.advanceTo(tick * 5 + 1000L)
        val erupted2 = state.pendingEruptions.toList()
        state.pendingEruptions.clear()
        println("15日目: 噴火 ${erupted2.size}件 (1のはず、通算2件目)")

        state.advanceTo(tick * 6 + 1000L)
        val r18 = state.radius(tick * 6 + 1000L)
        println("18日目: 半径 $r18 (${startRadius + PlanetState.RADIUS_PER_PERIOD * 2} のはず) 火山 ${state.countOf(BuildKind.VOLCANO)}個 (また0のはず)")
    }

    // 2) 火山が出る場所に花があったときの扱い (動かす/合体させる)
    run {
        // まず花なしで、火山がどの角度に出るか観測する (アルゴリズムは決定的なので毎回同じ角度になる)
        val probe = PlanetState.newPlanet(0L)
        probe.advanceTo(tick + 1000L)
        val volcanoAngle = probe.placed.first { it.kind == BuildKind.VOLCANO }.angleDeg
        println("火山の出る角度: $volcanoAngle (これは家の位置だけで決まる)")

        // 2a) そこに花が1本だけ -> 惑星はまだ空いているので、別の場所へ動くはず
        run {
            val state = PlanetState.newPlanet(0L)
            state.placed.add(Placed(BuildKind.FLOWER, volcanoAngle, 0L, 1))
            state.advanceTo(tick + 1000L)
            val flower = state.placed.first { it.kind == BuildKind.FLOWER }
            val moved = kotlin.math.abs(shortestAngle(flower.angleDeg - volcanoAngle)) > 1f
            println("花1本 (空き地あり): 火山と重なった花が動いた=$moved (新しい角度=${flower.angleDeg}, target=${flower.target})")
        }

        // 2b) ふちを花で埋め尽くす -> 動かす空き地が無いので、他の花と合体して大きくなるはず
        run {
            val state = PlanetState.newPlanet(0L)
            for (i in 0 until 36) {
                val a = -90f + i * 10f
                if (kotlin.math.abs(shortestAngle(a - volcanoAngle)) < 1f) continue
                if (state.placed.any { kotlin.math.abs(shortestAngle(it.angleDeg - a)) < 1f }) continue
                state.placed.add(Placed(BuildKind.FLOWER, a, 0L, i % 4))
            }
            state.placed.add(Placed(BuildKind.FLOWER, volcanoAngle, 0L, 0))
            val before = state.countOf(BuildKind.FLOWER)
            state.advanceTo(tick + 1000L)
            val after = state.countOf(BuildKind.FLOWER)
            val merged = state.placed.any { it.kind == BuildKind.FLOWER && it.target == 1 }
            println("花で埋め尽くし (空き地なし): 花の数 $before -> $after (1減って合体するはず) 合体した花あり=$merged")
        }
    }

    // 3) 見た目: おとなしい火山・活発化した火山・合体した大きい花・ふつうの花を並べて確認
    run {
        val now = System.currentTimeMillis()
        val state = PlanetState.newPlanet(now - 10L * 24 * 3600 * 1000)
        state.placed.add(Placed(BuildKind.VOLCANO, 40f, now))
        state.placed.add(Placed(BuildKind.VOLCANO, 90f, now - PlanetState.VOLCANO_ACTIVE_AFTER - 1000L))
        state.placed.add(Placed(BuildKind.FLOWER, -40f, now, 1, 1))
        state.placed.add(Placed(BuildKind.FLOWER, -70f, now, 1, 0))
        val world = World(state)
        world.syncFromState(now)
        val viewBlocks = Scene.viewBlocksFor(state, now)
        val blockPx = Scene.blockPxFor(viewBlocks)
        val size = Scene.bufferSize(1080, 1080, viewBlocks, blockPx)
        val scene = Scene(size[0], size[1], blockPx)
        val sky = Sky(0.5f, now)
        scene.render(world, sky, 0f, 0f)
        writePng(scene.frame, File(outDir, "volcano_and_bigflower.png"))
        writePng(zoom(scene.frame, (viewBlocks - 4) * blockPx, 3), File(outDir, "volcano_and_bigflower_zoom.png"))
        println("見た目確認: おとなしい火山=40°, 活発化した火山=90°, 合体した大きい花=-40°, ふつうの花=-70°")
    }

    // 4) 噴火エフェクト (噴石・噴煙) が実際に出るか
    run {
        val now = System.currentTimeMillis()
        val state = PlanetState.newPlanet(now - 10L * 24 * 3600 * 1000)
        state.placed.add(Placed(BuildKind.VOLCANO, 0f, now - PlanetState.VOLCANO_ACTIVE_AFTER - 1000L))
        val world = World(state)
        world.syncFromState(now)
        world.eruptVolcano(0f)
        println("噴火直後の粒子数: ${world.particles.size} (噴石+噴煙で40個前後のはず)")
        val viewBlocks = Scene.viewBlocksFor(state, now)
        val blockPx = Scene.blockPxFor(viewBlocks)
        val size = Scene.bufferSize(1080, 1080, viewBlocks, blockPx)
        val scene = Scene(size[0], size[1], blockPx)
        val sky = Sky(0.5f, now)
        scene.render(world, sky, 0f, 1f / 30f)
        writePng(scene.frame, File(outDir, "volcano_eruption.png"))
        writePng(zoom(scene.frame, (viewBlocks - 4) * blockPx, 3), File(outDir, "volcano_eruption_zoom.png"))
    }

    // 5) 火山のドット絵そのものを拡大して確かめる (斜面の陰影・火口・溶岩の筋)
    run {
        val dormant = com.example.planetgrow.core.Art.volcanoDormant
        val active = com.example.planetgrow.core.Art.volcanoActive
        val gap = 8
        val buf = PixelBuffer(dormant.w + gap + active.w, maxOf(dormant.h, active.h))
        buf.draw(dormant, 0, 0)
        buf.draw(active, dormant.w + gap, 0)
        val factor = 8
        val big = PixelBuffer(buf.width * factor, buf.height * factor)
        for (y in 0 until big.height) for (x in 0 until big.width) {
            big.px[y * big.width + x] = buf.px[(y / factor) * buf.width + (x / factor)]
        }
        writePng(big, File(outDir, "volcano_sprite_big.png"))
    }

    println("-> ${outDir.absolutePath}")
}

/** 家畜・ペットが歩き回るか (巣から離れすぎないか) と、資源の飛来比率の確認用。 */
private fun renderMovementUpdate(outDir: File) {
    outDir.mkdirs()

    // 1) 家畜 (面) とペットが (ふち) が実際に動くか、巣から離れすぎないか
    run {
        val birth = 0L
        val state = PlanetState.newPlanet(birth)
        val faceSlot = state.freeFaceSlot(birth)!!
        state.placed.add(Placed(BuildKind.ANIMAL, faceSlot[1], birth, 0, -1, faceSlot[0]))
        val petAngle = state.freeAngleFor(BuildKind.PET)!!
        state.placed.add(Placed(BuildKind.PET, petAngle, birth))

        val world = World(state)
        world.syncFromState(birth)
        val livestock = world.animals.first { it.onFace }
        val pet = world.animals.first { !it.onFace }
        val homeX = livestock.dist * kotlin.math.cos(livestock.angle)
        val homeY = livestock.dist * kotlin.math.sin(livestock.angle)
        val homeAngle = pet.angle

        var faceMoved = false
        var rimMoved = false
        var maxFaceDrift = 0f
        var maxRimDrift = 0f
        val dt = 1f / 30f
        repeat(30 * 30) { // 30秒ぶん
            world.update(dt, 0.3f, -0.9f)
            val x = livestock.dist * kotlin.math.cos(livestock.angle)
            val y = livestock.dist * kotlin.math.sin(livestock.angle)
            val faceDrift = kotlin.math.hypot(x - homeX, y - homeY)
            if (faceDrift > 0.05f) faceMoved = true
            if (faceDrift > maxFaceDrift) maxFaceDrift = faceDrift
            val rimDrift = kotlin.math.abs(com.example.planetgrow.core.angleDiff(pet.angle, homeAngle))
            if (rimDrift > 0.02f) rimMoved = true
            if (rimDrift > maxRimDrift) maxRimDrift = rimDrift
        }
        println("家畜: 30秒で動いた=$faceMoved, 巣からの最大距離=$maxFaceDrift ブロック (2.0くらいまでのはず)")
        println("ペット: 30秒で動いた=$rimMoved, 巣からの最大角度=${Math.toDegrees(maxRimDrift.toDouble())}度 (20度くらいまでのはず)")

        // 見た目を確認 (別々の時刻で2枚)
        for ((label, elapsedSteps) in listOf("a" to 0, "b" to 300)) {
            if (elapsedSteps > 0) repeat(elapsedSteps) { world.update(dt, 0.3f, -0.9f) }
            world.syncFromState(birth)
            val viewBlocks = Scene.viewBlocksFor(state, birth)
            val blockPx = Scene.blockPxFor(viewBlocks)
            val size = Scene.bufferSize(1080, 1080, viewBlocks, blockPx)
            val scene = Scene(size[0], size[1], blockPx)
            val sky = Sky(0.5f, birth)
            scene.render(world, sky, 0f, dt)
            writePng(scene.frame, File(outDir, "movement_$label.png"))
            writePng(zoom(scene.frame, (viewBlocks - 4) * blockPx, 3), File(outDir, "movement_${label}_zoom.png"))
        }
    }

    // 1b) ペットを日向の角度に置いて、ふちに正しく立っているか (回転・向き) をはっきり確認する
    run {
        val now = System.currentTimeMillis()
        val state = PlanetState.newPlanet(now - 10L * 24 * 3600 * 1000)
        state.placed.add(Placed(BuildKind.PET, 0f, now, 1))
        val world = World(state)
        world.syncFromState(now)
        val viewBlocks = Scene.viewBlocksFor(state, now)
        val blockPx = Scene.blockPxFor(viewBlocks)
        val size = Scene.bufferSize(1080, 1080, viewBlocks, blockPx)
        val scene = Scene(size[0], size[1], blockPx)
        val sky = Sky(0.5f, now)
        scene.render(world, sky, 0f, 0f)
        writePng(scene.frame, File(outDir, "pet_lit.png"))
        writePng(zoom(scene.frame, (viewBlocks - 4) * blockPx, 3), File(outDir, "pet_lit_zoom.png"))
    }

    // 2) 鉱石の比率 (1000回サンプルして数える)
    run {
        val counts = linkedMapOf(
            com.example.planetgrow.core.SkyFallKind.METEOR to 0,
            com.example.planetgrow.core.SkyFallKind.COSMIC_DUST to 0,
            com.example.planetgrow.core.SkyFallKind.COMET_DUST to 0
        )
        for (slot in 0 until 1000) {
            val a = com.example.planetgrow.core.SkyFall.arrivalForSlot(slot.toLong(), 0L)
            counts[a.kind] = (counts[a.kind] ?: 0) + 1
        }
        println("飛来の内訳 (1000回): 隕石(鉱石)=${counts[com.example.planetgrow.core.SkyFallKind.METEOR]} " +
            "宇宙のチリ(たね)=${counts[com.example.planetgrow.core.SkyFallKind.COSMIC_DUST]} " +
            "彗星のチリ(氷)=${counts[com.example.planetgrow.core.SkyFallKind.COMET_DUST]} (鉱石は約20%のはず)")
    }

    println("-> ${outDir.absolutePath}")
}

/** UFOの家畜さらい・空腹での旅立ち・そのお知らせダイジェストの確認用。 */
private fun renderEventsUpdate(outDir: File) {
    outDir.mkdirs()

    // 1) 宇宙船が家畜をさらう時、AlienEvent.abductedAngleDeg が正しく埋まるか
    run {
        val birth = 0L
        val state = PlanetState.newPlanet(birth)
        repeat(5) { state.placed.add(Placed(BuildKind.ANIMAL, 0f, birth, 0, -1, it * 3.6f)) }
        var t = birth
        var checked = 0
        var confirmed = 0
        repeat(200) {
            t += PlanetState.ALIEN_INTERVAL_MILLIS
            state.advanceTo(t)
            for (e in state.pendingAlienEvents) {
                if (e.outcome == com.example.planetgrow.core.AlienOutcome.DAMAGE && e.abductedAnimal) {
                    checked++
                    if (e.abductedAngleDeg != null) confirmed++
                }
            }
            state.pendingAlienEvents.clear()
        }
        println("略奪イベント: $checked 回のうち $confirmed 回で角度が記録された (全部一致するはず)")
    }

    // 2) 空腹が FLEE_AFTER_MILLIS 続くごとに、家畜が1頭ずつ旅立つか
    run {
        val birth = 0L
        val state = PlanetState.newPlanet(birth)
        repeat(3) { state.placed.add(Placed(BuildKind.ANIMAL, 0f, birth, 0, -1, it * 3.6f)) }
        val hungryStart = birth + PlanetState.FEEDING_STARTS_AFTER

        state.advanceTo(hungryStart + 1000L)
        println("空腹開始直後: 家畜 ${state.countOf(BuildKind.ANIMAL)}頭 (3のはず) 旅立ち ${state.pendingFlees.size}件 (0のはず)")
        state.pendingFlees.clear()

        state.advanceTo(hungryStart + PlanetState.FLEE_AFTER_MILLIS + 1000L)
        val fled = state.pendingFlees.toList()
        state.pendingFlees.clear()
        println("空腹${PlanetState.FLEE_AFTER_MILLIS / 3600000}時間後: 家畜 ${state.countOf(BuildKind.ANIMAL)}頭 (2のはず) " +
            "旅立ち ${fled.size}件 (1のはず) 角度=${fled.firstOrNull()?.angleDeg} dist=${fled.firstOrNull()?.dist}")

        state.advanceTo(hungryStart + PlanetState.FLEE_AFTER_MILLIS * 3 + 1000L)
        println("さらに2周期分あと: 家畜 ${state.countOf(BuildKind.ANIMAL)}頭 (0のはず、残り全頭が旅立った)")
    }

    // 3) 見た目: UFOのさらい演出 (飛来→光線→飛び去る)
    run {
        val now = System.currentTimeMillis()
        val state = PlanetState.newPlanet(now - 10L * 24 * 3600 * 1000)
        state.placed.add(Placed(BuildKind.ANIMAL, 0f, now, 0, -1, 0f))
        val world = World(state)
        world.syncFromState(now)
        world.startAbduction(0f)
        val viewBlocks = Scene.viewBlocksFor(state, now)
        val blockPx = Scene.blockPxFor(viewBlocks)
        val size = Scene.bufferSize(1080, 1080, viewBlocks, blockPx)
        val sky = Sky(0.5f, now)
        val dt = 1f / 30f
        var frameNo = 0
        for ((label, atFrame) in listOf("flyin" to 20, "beam" to 60, "flyout" to 130)) {
            repeat(atFrame - frameNo) { world.update(dt, sky.sunDirX, sky.sunDirY) }
            frameNo = atFrame
            val scene = Scene(size[0], size[1], blockPx)
            scene.render(world, sky, frameNo * dt, dt)
            writePng(scene.frame, File(outDir, "abduction_$label.png"))
            writePng(zoom(scene.frame, (viewBlocks - 4) * blockPx, 3), File(outDir, "abduction_${label}_zoom.png"))
        }
    }

    // 4) 見た目: 空腹での旅立ち (惑星から漂い出て、しだいに消える)
    run {
        val now = System.currentTimeMillis()
        val state = PlanetState.newPlanet(now - 10L * 24 * 3600 * 1000)
        val world = World(state)
        world.syncFromState(now)
        world.startFleeing(0f, 3.6f, 2)
        val viewBlocks = Scene.viewBlocksFor(state, now)
        val blockPx = Scene.blockPxFor(viewBlocks)
        val size = Scene.bufferSize(1080, 1080, viewBlocks, blockPx)
        val sky = Sky(0.5f, now)
        val dt = 1f / 30f
        var frameNo = 0
        for ((label, atFrame) in listOf("start" to 5, "mid" to 60, "end" to 150)) {
            repeat(atFrame - frameNo) { world.update(dt, sky.sunDirX, sky.sunDirY) }
            frameNo = atFrame
            val scene = Scene(size[0], size[1], blockPx)
            scene.render(world, sky, frameNo * dt, dt)
            writePng(scene.frame, File(outDir, "fleeing_$label.png"))
            writePng(zoom(scene.frame, (viewBlocks - 4) * blockPx, 3), File(outDir, "fleeing_${label}_zoom.png"))
        }
    }

    println("-> ${outDir.absolutePath}")
}

/** 花畑・荒れ地・宇宙船襲来の当たり方を確かめる (仕様変更の確認用)。 */
private fun renderAlienFeatures(outDir: File) {
    outDir.mkdirs()

    // 1) 花の茂み (大きさ・色のバリエーション)
    run {
        val clusters = com.example.planetgrow.core.Art.flowerClusters
        val totalW = clusters.sumOf { it.w + 4 }
        val h = clusters.maxOf { it.h }
        val buf = PixelBuffer(totalW, h)
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
