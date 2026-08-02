package com.example.stopmeter

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Divider
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 休憩履歴画面。
 * 「何時何分に何分休んだか」を日付ごとに一覧表示し、CSVとして書き出せる。
 */
@Composable
internal fun HistoryScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    // 新しい順に表示
    val records = AppState.breaks.sortedByDescending { it.startMs }
    var confirmClear by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgColor)
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
    ) {
        ScreenHeader(title = "休憩履歴", onBack = onBack)

        Spacer(Modifier.height(16.dp))

        // ---- サマリー ----
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            SummaryCard("休憩回数", "${records.size} 回", Modifier.weight(1f))
            SummaryCard("合計休憩時間", fmtHM(records.sumOf { it.durationMs }), Modifier.weight(1f))
        }

        Spacer(Modifier.height(16.dp))

        // ---- CSV出力 ----
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            ActionButton(
                label = "CSVで出力",
                color = GreenColor,
                enabled = records.isNotEmpty(),
                modifier = Modifier.weight(1f)
            ) { exportCsv(context, records) }

            ActionButton(
                label = if (confirmClear) "本当に消去？" else "履歴を消去",
                color = DangerColor,
                enabled = records.isNotEmpty(),
                modifier = Modifier.weight(1f)
            ) {
                if (confirmClear) {
                    AppState.breaks.clear()
                    Prefs.saveBreaks(context, emptyList())
                    confirmClear = false
                    Toast.makeText(context, "履歴を消去しました", Toast.LENGTH_SHORT).show()
                } else {
                    confirmClear = true
                }
            }
        }

        Spacer(Modifier.height(18.dp))

        if (records.isEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(PanelColor, RoundedCornerShape(16.dp))
                    .padding(30.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("履歴はまだありません", color = MutedColor, fontSize = 14.sp)
                Text(
                    "${AppState.qualifyMinutes}分以上の停車が成立すると、ここに記録されます。",
                    color = MutedColor, fontSize = 11.sp, lineHeight = 17.sp,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        } else {
            // 日付ごとにグループ化して表示
            records.groupBy { fmtDate(it.startMs) }.forEach { (date, dayRecords) ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(date, color = ReserveColor, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.weight(1f))
                    Text(
                        "計 ${fmtHM(dayRecords.sumOf { it.durationMs })}",
                        color = MutedColor, fontSize = 11.sp, fontFamily = FontFamily.Monospace
                    )
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(PanelColor, RoundedCornerShape(14.dp))
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    dayRecords.forEachIndexed { i, r ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "${fmtClock(r.startMs)} → ${fmtClock(r.endMs)}",
                                color = TextColor,
                                fontSize = 15.sp,
                                fontFamily = FontFamily.Monospace
                            )
                            Spacer(Modifier.weight(1f))
                            Text(
                                "${r.durationMin} 分",
                                color = AmberColor,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                        if (i < dayRecords.lastIndex) Divider(color = PanelEdge)
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }

        Text(
            "CSVは他アプリ（メール・ドライブ・ファイル等）へ共有する形で書き出されます。" +
                "Excelで開けるようUTF-8(BOM付き)で出力します。",
            color = MutedColor, fontSize = 11.sp, lineHeight = 17.sp,
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}

@Composable
private fun SummaryCard(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(PanelColor, RoundedCornerShape(14.dp))
            .padding(14.dp)
    ) {
        Text(label, color = MutedColor, fontSize = 10.sp, letterSpacing = 2.sp)
        Text(
            value,
            color = TextColor,
            fontFamily = FontFamily.Monospace,
            fontSize = 22.sp,
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}

@Composable
private fun ActionButton(
    label: String,
    color: androidx.compose.ui.graphics.Color,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .background(
                if (enabled) color.copy(alpha = 0.14f) else PanelColor,
                RoundedCornerShape(14.dp)
            )
            .border(
                1.dp,
                if (enabled) color.copy(alpha = 0.6f) else PanelEdge,
                RoundedCornerShape(14.dp)
            )
            .then(if (enabled) Modifier.clickable { onClick() } else Modifier)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            color = if (enabled) color else MutedColor,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

/** 履歴をCSVファイルに書き出し、共有シートを開く */
private fun exportCsv(context: Context, records: List<BreakRecord>) {
    try {
        val dir = File(context.cacheDir, "csv").apply { mkdirs() }
        val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.JAPAN).format(Date())
        val file = File(dir, "休憩履歴_$stamp.csv")

        // Excelでの文字化けを防ぐためBOMを付与
        file.writeBytes(("\uFEFF" + buildBreaksCsv(records)).toByteArray(Charsets.UTF_8))

        val uri = FileProvider.getUriForFile(
            context, "${context.packageName}.fileprovider", file
        )
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, "休憩履歴 $stamp")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "CSVの出力先を選択"))
    } catch (e: Exception) {
        Toast.makeText(context, "CSVの出力に失敗しました: ${e.message}", Toast.LENGTH_LONG).show()
    }
}
