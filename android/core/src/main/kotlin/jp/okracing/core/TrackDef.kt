package jp.okracing.core

/** サーキット定義 (Web 版 src/tracks.js と同じ内容を assets/tracks.json から読む) */
class Section(val name: String, val from: Double, val to: Double, val no: Int)
class TrainSec(val id: String, val name: String, val short: String, val n0: Double, val n1: Double)
class Aero(val cl: Double, val cd: Double, val final: Double, val spread: Double)

class TrackDef(val raw: Map<String, Any?>) {
    val id = raw.s("id"); val name = raw.s("name"); val short = raw.s("short"); val country = raw.s("country")
    val length = raw.d("length")
    val points: List<DoubleArray> = raw.a("points")!!.map { p -> p.arr().map { it.num() }.toDoubleArray() }
    val raceline: DoubleArray? = raw.a("raceline")?.map { it.num() }?.toDoubleArray()
    val smooth = raw.b("smooth")
    val widthMin = raw.o("width")!!.d("min"); val widthMax = raw.o("width")!!.d("max"); val widthScale = raw.o("width")!!.d("scale", 1.0)
    val elevRange: Double? = (raw.o("elevation")!!["range"] as? Number)?.toDouble()
    val elevKeys: List<DoubleArray> = raw.o("elevation")!!.a("keys")!!.map { p -> p.arr().map { it.num() }.toDoubleArray() }
    val bankDeg: Double? = raw.o("banking")?.d("deg"); val bankRadius = raw.o("banking")?.d("radius") ?: 0.0
    val aero: Aero? = raw.o("aero")?.let { Aero(it.d("cl"), it.d("cd"), it.d("final"), it.d("spread")) }
    val runoffL: Double? = raw.o("runoff")?.d("l"); val runoffR: Double? = raw.o("runoff")?.d("r")
    val aiGrip = raw.d("aiGrip", 1.0)
    val sections = raw.a("sections")!!.map { val m = it.obj(); Section(m.s("name"), m.d("from"), m.d("to"), m.i("no")) }
    val sectorSplits = raw.a("sectorSplits")!!.map { it.num() }
    val pit = raw.o("pit")!!
    val standWall = raw.a("standWall")!!.map { it.num() }
    val stands: List<List<Any?>> = raw.a("stands")!!.map { it.arr() }
    val park = raw.o("park")
    val boards: List<DoubleArray> = raw.a("boards")!!.map { p -> p.arr().map { it.num() }.toDoubleArray() }
    val train = raw.a("train")!!.map { val m = it.obj(); TrainSec(m.s("id"), m.s("name"), m.s("short"), m.d("n0", -1.0), m.d("n1", -1.0)) }
    val fullLaps = raw.i("fullLaps"); val baseLap = raw.d("baseLap")
    val bumps: List<DoubleArray>? = raw.a("bumps")?.map { p -> p.arr().map { it.num() }.toDoubleArray() }

    companion object {
        fun parseAll(json: String): List<TrackDef> = Json.parse(json).arr().map { TrackDef(it.obj()) }
    }
}

/** 版ごとの設定 (variant.json) */
class Variant(val raw: Map<String, Any?>) {
    val id = raw.s("id"); val tag = raw.s("tag"); val storageKey = raw.s("storageKey"); val credits = raw.s("credits")
    val teams: Map<String, Map<String, Any?>> = (raw.o("teams") ?: emptyMap()).mapValues { it.value.obj() }
}
