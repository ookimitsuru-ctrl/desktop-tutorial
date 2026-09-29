package com.example.mojiokoshi.ocr

import com.google.mlkit.vision.text.Text

/**
 * 読み取ったテキスト。
 *
 * @property raw ML Kit が認識したとおりの改行を保ったテキスト
 * @property joined 段落（ブロック）ごとに行を結合したテキスト
 */
data class RecognizedText(
    val raw: String,
    val joined: String,
) {
    val isEmpty: Boolean get() = raw.isBlank()

    companion object {
        fun from(text: Text): RecognizedText = RecognizedText(
            raw = text.textBlocks.joinToString("\n") { it.text },
            joined = text.textBlocks.joinToString("\n") { block ->
                TextFormatter.joinLines(block.lines.map { it.text })
            },
        )
    }
}
