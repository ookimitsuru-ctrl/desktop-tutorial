package com.bujo.app.ui.layout

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration

/** 画面の形はどの画面からも参照するので CompositionLocal で配る */
val LocalWindowSpec: ProvidableCompositionLocal<WindowSpec> =
    compositionLocalOf { WindowSpec(widthDp = 411, heightDp = 891) }

@Composable
fun rememberWindowSpec(): WindowSpec {
    val configuration = LocalConfiguration.current
    return remember(configuration.screenWidthDp, configuration.screenHeightDp) {
        WindowSpec(configuration.screenWidthDp, configuration.screenHeightDp)
    }
}
