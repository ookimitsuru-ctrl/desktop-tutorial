package com.example.mojiokoshi.ocr

/**
 * OCR結果の整形処理。Android API に依存しないため単体テストで検証できる。
 */
object TextFormatter {

    /**
     * 1つの段落内で折り返された行を1行にまとめる。
     * 日本語どうしはそのまま連結し、英数字どうしの間にだけ空白を入れる。
     */
    fun joinLines(lines: List<String>): String {
        val builder = StringBuilder()
        for (line in lines) {
            val trimmed = line.trim()
            if (trimmed.isEmpty()) continue
            if (builder.isNotEmpty() && needsSpace(builder.last(), trimmed.first())) {
                builder.append(' ')
            }
            builder.append(trimmed)
        }
        return builder.toString()
    }

    /** 改行を除いた文字数（サロゲートペアは1文字として数える）。 */
    fun countCharacters(text: String): Int =
        text.codePoints().filter { it != '\n'.code && it != '\r'.code }.count().toInt()

    private fun needsSpace(previous: Char, next: Char): Boolean =
        previous != '-' && previous.isAsciiVisible() && next.isAsciiVisible()

    private fun Char.isAsciiVisible(): Boolean = code in 0x21..0x7E
}
