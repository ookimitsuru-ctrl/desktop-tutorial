package com.example.stopmeter

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay

// APP_VERSION・配色（BgColor 等）は Shared.kt に定義済み（同一パッケージ内で共有）
// 休憩とみなす停車時間は AppState.qualifyMinutes / AppState.qualifyMs（設定画面で変更可能）

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 保存済みの設定・休憩履歴を読み込む
        Prefs.loadInto(applicationContext)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(background = BgColor, surface = PanelColor)) {
                var screen by remember { mutableStateOf(Screen.MAIN) }
                when (screen) {
                    Screen.MAIN     -> StopMeterScreen(onOpen = { screen = it })
                    Screen.MENU     -> MenuScreen(onOpen = { screen = it }, onBack = { screen = Screen.MAIN })
                    Screen.SETTINGS -> SettingsScreen(onBack = { screen = Screen.MENU })
                    Screen.HISTORY  -> HistoryScreen(onBack = { screen = Screen.MENU })
                }
            }
        }
    }
}

/** 画面の種類 */
internal enum class Screen { MAIN, MENU, SETTINGS, HISTORY }

private fun startMeasuringService(context: Context) {
    val intent = Intent(context, StopTimerService::class.java).setAction(StopTimerService.ACTION_START)
    ContextCompat.startForegroundService(context, intent)
}

private fun stopMeasuringService(context: Context) {
    val intent = Intent(context, StopTimerService::class.java).setAction(StopTimerService.ACTION_STOP)
    context.startService(intent)
}

// ==================================================================
//  メイン画面（表示専用 + メニューボタン）
// ==================================================================
@Composable
private fun StopMeterScreen(onOpen: (Screen) -> Unit) {
    val context = LocalContext.current

    // ---- サービスが更新する共有状態を購読 ----
    val running        = AppState.running
    val totalMs        = AppState.totalMs
    val currentStopMs  = AppState.currentStopMs
    val displaySpeed    = AppState.displaySpeed
    val statusKind      = AppState.statusKind
    val lastBreakEndMs     = AppState.lastBreakEndMs
    val measurementStartMs = AppState.measurementStartMs
    val intervalMs          = AppState.intervalMs
    val breakWarning        = AppState.breakWarning
    val reserved   = AppState.reserved
    val manualStop = AppState.manualStop
    val message    = AppState.message

    // 計測中はスリープしないよう画面を常時点灯させる（アプリがフォアグラウンドの間の補助）
    val view = LocalView.current
    DisposableEffect(running) {
        view.keepScreenOn = running
        onDispose { view.keepScreenOn = false }
    }

    val displayTotal = totalMs + if (statusKind == StatusKind.COUNTING) currentStopMs else 0L

    // アニメーション
    val pulseAlpha by rememberInfiniteTransition(label = "pulse").animateFloat(
        initialValue = 1f, targetValue = 0.3f,
        animationSpec = infiniteRepeatable(tween(800, easing = EaseInOut), RepeatMode.Reverse),
        label = "alpha"
    )
    val warningColor by animateColorAsState(
        targetValue = when (breakWarning) {
            BreakWarning.DANGER -> DangerColor
            BreakWarning.WARN   -> WarnColor
            BreakWarning.NONE   -> NormalColor
        },
        animationSpec = tween(500), label = "warnColor"
    )

    // ---- 計測 開始/停止（位置情報の権限リクエスト付き） ----
    fun hasLocationPermission(): Boolean {
        val fine   = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
        return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        val ok = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (ok) {
            AppState.message = ""
            startMeasuringService(context)
        } else {
            AppState.message = "位置情報の利用が許可されていません。設定から許可してください。"
        }
    }
    fun onMeasureToggle(checked: Boolean) {
        if (checked) {
            AppState.message = ""
            val perms = mutableListOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                perms.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            if (hasLocationPermission()) {
                startMeasuringService(context)
            } else {
                permissionLauncher.launch(perms.toTypedArray())
            }
        } else {
            stopMeasuringService(context)
        }
    }

    // ---- UI ----
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
                    .clickable { onOpen(Screen.MENU) }
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
                    text = when {
                        manualStop && statusKind == StatusKind.PENDING && reserved -> "停車中（手動・予約中）"
                        manualStop && statusKind == StatusKind.PENDING            -> "停車中（手動カウント）"
                        manualStop && statusKind == StatusKind.COUNTING           -> "停車中（手動・加算中）"
                        statusKind == StatusKind.PENDING && reserved -> "停車中（予約中・休憩スキップ）"
                        statusKind == StatusKind.MOVING   -> "走行中"
                        statusKind == StatusKind.COUNTING -> "停車中（加算中）"
                        statusKind == StatusKind.PENDING  -> "停車中（カウント中）"
                        else -> if (running) "計測中…" else "停止中"
                    },
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

        // ---- 大きな2指標: 連続運転時間 / 今回の停車時間 ----
        val indBg = when (breakWarning) {
            BreakWarning.DANGER -> DangerColor.copy(alpha = 0.12f)
            BreakWarning.WARN   -> WarnColor.copy(alpha = 0.10f)
            BreakWarning.NONE   -> PanelColor
        }
        val indBorder = when (breakWarning) {
            BreakWarning.DANGER -> DangerColor.copy(alpha = if (running) pulseAlpha else 0.6f)
            BreakWarning.WARN   -> WarnColor.copy(alpha = 0.6f)
            BreakWarning.NONE   -> PanelEdge
        }
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // 連続運転時間（大）
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(indBg, RoundedCornerShape(18.dp))
                    .border(1.dp, indBorder, RoundedCornerShape(18.dp))
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
                    fontFamily = FontFamily.Monospace, fontSize = 52.sp, maxLines = 1,
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

            // 今回の停車時間（大）
            Column(
                modifier = Modifier
                    .fillMaxWidth()
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
                    fontFamily = FontFamily.Monospace, fontSize = 52.sp, maxLines = 1,
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

// ==================================================================
//  メニュー画面（予約・手動・計測・全リセット・休憩履歴・設定）
// ==================================================================
@Composable
private fun MenuScreen(onOpen: (Screen) -> Unit, onBack: () -> Unit) {
    val reserved       = AppState.reserved
    val manualStop     = AppState.manualStop
    val qualifyMinutes = AppState.qualifyMinutes

    var resetArmed by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgColor)
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
    ) {
        ScreenHeader(title = "メニュー", onBack = onBack)

        Spacer(Modifier.height(18.dp))

        // ---- 操作パネル（予約・手動・全リセット・休憩履歴・設定をひとまとめ） ----
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(PanelColor, RoundedCornerShape(18.dp))
                .border(1.dp, PanelEdge, RoundedCornerShape(18.dp))
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // 予約 / 手動
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                ToggleTile(
                    label = "予約",
                    checked = reserved,
                    accent = ReserveColor,
                    modifier = Modifier.weight(1f),
                    onCheckedChange = { AppState.reserved = it }
                )
                ToggleTile(
                    label = "手動",
                    checked = manualStop,
                    accent = ManualColor,
                    modifier = Modifier.weight(1f),
                    onCheckedChange = { AppState.manualStop = it }
                )
            }

            // 全リセット
            ToggleRow(
                title = "全リセット",
                sub = "合計・連続・予約をリセット（休憩履歴は残ります）",
                checked = resetArmed,
                accent = DangerColor,
                titleColor = if (resetArmed) DangerColor else TextColor,
                onCheckedChange = { checked ->
                    if (checked) AppState.fullReset()
                    resetArmed = checked
                }
            )

            // 休憩履歴 / 設定
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                MenuButton(
                    label = "設定",
                    sub = "休憩 ${qualifyMinutes}分",
                    accent = AmberColor,
                    modifier = Modifier.weight(1f)
                ) { onOpen(Screen.SETTINGS) }

                MenuButton(
                    label = "休憩履歴",
                    sub = "${AppState.breaks.size}件",
                    accent = ReserveColor,
                    modifier = Modifier.weight(1f)
                ) { onOpen(Screen.HISTORY) }
            }
        }

        // リセットスイッチは操作後、自動的に元の位置へ戻す（誤操作防止のトグル表示のみ）
        LaunchedEffect(resetArmed) {
            if (resetArmed) {
                delay(600)
                resetArmed = false
            }
        }
    }
}

/** 操作パネル内の小さなトグルタイル（予約 / 手動） */
@Composable
private fun ToggleTile(
    label: String,
    checked: Boolean,
    accent: Color,
    modifier: Modifier = Modifier,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = modifier
            .background(if (checked) accent.copy(alpha = 0.12f) else BgColor, RoundedCornerShape(14.dp))
            .border(1.dp, if (checked) accent.copy(alpha = 0.6f) else PanelEdge, RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            label,
            color = if (checked) accent else TextColor,
            fontSize = 14.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f)
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = BgColor,
                checkedTrackColor = accent,
                uncheckedThumbColor = MutedColor
            )
        )
    }
}

/** 操作パネル内の横長トグル行（計測 / 全リセット） */
@Composable
private fun ToggleRow(
    title: String,
    sub: String,
    checked: Boolean,
    accent: Color,
    titleColor: Color,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (checked) accent.copy(alpha = 0.12f) else BgColor, RoundedCornerShape(14.dp))
            .border(1.dp, if (checked) accent.copy(alpha = 0.6f) else PanelEdge, RoundedCornerShape(14.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = titleColor, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Text(sub, fontSize = 10.sp, color = MutedColor, modifier = Modifier.padding(top = 2.dp))
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = BgColor,
                checkedTrackColor = accent,
                uncheckedThumbColor = MutedColor
            )
        )
    }
}

/** メニュー内の遷移ボタン（設定 / 休憩履歴） */
@Composable
private fun MenuButton(
    label: String,
    sub: String,
    accent: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Row(
        modifier = modifier
            .background(BgColor, RoundedCornerShape(14.dp))
            .border(1.dp, PanelEdge, RoundedCornerShape(14.dp))
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, color = TextColor, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text(sub, color = accent, fontSize = 11.sp, modifier = Modifier.padding(top = 2.dp))
        }
        Text("›", color = MutedColor, fontSize = 20.sp)
    }
}
