package jp.okracing.core

import java.io.File
import kotlin.math.abs

fun loadDefs(variant: String): List<TrackDef> = TrackDef.parseAll(File("app/src/$variant/assets/tracks.json").readText())

fun main(args: Array<String>) {
    val mode = args.getOrElse(0) { "track" }
    if (mode == "lap") for (v in listOf("main", "original")) for (def in loadDefs(v)) {
        val T = Track(def); val line = computeRacingLine(T)
        val car = Car(setupId = "mid", tyreId = "soft", trim = def.aero); car.fuel = 12.0; fitTyres(car, "soft")
        val drv = Driver(car, T, line, skill = 1.0); drv.errT = 1e9
        placeCar(car, T, T.length - 300, line.off[T.idx(T.length - 300)].toDouble(), 50.0)
        val env = Env(T, noFuel = true); var t = 0.0; var prev = car.s; var st = -1.0; var best = 1e9; var n = 0; var off = 0
        while (n < 2 && t < 400) {
            drv.update(1.0 / 60, 0.0, null, null)
            for (k in 0 until 4) { stepCar(car, 1.0 / 240, env); t += 1.0 / 240; if (prev > T.length - 50 && car.s < 50) { if (st >= 0) { best = minOf(best, t - st); n++ }; st = t }; prev = car.s }
            if (car.offCount >= 3) off++
        }
        println("${def.id} lap=${"%.2f".format(best)} off=$off base=${def.baseLap}")
    }
    if (mode == "test") {
        var fail = 0
        fun check(name: String, ok: Boolean, info: String = "") { println("${if (ok) "PASS" else "FAIL"}  $name  $info"); if (!ok) fail++ }
        for (v in listOf("main", "original")) for (def in loadDefs(v)) {
            val T = Track(def); val line = computeRacingLine(T); val nm = def.name
            // 決勝 3 周 (20台)
            val g = DRIVERS.indices.toMutableList(); g.removeAt(0); g.add(9, 0)
            val S2 = Session(T, line, SessionOpts(mode = "race", laps = 3, weather = "dry", setup = "mid", tyre = "soft", difficulty = "normal", damage = true, grid = g))
            val p2 = S2.player; val d2 = Driver(p2.car, T, line, skill = 0.9)
            while (!S2.resultsReady && S2.time < 600) {
                if (S2.state == "green" && p2.pit == null && !p2.finished) { d2.update(1.0 / 60, S2.wet, S2.cars, DriveInfo()); S2.playerInput.throttle = p2.car.throttle; S2.playerInput.brake = p2.car.brake }
                else { S2.playerInput.throttle = 0.0; S2.playerInput.brake = 1.0 }
                S2.tick(1.0 / 60); S2.events.clear()
            }
            val dnf = S2.results.count { it.dnf }
            check("$nm: 決勝が完走して結果が出る", S2.resultsReady && S2.results.size == 20 && dnf <= 4, "リタイア ${dnf}台 time=${"%.1f".format(S2.time)} P${p2.pos}")
            // ピット
            val S3 = Session(T, line, SessionOpts(mode = "free", weather = "dry", setup = "mid", tyre = "soft", damage = false))
            val p3 = S3.player; val d3 = Driver(p3.car, T, line, skill = 0.8); p3.pitRequest = true; p3.nextTyre = "hard"; var pitted = false; var exited = false
            while (S3.time < 300 && !exited) {
                if (S3.state == "green" && p3.pit == null) { val toPit = T.sDiff(T.pit.sEntry, p3.car.s); d3.update(1.0 / 60, 0.0, S3.cars, if (toPit > 0 && toPit < 260) DriveInfo(keepRight = true, vmax = 70.0) else DriveInfo()); S3.playerInput.throttle = p3.car.throttle; S3.playerInput.brake = p3.car.brake }
                S3.tick(1.0 / 60); if (p3.pit != null) pitted = true else if (pitted) exited = true; S3.events.clear()
            }
            check("$nm: ピットイン→タイヤ交換→コースへ戻る", pitted && exited && p3.car.tyre.id == "hard" && p3.car.offCount < 3)
            // トレーニング
            val rf = buildReference(T, line, "mid", "soft", 0.0)
            val S4 = Session(T, line, SessionOpts(mode = "train", weather = "dry", setup = "mid", tyre = "soft", damage = false, reference = rf, trainSection = 1))
            check("$nm: お手本ラップと練習区間", abs(rf.lapTime - def.baseLap) < 4 && S4.trainer!!.prepared.size == def.train.size, "%.2fs".format(rf.lapTime))
        }
        println(if (fail > 0) "$fail 件失敗" else "すべて成功")
    }
    if (mode == "track") for (v in listOf("main", "original")) for (def in loadDefs(v)) {
        val T = Track(def)
        var wsum = 0.0; var ksum = 0.0; var bsum = 0.0; for (i in 0 until T.N) { wsum += T.wallL[i] + T.wallR[i]; ksum += T.kerbL[i] + T.kerbR[i]; bsum += T.bumpy[i] }
        println("${def.id} N=${T.N} x100=${"%.3f".format(T.x[100])} y500=${"%.3f".format(T.y[500])} curv300=${"%.6f".format(T.curv[300])} z=${"%.2f".format(T.z[T.N / 2])} walls=${"%.1f".format(wsum)} kerbs=${"%.1f".format(ksum)} bump=${"%.1f".format(bsum)} cross=${T.cross?.lo},${T.cross?.hi}")
    }
}
