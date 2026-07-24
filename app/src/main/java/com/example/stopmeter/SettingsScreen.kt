package com.example.stopmeter

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 設定画面。
 * 「休憩とみなす停車時間」を 5分刻みで 5〜60分の範囲から選択できる。
 */
@Composable
internal fun SettingsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val selected = AppState.qualifyMinutes

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgColor)
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
    ) {
        ScreenHeader(title = "設定", onBack = onBack)

        Spacer(Modifier.height(18.dp))

        Text("休憩とみなす停車時間", color = TextColor, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Text(
            "ここで設定した時間以上の停車が、休憩として合計時間に加算され、履歴に記録されます。",
            color = MutedColor, fontSize = 12.sp, lineHeight = 18.sp,
            modifier = Modifier.padding(top = 6.dp)
        )

        Spacer(Modifier.height(14.dp))

        // 現在の設定値を大きく表示
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(PanelColor, RoundedCornerShape(16.dp))
                .padding(20.dp)
        ) {
            Text("現在の設定", color = MutedColor, fontSize = 10.sp, letterSpacing = 2.sp)
            Text(
                "$selected 分",
                color = AmberColor,
                fontFamily = FontFamily.Monospace,
                fontSize = 38.sp,
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        Spacer(Modifier.height(16.dp))

        // 5分刻みの選択肢（3列グリッド）
        val options = Prefs.qualifyOptions
        options.chunked(3).forEach { rowItems ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                rowItems.forEach { min ->
                    val isSel = min == selected
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .background(
                                if (isSel) AmberColor.copy(alpha = 0.15f) else PanelColor,
                                RoundedCornerShape(14.dp)
                            )
                            .border(
                                1.dp,
                                if (isSel) AmberColor.copy(alpha = 0.7f) else PanelEdge,
                                RoundedCornerShape(14.dp)
                            )
                            .clickable {
                                AppState.qualifyMinutes = min
                                Prefs.saveQualifyMinutes(context, min)
                            }
                            .padding(vertical = 16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "$min 分",
                            color = if (isSel) AmberColor else TextColor,
                            fontSize = 16.sp,
                            fontWeight = if (isSel) FontWeight.Bold else FontWeight.Normal
                        )
                    }
                }
                // 端数の穴埋め
                repeat(3 - rowItems.size) { Spacer(Modifier.weight(1f)) }
            }
        }

        Text(
            "※ 計測中に変更した場合、進行中の停車から新しい設定が適用されます。" +
                "すでに記録済みの履歴や合計時間はさかのぼって変更されません。",
            color = MutedColor, fontSize = 11.sp, lineHeight = 17.sp,
            modifier = Modifier.padding(top = 8.dp)
        )
    }
}

/** 各サブ画面で共通のヘッダー（戻るボタン + タイトル） */
@Composable
internal fun ScreenHeader(title: String, onBack: () -> Unit, action: (@Composable () -> Unit)? = null) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .background(PanelColor, RoundedCornerShape(12.dp))
                .border(1.dp, PanelEdge, RoundedCornerShape(12.dp))
                .clickable { onBack() }
                .padding(horizontal = 14.dp, vertical = 8.dp)
        ) {
            Text("← 戻る", color = TextColor, fontSize = 13.sp)
        }
        Spacer(Modifier.width(14.dp))
        Text(title, color = TextColor, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        action?.invoke()
    }
}
