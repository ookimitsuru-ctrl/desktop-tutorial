package com.bujo.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val base = Typography()

val BujoTypography = base.copy(
    titleLarge = base.titleLarge.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
    bodyLarge = base.bodyLarge.copy(lineHeight = 26.sp),
    labelLarge = base.labelLarge.copy(letterSpacing = 0.4.sp)
)

/** バレット記号は等幅で揃える */
val BulletTextStyle = TextStyle(
    fontFamily = FontFamily.Monospace,
    fontSize = 18.sp,
    fontWeight = FontWeight.Medium
)
