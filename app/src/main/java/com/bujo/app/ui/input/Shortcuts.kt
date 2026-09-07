package com.bujo.app.ui.input

import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type

/** Compose のキーを対応表のキーへ変換する */
fun Key.toShortcutKey(): ShortcutKey? = when (this) {
    Key.N -> ShortcutKey.N
    Key.E -> ShortcutKey.E
    Key.M -> ShortcutKey.M
    Key.T -> ShortcutKey.T
    Key.J -> ShortcutKey.J
    Key.K -> ShortcutKey.K
    Key.H -> ShortcutKey.H
    Key.L -> ShortcutKey.L
    Key.Slash -> ShortcutKey.SLASH
    Key.Spacebar -> ShortcutKey.SPACE
    Key.Enter, Key.NumPadEnter -> ShortcutKey.ENTER
    Key.Escape, Key.Back -> ShortcutKey.ESCAPE
    Key.DirectionUp -> ShortcutKey.UP
    Key.DirectionDown -> ShortcutKey.DOWN
    Key.DirectionLeft -> ShortcutKey.LEFT
    Key.DirectionRight -> ShortcutKey.RIGHT
    Key.One -> ShortcutKey.D1
    Key.Two -> ShortcutKey.D2
    Key.Three -> ShortcutKey.D3
    Key.Four -> ShortcutKey.D4
    Key.Five -> ShortcutKey.D5
    else -> null
}

/**
 * 物理キーボードの押下を拾う。
 *
 * onKeyEvent（先に子へ渡す方）を使っているので、テキスト入力中は
 * 入力欄がキーを消費し、ここには届かない。
 */
fun Modifier.bujoShortcuts(
    enabled: Boolean = true,
    onAction: (ShortcutAction) -> Boolean
): Modifier = if (!enabled) this else onKeyEvent { event ->
    if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
    val key = event.key.toShortcutKey() ?: return@onKeyEvent false
    val action = actionFor(key, event.isCtrlPressed) ?: return@onKeyEvent false
    onAction(action)
}

/**
 * ショートカットを受け取れる入れ物。
 * キーイベントを受けるにはフォーカスが要るので、自分でフォーカスを取りにいく。
 * シートやダイアログを開いている間は enabled = false にして、そちらに譲る。
 */
@Composable
fun ShortcutHost(
    onAction: (ShortcutAction) -> Boolean,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable () -> Unit
) {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(enabled) {
        if (enabled) {
            withFrameNanos { }
            runCatching { focusRequester.requestFocus() }
        }
    }
    Box(
        modifier = modifier
            .focusRequester(focusRequester)
            .focusable(enabled)
            .bujoShortcuts(enabled, onAction)
    ) {
        content()
    }
}

/**
 * 入力シート用。テキストを打っている最中でも効くように先回りして拾うが、
 * 横取りするのは Ctrl+Enter（保存）と Esc（閉じる）だけに限る。
 */
fun Modifier.editorKeys(
    onSubmit: () -> Unit,
    onDismiss: () -> Unit
): Modifier = onPreviewKeyEvent { event ->
    if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
    when {
        event.isCtrlPressed && (event.key == Key.Enter || event.key == Key.NumPadEnter) -> {
            onSubmit()
            true
        }

        event.key == Key.Escape -> {
            onDismiss()
            true
        }

        else -> false
    }
}
