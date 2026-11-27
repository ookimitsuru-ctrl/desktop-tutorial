package jp.okracing.core

/** 小さな JSON パーサ / 書き出し (コース定義の読み込みと、記録・設定の保存に使う)。
 *  値は Map<String, Any?> / List<Any?> / Double / String / Boolean / null で表す。 */
object Json {
    fun parse(s: String): Any? { val p = P(s); p.ws(); val v = p.value(); return v }

    private class P(val s: String) {
        var i = 0
        fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
        fun value(): Any? {
            ws()
            return when (val c = s[i]) {
                '{' -> obj(); '[' -> arr(); '"' -> str()
                't' -> { i += 4; true }; 'f' -> { i += 5; false }; 'n' -> { i += 4; null }
                else -> if (c == '-' || c.isDigit()) num() else error("JSON: unexpected '$c' at $i")
            }
        }
        fun obj(): Map<String, Any?> {
            val m = LinkedHashMap<String, Any?>(); i++; ws()
            if (s[i] == '}') { i++; return m }
            while (true) { ws(); val k = str(); ws(); i++ /* : */; m[k] = value(); ws(); if (s[i] == ',') { i++; continue }; i++; return m }
        }
        fun arr(): List<Any?> {
            val a = ArrayList<Any?>(); i++; ws()
            if (s[i] == ']') { i++; return a }
            while (true) { a.add(value()); ws(); if (s[i] == ',') { i++; continue }; i++; return a }
        }
        fun str(): String {
            val b = StringBuilder(); i++
            while (true) {
                val c = s[i++]
                if (c == '"') return b.toString()
                if (c == '\\') {
                    when (val e = s[i++]) {
                        'n' -> b.append('\n'); 't' -> b.append('\t'); 'r' -> b.append('\r'); 'b' -> b.append('\b'); 'f' -> b.append('\u000c')
                        'u' -> { b.append(s.substring(i, i + 4).toInt(16).toChar()); i += 4 }
                        else -> b.append(e)
                    }
                } else b.append(c)
            }
        }
        fun num(): Double {
            val st = i
            while (i < s.length && (s[i].isDigit() || s[i] in "+-.eE")) i++
            return s.substring(st, i).toDouble()
        }
    }

    fun write(v: Any?): String { val b = StringBuilder(); w(b, v); return b.toString() }
    private fun w(b: StringBuilder, v: Any?) {
        when (v) {
            null -> b.append("null")
            is Boolean -> b.append(v)
            is Number -> { val d = v.toDouble(); if (d.isNaN() || d.isInfinite()) b.append("null") else if (d == Math.rint(d) && Math.abs(d) < 1e15) b.append(d.toLong()) else b.append(d) }
            is String -> { b.append('"'); for (c in v) when (c) { '"' -> b.append("\\\""); '\\' -> b.append("\\\\"); '\n' -> b.append("\\n"); '\r' -> b.append("\\r"); '\t' -> b.append("\\t"); else -> if (c < ' ') b.append(String.format("\\u%04x", c.code)) else b.append(c) }; b.append('"') }
            is Map<*, *> -> { b.append('{'); var f = true; for ((k, x) in v) { if (!f) b.append(','); f = false; w(b, k.toString()); b.append(':'); w(b, x) }; b.append('}') }
            is Iterable<*> -> { b.append('['); var f = true; for (x in v) { if (!f) b.append(','); f = false; w(b, x) }; b.append(']') }
            is DoubleArray -> w(b, v.toList()); is FloatArray -> w(b, v.toList()); is IntArray -> w(b, v.toList())
            else -> w(b, v.toString())
        }
    }
}

// JSON 値の取り出しを短く書くための拡張
@Suppress("UNCHECKED_CAST") fun Any?.obj(): Map<String, Any?> = this as Map<String, Any?>
@Suppress("UNCHECKED_CAST") fun Any?.arr(): List<Any?> = this as List<Any?>
fun Any?.num(): Double = (this as Number).toDouble()
fun Map<String, Any?>.d(k: String, def: Double = 0.0): Double = (this[k] as? Number)?.toDouble() ?: def
fun Map<String, Any?>.i(k: String, def: Int = 0): Int = (this[k] as? Number)?.toInt() ?: def
fun Map<String, Any?>.s(k: String, def: String = ""): String = this[k] as? String ?: def
fun Map<String, Any?>.b(k: String, def: Boolean = false): Boolean = this[k] as? Boolean ?: def
fun Map<String, Any?>.o(k: String): Map<String, Any?>? = this[k] as? Map<String, Any?>
fun Map<String, Any?>.a(k: String): List<Any?>? = this[k] as? List<Any?>
