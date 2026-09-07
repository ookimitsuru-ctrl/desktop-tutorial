package com.bujo.app.ui.input

/**
 * 物理キーボード（Unihertz Titan など）で使える操作。
 * キーとの対応表は純粋関数なので単体テストできる。
 */
enum class ShortcutAction {
    /** 新しいバレットを書く */
    NEW_ENTRY,

    /** 検索を開く */
    OPEN_SEARCH,

    /** 移動（マイグレーション）を開く */
    OPEN_MIGRATION,

    /** 今日へ戻る */
    GO_TODAY,

    PREVIOUS_DAY,
    NEXT_DAY,

    /** 一覧の選択を上下に動かす */
    SELECT_PREVIOUS,
    SELECT_NEXT,

    /** 選択中のタスクの完了を切り替える */
    TOGGLE_SELECTED,

    /** 選択中のバレットの操作メニューを開く */
    OPEN_ACTIONS,

    /** 選択を外す / 閉じる */
    DISMISS,

    /** 保存（Ctrl+Enter） */
    SUBMIT,

    TAB_DAILY,
    TAB_MONTHLY,
    TAB_FUTURE,
    TAB_COLLECTIONS,
    TAB_INDEX
}

/** 対応表で扱うキー。Compose の Key からここへ変換してから引く */
enum class ShortcutKey {
    N, E, M, T, J, K, H, L, SLASH,
    SPACE, ENTER, ESCAPE,
    UP, DOWN, LEFT, RIGHT,
    D1, D2, D3, D4, D5
}

/**
 * キーの押下を操作に変換する。対応するものがなければ null。
 *
 * 単独キーは Titan のように常時キーボードがある端末で片手でも押せるものを選び、
 * 保存だけは誤爆を避けるため Ctrl+Enter にしている。
 */
fun actionFor(key: ShortcutKey, ctrlPressed: Boolean = false): ShortcutAction? {
    if (ctrlPressed) {
        return when (key) {
            ShortcutKey.ENTER -> ShortcutAction.SUBMIT
            else -> null
        }
    }
    return when (key) {
        ShortcutKey.N -> ShortcutAction.NEW_ENTRY
        ShortcutKey.SLASH -> ShortcutAction.OPEN_SEARCH
        ShortcutKey.M -> ShortcutAction.OPEN_MIGRATION
        ShortcutKey.T -> ShortcutAction.GO_TODAY
        ShortcutKey.H, ShortcutKey.LEFT -> ShortcutAction.PREVIOUS_DAY
        ShortcutKey.L, ShortcutKey.RIGHT -> ShortcutAction.NEXT_DAY
        ShortcutKey.K, ShortcutKey.UP -> ShortcutAction.SELECT_PREVIOUS
        ShortcutKey.J, ShortcutKey.DOWN -> ShortcutAction.SELECT_NEXT
        ShortcutKey.SPACE -> ShortcutAction.TOGGLE_SELECTED
        ShortcutKey.ENTER, ShortcutKey.E -> ShortcutAction.OPEN_ACTIONS
        ShortcutKey.ESCAPE -> ShortcutAction.DISMISS
        ShortcutKey.D1 -> ShortcutAction.TAB_DAILY
        ShortcutKey.D2 -> ShortcutAction.TAB_MONTHLY
        ShortcutKey.D3 -> ShortcutAction.TAB_FUTURE
        ShortcutKey.D4 -> ShortcutAction.TAB_COLLECTIONS
        ShortcutKey.D5 -> ShortcutAction.TAB_INDEX
    }
}

/**
 * 一覧の選択位置を動かす。空なら選択なし（-1）、端では止まる。
 */
fun moveSelection(current: Int, size: Int, delta: Int): Int {
    if (size <= 0) return -1
    if (current < 0) return if (delta > 0) 0 else size - 1
    return (current + delta).coerceIn(0, size - 1)
}
