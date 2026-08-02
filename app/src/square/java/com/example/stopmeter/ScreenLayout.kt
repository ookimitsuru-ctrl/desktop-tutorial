package com.example.stopmeter

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Divider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// タクシー車載スクエア型ディスプレイ（1080×1200 目安）向けレイアウト。
// 縦スクロールさせず、常時全指標が一目で見えるよう2指標を横並びにする。
@Composable
internal fun StopMeterLayout(
    displayTotal: Long,
    statusKind: StatusKind,
    displaySpeed: Double?,
    running: Boolean,
    reserved: Boolean,
    manualStop: Boolean,
    breakWarning: BreakWarning,
    warningColor: Color,
    pulseAlpha: Float,
    indicatorBackground: Color,
    indicatorBorder: Color,
    intervalMs: Long,
    lastBreakEndMs: Long?,
    measurementStartMs: Long?,
    currentStopMs: Long,
    message: String,
    onOpenMenu: () -> Unit,
    onMeasureToggle: (Boolean) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgColor)
            .padding(16.dp)
    ) {
        // ヘッダー（タイトル + 小型メニュー：右上）
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "停車時間加算アプリ",
                color = TextColor, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f)
            )
            Row(
                modifier = Modifier
                    .background(PanelColor, RoundedCornerShape(12.dp))
                    .border(1.dp, PanelEdge, RoundedCornerShape(12.dp))
                    .clickable { onOpenMenu() }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("☰", color = TextColor, fontSize = 14.sp)
                Spacer(Modifier.width(6.dp))
                Text("メニュー", color = TextColor, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(Modifier.height(10.dp))

        // ---- メーターパネル（合計 + 状態 + 現在速度） ----
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(PanelColor, RoundedCornerShape(18.dp))
                .padding(horizontal = 20.dp, vertical = 14.dp)
        ) {
            Text("停車加算時間", color = MutedColor, fontSize = 12.sp, letterSpacing = 2.sp)
            Text(
                fmtHMS(displayTotal),
                color = if (displayTotal == 0L) IdleColor else AmberColor,
                fontFamily = FontFamily.Monospace, fontSize = 46.sp, maxLines = 1,
                modifier = Modifier.padding(top = 4.dp)
            )
            Spacer(Modifier.height(10.dp))
            Divider(color = PanelEdge)
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier.size(12.dp).background(
                        color = when (statusKind) {
                            StatusKind.MOVING   -> GreenColor
                            StatusKind.COUNTING -> AmberColor
                            else                -> IdleColor
                        },
                        shape = RoundedCornerShape(50)
                    )
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = statusLabel(statusKind, running, manualStop, reserved),
                    color = TextColor, fontSize = 14.sp
                )
                Spacer(Modifier.weight(1f))
                Text(
                    displaySpeed?.let { "%.1f km/h".format(it) } ?: "-- km/h",
                    color = MutedColor, fontFamily = FontFamily.Monospace, fontSize = 14.sp
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        // ---- 大きな2指標: 連続運転時間 / 今回の停車時間（正方形に近い画面なので横並びにして
        //      スクロール無しで全情報が一画面に収まるようにする） ----
        Row(
            modifier = Modifier.fillMaxWidth().weight(1f),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            DrivingIntervalPanel(
                breakWarning = breakWarning,
                warningColor = warningColor,
                pulseAlpha = pulseAlpha,
                running = running,
                indicatorBackground = indicatorBackground,
                indicatorBorder = indicatorBorder,
                intervalMs = intervalMs,
                lastBreakEndMs = lastBreakEndMs,
                measurementStartMs = measurementStartMs,
                modifier = Modifier.weight(1f).fillMaxHeight(),
                valueFontSize = 38.sp
            )
            CurrentStopPanel(
                reserved = reserved,
                statusKind = statusKind,
                currentStopMs = currentStopMs,
                modifier = Modifier.weight(1f).fillMaxHeight(),
                valueFontSize = 38.sp
            )
        }

        Spacer(Modifier.height(12.dp))

        // ---- 計測 開始/停止 ----
        ToggleRow(
            title = if (running) "計測中" else "測定開始",
            sub = "スライドして計測を開始/停止",
            checked = running,
            accent = GreenColor,
            titleColor = if (running) GreenColor else TextColor,
            onCheckedChange = { onMeasureToggle(it) }
        )

        if (message.isNotEmpty()) {
            Text(message, color = DangerColor, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        }

        Spacer(Modifier.height(8.dp))

        // ---- バージョン表示（右下） ----
        Text(
            APP_VERSION,
            color = MutedColor, fontSize = 11.sp,
            modifier = Modifier.align(Alignment.End)
        )
    }
}
