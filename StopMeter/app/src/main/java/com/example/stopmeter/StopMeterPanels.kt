package com.example.stopmeter

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// メイン画面の状態表示ラベル（phone / square 共通）
internal fun statusLabel(statusKind: StatusKind, running: Boolean, manualStop: Boolean, reserved: Boolean): String =
    when {
        manualStop && statusKind == StatusKind.PENDING && reserved -> "停車中（手動・予約中）"
        manualStop && statusKind == StatusKind.PENDING            -> "停車中（手動カウント）"
        manualStop && statusKind == StatusKind.COUNTING           -> "停車中（手動・加算中）"
        statusKind == StatusKind.PENDING && reserved -> "停車中（予約中・休憩スキップ）"
        statusKind == StatusKind.MOVING   -> "走行中"
        statusKind == StatusKind.COUNTING -> "停車中（加算中）"
        statusKind == StatusKind.PENDING  -> "停車中（カウント中）"
        else -> if (running) "計測中…" else "停止中"
    }

/** 連続運転時間パネル（大）：phone / square 共通の見た目、サイズは呼び出し側の Modifier で調整 */
@Composable
internal fun DrivingIntervalPanel(
    breakWarning: BreakWarning,
    warningColor: Color,
    pulseAlpha: Float,
    running: Boolean,
    indicatorBackground: Color,
    indicatorBorder: Color,
    intervalMs: Long,
    lastBreakEndMs: Long?,
    measurementStartMs: Long?,
    modifier: Modifier = Modifier,
    valueFontSize: androidx.compose.ui.unit.TextUnit = 52.sp
) {
    Column(
        modifier = modifier
            .background(indicatorBackground, RoundedCornerShape(18.dp))
            .border(1.dp, indicatorBorder, RoundedCornerShape(18.dp))
            .padding(horizontal = 16.dp, vertical = 20.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .background(
                        if (breakWarning == BreakWarning.DANGER && running)
                            warningColor.copy(alpha = pulseAlpha) else warningColor,
                        RoundedCornerShape(50)
                    )
            )
            Spacer(Modifier.width(8.dp))
            Text("連続運転時間", color = MutedColor, fontSize = 11.sp, letterSpacing = 2.sp)
        }
        Text(
            text = if (lastBreakEndMs != null || measurementStartMs != null) fmtHM(intervalMs) else "--:--",
            color = warningColor,
            fontFamily = FontFamily.Monospace, fontSize = valueFontSize, maxLines = 1,
            modifier = Modifier.padding(top = 8.dp)
        )
        Text(
            text = when (breakWarning) {
                BreakWarning.DANGER -> "⚠ 休憩が必要です"
                BreakWarning.WARN   -> "休憩を検討してください"
                BreakWarning.NONE   -> "　"
            },
            color = when (breakWarning) {
                BreakWarning.DANGER -> DangerColor
                BreakWarning.WARN   -> WarnColor
                BreakWarning.NONE   -> MutedColor
            },
            fontSize = 11.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 6.dp)
        )
    }
}

/** 今回の停車時間パネル（大）：phone / square 共通の見た目、サイズは呼び出し側の Modifier で調整 */
@Composable
internal fun CurrentStopPanel(
    reserved: Boolean,
    statusKind: StatusKind,
    currentStopMs: Long,
    modifier: Modifier = Modifier,
    valueFontSize: androidx.compose.ui.unit.TextUnit = 52.sp
) {
    Column(
        modifier = modifier
            .background(
                if (reserved) ReserveColor.copy(alpha = 0.12f) else PanelColor,
                RoundedCornerShape(18.dp)
            )
            .border(
                1.dp,
                if (reserved) ReserveColor.copy(alpha = 0.6f) else PanelEdge,
                RoundedCornerShape(18.dp)
            )
            .padding(horizontal = 16.dp, vertical = 20.dp)
    ) {
        Text(
            if (reserved) "停車時間（予約中）" else "今回の停車時間",
            color = if (reserved) ReserveColor.copy(alpha = 0.8f) else MutedColor,
            fontSize = 11.sp, letterSpacing = 2.sp
        )
        Text(
            fmtMS(currentStopMs),
            color = when {
                reserved                          -> ReserveColor
                statusKind == StatusKind.COUNTING -> AmberColor
                else                              -> TextColor
            },
            fontFamily = FontFamily.Monospace, fontSize = valueFontSize, maxLines = 1,
            modifier = Modifier.padding(top = 8.dp)
        )
        Text(
            text = when {
                reserved                          -> "加算しません"
                statusKind == StatusKind.COUNTING -> "加算中"
                else                              -> "　"
            },
            color = if (statusKind == StatusKind.COUNTING) AmberColor else MutedColor,
            fontSize = 11.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 6.dp)
        )
    }
}
