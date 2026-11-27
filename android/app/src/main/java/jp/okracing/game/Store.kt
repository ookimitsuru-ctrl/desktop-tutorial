package jp.okracing.game

import android.content.Context
import jp.okracing.core.*
import kotlin.math.*

// 設定・記録・ゴーストの保存 (Web 版 src/storage.js の移植。localStorage の代わりに SharedPreferences に JSON で保存)

class Settings(
    var pedalAccelRight: Boolean = true,   // true: 右=アクセル 左=ブレーキ (標準)
    var pedalRelease: String = "zero",     // zero: 指を離すと0 / hold: 保持
    var autoShift: Boolean = false,
    var assist: Boolean = false,           // TC + ABS
    var camera: String = "up",             // up / right / north
    var zoom: String = "normal",
    var lineAssist: Boolean = true,
    var ghost: Boolean = true,
    var damage: Boolean = true,
    var difficulty: String = "normal",
    var volume: Double = 0.8,
    var quality: String = "auto",          // auto / high / low
    var showBoard: Boolean = true,
    var trainAuto: Boolean = true,
    var trainGuide: Boolean = true,
) {
    fun toMap(): Map<String, Any?> = linkedMapOf("pedalAccelRight" to pedalAccelRight, "pedalRelease" to pedalRelease, "autoShift" to autoShift, "assist" to assist, "camera" to camera, "zoom" to zoom,
        "lineAssist" to lineAssist, "ghost" to ghost, "damage" to damage, "difficulty" to difficulty, "volume" to volume, "quality" to quality, "showBoard" to showBoard, "trainAuto" to trainAuto, "trainGuide" to trainGuide)
    fun set(k: String, v: Any?) {
        when (k) {
            "pedalAccelRight" -> pedalAccelRight = v as Boolean; "pedalRelease" -> pedalRelease = v as String; "autoShift" -> autoShift = v as Boolean
            "assist" -> assist = v as Boolean; "camera" -> camera = v as String; "zoom" -> zoom = v as String; "lineAssist" -> lineAssist = v as Boolean
            "ghost" -> ghost = v as Boolean; "damage" -> damage = v as Boolean; "difficulty" -> difficulty = v as String; "volume" -> volume = (v as Number).toDouble()
            "quality" -> quality = v as String; "showBoard" -> showBoard = v as Boolean; "trainAuto" -> trainAuto = v as Boolean; "trainGuide" -> trainGuide = v as Boolean
        }
    }
    fun get(k: String): Any? = toMap()[k]
    companion object { fun from(m: Map<String, Any?>?): Settings { val s = Settings(); m?.forEach { (k, v) -> try { s.set(k, v) } catch (e: Exception) { } }; return s } }
}

class Last(var track: String, var setup: String = "mid", var tyre: String = "soft", var weather: String = "dry", var laps: Int = 5, var gridMode: String = "quali", var trainSec: Int = 1) {
    fun toMap(): Map<String, Any?> = linkedMapOf("track" to track, "setup" to setup, "tyre" to tyre, "weather" to weather, "laps" to laps, "gridMode" to gridMode, "trainSec" to trainSec)
    fun set(k: String, v: Any?) {
        when (k) { "track" -> track = v as String; "setup" -> setup = v as String; "tyre" -> tyre = v as String; "weather" -> weather = v as String
            "laps" -> laps = (v as Number).toInt(); "gridMode" -> gridMode = v as String; "trainSec" -> trainSec = (v as Number).toInt() }
    }
    fun get(k: String): Any? = toMap()[k]
}

class LapRecord(val time: Double, val tyre: String, val setup: String, val wet: Boolean, val mode: String, val date: String) {
    fun toMap() = linkedMapOf<String, Any?>("time" to time, "tyre" to tyre, "setup" to setup, "wet" to wet, "mode" to mode, "date" to date)
    companion object { fun from(m: Map<String, Any?>) = LapRecord(m.d("time"), m.s("tyre"), m.s("setup"), m.b("wet"), m.s("mode"), m.s("date")) }
}
class RaceRecord(val date: String, val laps: Int, val weather: String, val grid: Int, val pos: Int, val dnf: Boolean, val best: Double?) {
    fun toMap() = linkedMapOf<String, Any?>("date" to date, "laps" to laps, "weather" to weather, "grid" to grid, "pos" to pos, "dnf" to dnf, "best" to best)
    companion object { fun from(m: Map<String, Any?>) = RaceRecord(m.s("date"), m.i("laps"), m.s("weather"), m.i("grid"), m.i("pos"), m.b("dnf"), (m["best"] as? Number)?.toDouble()) }
}
class QualiRecord(val grid: List<Int>, val pos: Int, val time: Double?)
class TrainBest(val score: Int, val stars: Int, val delta: Double)

class Store(ctx: Context, private val storageKey: String, private val firstTrack: String) {
    private val prefs = ctx.getSharedPreferences(storageKey, Context.MODE_PRIVATE)
    @Suppress("UNCHECKED_CAST")
    private val db: MutableMap<String, Any?> = try { (Json.parse(prefs.getString("db", "{}") ?: "{}") as Map<String, Any?>).toMutableMap() } catch (e: Exception) { LinkedHashMap() }
    var currentTrack = firstTrack
    /** 記録はサーキットごとに分ける (最初のサーキットは従来のキーのまま) */
    private fun K(name: String) = name + (if (currentTrack == firstTrack) "" else "_$currentTrack")
    private fun save() { prefs.edit().putString("db", Json.write(db)).apply() }

    fun settings(): Settings = Settings.from(db["settings"] as? Map<String, Any?>)
    fun saveSettings(s: Settings) { db["settings"] = s.toMap(); save() }
    fun last(): Last { val l = Last(firstTrack); (db["last"] as? Map<*, *>)?.forEach { (k, v) -> try { l.set(k as String, v) } catch (e: Exception) { } }; return l }
    fun saveLast(l: Last) { db["last"] = l.toMap(); save() }

    @Suppress("UNCHECKED_CAST")
    private fun recs(): MutableMap<String, Any?> {
        val k = K("records")
        val r: MutableMap<String, Any?> = (db[k] as? Map<String, Any?>)?.toMutableMap() ?: linkedMapOf<String, Any?>("laps" to listOf<Any?>(), "best" to mapOf<String, Any?>(), "sectors" to mapOf<String, Any?>(), "races" to listOf<Any?>())
        db[k] = r; return r
    }
    fun lapRecords(): List<LapRecord> = (recs()["laps"] as? List<*>)?.map { LapRecord.from(it.obj()) } ?: emptyList()
    fun raceRecords(): List<RaceRecord> = (recs()["races"] as? List<*>)?.map { RaceRecord.from(it.obj()) } ?: emptyList()
    fun bestLap(wet: Boolean): LapRecord? = ((recs()["best"] as? Map<*, *>)?.get(if (wet) "wet" else "dry") as? Map<String, Any?>)?.let { LapRecord.from(it) }
    fun sectors(wet: Boolean): List<Double?> = ((recs()["sectors"] as? Map<*, *>)?.get(if (wet) "wet" else "dry") as? List<*>)?.map { (it as? Number)?.toDouble() } ?: listOf(null, null, null)
    /** ラップ記録を追加。新記録なら true */
    fun addLap(rec: LapRecord): Boolean {
        val R = recs(); val cls = if (rec.wet) "wet" else "dry"
        val laps = (lapRecords() + rec).sortedBy { it.time }.take(30)
        R["laps"] = laps.map { it.toMap() }
        val best = ((R["best"] as? Map<*, *>)?.toMutableMap() ?: mutableMapOf()) as MutableMap<Any?, Any?>
        var isBest = false
        val cur = bestLap(rec.wet)
        if (cur == null || rec.time < cur.time) { best[cls] = rec.toMap(); isBest = true }
        R["best"] = best
        save(); return isBest
    }
    fun addSector(k: Int, time: Double, wet: Boolean): Boolean {
        val R = recs(); val cls = if (wet) "wet" else "dry"
        val sec = ((R["sectors"] as? Map<*, *>)?.toMutableMap() ?: mutableMapOf()) as MutableMap<Any?, Any?>
        val arr = sectors(wet).toMutableList()
        if (arr[k] == null || time < arr[k]!!) { arr[k] = time; sec[cls] = arr; R["sectors"] = sec; save(); return true }
        return false
    }
    fun addRace(r: RaceRecord) { val R = recs(); R["races"] = (listOf(r) + raceRecords()).take(12).map { it.toMap() }; save() }
    fun quali(): QualiRecord? = (db[K("quali")] as? Map<String, Any?>)?.let { m -> QualiRecord(m.a("grid")!!.map { it.num().toInt() }, m.i("pos"), (m["time"] as? Number)?.toDouble()) }
    fun saveQuali(q: QualiRecord) { db[K("quali")] = linkedMapOf("grid" to q.grid, "pos" to q.pos, "time" to q.time); save() }
    fun trainBest(): Map<String, TrainBest> = ((db[K("trainBest")] as? Map<String, Any?>) ?: emptyMap()).mapValues { val m = it.value.obj(); TrainBest(m.i("score"), m.i("stars"), m.d("delta")) }
    fun addTrainBest(id: String, r: TrainReport): Boolean {
        val B = ((db[K("trainBest")] as? Map<String, Any?>)?.toMutableMap() ?: mutableMapOf())
        val cur = trainBest()[id]
        if (cur == null || r.score > cur.score) { B[id] = linkedMapOf("score" to r.score, "stars" to r.stars, "delta" to r.delta); db[K("trainBest")] = B; save(); return true }
        return false
    }
    fun clearRecords() { db.remove(K("records")); db.remove(K("quali")); db.remove(K("trainBest")); prefs.edit().remove(K("ghost.dry")).remove(K("ghost.wet")).apply(); save() }

    // ---- ゴースト ----
    fun saveGhost(g: Ghost, wet: Boolean) { prefs.edit().putString(K(if (wet) "ghost.wet" else "ghost.dry"), Json.write(g.toJson())).apply() }
    @Suppress("UNCHECKED_CAST")
    fun loadGhost(wet: Boolean): Ghost? = try { prefs.getString(K(if (wet) "ghost.wet" else "ghost.dry"), null)?.let { Ghost.fromJson(Json.parse(it) as Map<String, Any?>) } } catch (e: Exception) { null }
}
