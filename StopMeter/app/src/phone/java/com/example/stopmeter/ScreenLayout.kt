package com.example.stopmeter

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Divider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// スマートフォン向けレイアウト（縦スクロール・指標を上下に積む構成）
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
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
    ) {
        // ヘッダー（タイトル + 小型メニュー：右上）
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "停車時間加算アプリ",
                color = TextColor, fontSize = 22.sp, fontWeight = FontWeight.Bold,
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
                Text("☰", color = TextColor, fontSize = 15.sp)
                Spacer(Modifier.width(6.dp))
                Text("メニュー", color = TextColor, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(Modifier.height(16.dp))

        // ---- メーターパネル（合計 + 状態 + 現在速度） ----
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(PanelColor, RoundedCornerShape(18.dp))
                .padding(20.dp)
        ) {
            Text("停車加算時間", color = MutedColor, fontSize = 12.sp, letterSpacing = 2.sp)
            Text(
                fmtHMS(displayTotal),
                color = if (displayTotal == 0L) IdleColor else AmberColor,
                fontFamily = FontFamily.Monospace, fontSize = 52.sp, maxLines = 1,
                modifier = Modifier.padding(top = 6.dp)
            )
            Spacer(Modifier.height(14.dp))
            Divider(color = PanelEdge)
            Spacer(Modifier.height(12.dp))
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
                    color = TextColor, fontSize = 15.sp
                )
                Spacer(Modifier.weight(1f))
                Text(
                    displaySpeed?.let { "%.1f km/h".format(it) } ?: "-- km/h",
                    color = MutedColor, fontFamily = FontFamily.Monospace, fontSize = 15.sp
                )
            }
        }

        Spacer(Modifier.height(14.dp))

        // ---- 大きな2指標: 連続運転時間 / 今回の停車時間（縦に積む） ----
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(14.dp)
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
                modifier = Modifier.fillMaxWidth()
            )
            CurrentStopPanel(
                reserved = reserved,
                statusKind = statusKind,
                currentStopMs = currentStopMs,
                modifier = Modifier.fillMaxWidth()
            )
        }

        Spacer(Modifier.height(18.dp))

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
            Text(message, color = DangerColor, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
        }

        Spacer(Modifier.height(16.dp))

        // ---- バージョン表示（右下） ----
        Text(
            APP_VERSION,
            color = MutedColor, fontSize = 11.sp,
            modifier = Modifier.align(Alignment.End)
        )
    }
}
