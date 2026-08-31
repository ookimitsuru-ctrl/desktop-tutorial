package com.bujo.app.data.model

/**
 * ラピッドログの3つの基本要素。
 * バレットジャーナルでは「箇条書き（バレット）」の形で
 * タスク・イベント・メモを短文で書き留める。
 */
enum class EntryType(val label: String) {
    /** タスク（やること） */
    TASK("タスク"),

    /** イベント（できごと・予定） */
    EVENT("イベント"),

    /** メモ（覚えておきたい情報） */
    NOTE("メモ")
}

/**
 * タスクの状態。バレット記号そのものを状態として持つ。
 *  ・ 未完了、 x 完了、 > 移動（翌日・別コレクションへ）、
 *  < 未来ログへ予定、 ~ 取り消し
 */
enum class TaskState(val label: String) {
    OPEN("未完了"),
    DONE("完了"),
    MIGRATED("移動済み"),
    SCHEDULED("未来ログへ"),
    CANCELLED("取り消し")
}

/** signifier（サインファイア）: バレットの左に添える補助記号 */
enum class Signifier(val label: String, val glyph: String) {
    NONE("なし", ""),
    PRIORITY("優先 *", "*"),
    INSPIRATION("ひらめき !", "!"),
    EXPLORE("要調査 ?", "?")
}

/** どのログに属するエントリーか */
enum class LogType(val label: String) {
    DAILY("デイリーログ"),
    MONTHLY("マンスリーログ"),
    FUTURE("フューチャーログ"),
    COLLECTION("コレクション")
}

/**
 * バレット記号（紙のジャーナルと同じ記号体系）。
 * 表示層から切り離してあるので、UI なしでも単体テストできる。
 */
fun bulletGlyph(type: EntryType, state: TaskState = TaskState.OPEN): String = when (type) {
    EntryType.EVENT -> "○"
    EntryType.NOTE -> "—"
    EntryType.TASK -> when (state) {
        TaskState.OPEN -> "•"
        TaskState.DONE -> "✕"
        TaskState.MIGRATED -> "＞"
        TaskState.SCHEDULED -> "＜"
        TaskState.CANCELLED -> "〜"
    }
}
