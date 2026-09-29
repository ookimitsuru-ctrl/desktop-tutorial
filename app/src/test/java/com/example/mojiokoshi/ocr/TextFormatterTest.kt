package com.example.mojiokoshi.ocr

import org.junit.Assert.assertEquals
import org.junit.Test

class TextFormatterTest {

    @Test
    fun joinLines_japaneseLinesAreConcatenatedWithoutSpace() {
        assertEquals(
            "吾輩は猫である。名前はまだ無い。",
            TextFormatter.joinLines(listOf("吾輩は猫である。名前は", "まだ無い。")),
        )
    }

    @Test
    fun joinLines_asciiWordsAreSeparatedBySpace() {
        assertEquals(
            "The quick brown fox jumps over",
            TextFormatter.joinLines(listOf("The quick brown", "fox jumps over")),
        )
    }

    @Test
    fun joinLines_mixedScriptsAreConcatenatedWithoutSpace() {
        assertEquals("価格は100円です", TextFormatter.joinLines(listOf("価格は", "100円です")))
        assertEquals("Android版アプリ", TextFormatter.joinLines(listOf("Android", "版アプリ")))
    }

    @Test
    fun joinLines_trailingHyphenIsKeptWithoutSpace() {
        assertEquals("well-known", TextFormatter.joinLines(listOf("well-", "known")))
    }

    @Test
    fun joinLines_blankLinesAndSurroundingSpacesAreIgnored() {
        assertEquals("ab c", TextFormatter.joinLines(listOf("  ab ", "", "   ", " c")))
        assertEquals("", TextFormatter.joinLines(emptyList()))
    }

    @Test
    fun countCharacters_ignoresLineBreaksAndCountsSurrogatePairsOnce() {
        assertEquals(5, TextFormatter.countCharacters("あいう\nえお"))
        assertEquals(2, TextFormatter.countCharacters("𠮷野\r\n"))
    }
}
