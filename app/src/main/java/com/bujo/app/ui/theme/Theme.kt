package com.bujo.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColors = lightColorScheme(
    primary = Accent,
    onPrimary = Paper,
    primaryContainer = AccentSoft,
    onPrimaryContainer = Ink,
    secondary = InkSoft,
    onSecondary = Paper,
    background = Paper,
    onBackground = Ink,
    surface = Paper,
    onSurface = Ink,
    surfaceVariant = PaperDim,
    onSurfaceVariant = InkSoft,
    outline = Rule,
    outlineVariant = Rule
)

private val DarkColors = darkColorScheme(
    primary = NightAccent,
    onPrimary = NightPaper,
    primaryContainer = NightRule,
    onPrimaryContainer = NightInk,
    secondary = NightInkSoft,
    onSecondary = NightPaper,
    background = NightPaper,
    onBackground = NightInk,
    surface = NightPaper,
    onSurface = NightInk,
    surfaceVariant = NightPaperDim,
    onSurfaceVariant = NightInkSoft,
    outline = NightRule,
    outlineVariant = NightRule
)

@Composable
fun BujoTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colors = if (darkTheme) DarkColors else LightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !darkTheme
            controller.isAppearanceLightNavigationBars = !darkTheme
        }
    }
    MaterialTheme(
        colorScheme = colors,
        typography = BujoTypography,
        content = content
    )
}
