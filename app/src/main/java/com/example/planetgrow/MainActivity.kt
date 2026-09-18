package com.example.planetgrow

import android.graphics.Bitmap
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.example.planetgrow.core.Growth
import com.example.planetgrow.core.PropKind
import com.example.planetgrow.core.Scene
import com.example.planetgrow.core.Sky
import com.example.planetgrow.core.World
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 星空を画面のすみずみまで出したいので、システムバーの裏まで描く
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                PlanetScreen()
            }
        }
    }
}

/** 地球のローカル時刻での「今日の進み具合」 (0.0 = 0:00, 0.5 = 12:00, 1.0 = 24:00)。 */
private fun localDayFraction(zone: ZoneId, nowMillis: Long): Float {
    val offsetSec = zone.rules.getOffset(Instant.ofEpochMilli(nowMillis)).totalSeconds
    val sec = Math.floorMod(nowMillis / 1000L + offsetSec, 86400L)
    val ms = Math.floorMod(nowMillis, 1000L)
    return ((sec * 1000L + ms).toDouble() / 86_400_000.0).toFloat()
}

/** 描画フレームの時計。Compose の再コンポーズを起こさずに値を持ち回る。 */
private class FrameClock {
    var timeSec: Float = 0f
    var dt: Float = 1f / 60f
}

@Composable
fun PlanetScreen() {
    val context = LocalContext.current
    val prefs = remember { PlanetPrefs(context) }
    val zone = remember { ZoneId.systemDefault() }

    // 実際の経過日数 (地球時間)。日付が変わると自然に増える。
    val realDay = remember { mutableIntStateOf(prefs.dayNumber(zone)) }
    // 長押しで先の日を覗くためのオフセット
    val previewOffset = remember { mutableIntStateOf(0) }
    // 時計表示 (分が変わったときだけ更新する)
    val clockMinute = remember { mutableIntStateOf(LocalTime.now(zone).let { it.hour * 60 + it.minute }) }

    val day = realDay.intValue + previewOffset.intValue

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF05070F))
    ) {
        val widthPx = constraints.maxWidth.coerceAtLeast(1)
        val heightPx = constraints.maxHeight.coerceAtLeast(1)

        val viewBlocks = remember(day) { Scene.viewBlocksFor(day) }
        val bufferSize = remember(widthPx, heightPx, viewBlocks) {
            Scene.bufferSize(widthPx, heightPx, viewBlocks)
        }
        val scene = remember(bufferSize[0], bufferSize[1]) { Scene(bufferSize[0], bufferSize[1]) }
        val bitmap = remember(scene) {
            Bitmap.createBitmap(scene.width, scene.height, Bitmap.Config.ARGB_8888)
        }
        val image = remember(bitmap) { bitmap.asImageBitmap() }
        val world = remember { World(day) }
        val clock = remember { FrameClock() }
        val frameTick = remember { mutableLongStateOf(0L) }

        LaunchedEffect(day) { world.setDay(day) }

        // 1 フレームごとに時間を進める
        LaunchedEffect(Unit) {
            var startNanos = 0L
            var prevNanos = 0L
            while (true) {
                val now = withFrameNanos { it }
                if (startNanos == 0L) startNanos = now
                val dt = if (prevNanos == 0L) 0f
                else ((now - prevNanos) / 1_000_000_000.0).toFloat().coerceIn(0f, 0.1f)
                prevNanos = now
                clock.dt = dt
                clock.timeSec = ((now - startNanos) / 1_000_000_000.0).toFloat()

                val nowMs = System.currentTimeMillis()
                val sky = Sky(localDayFraction(zone, nowMs), nowMs)
                world.update(dt, sky.sunDirX, sky.sunDirY)

                // 分が変わったら時計表示と日付を見直す
                val t = LocalTime.now(zone)
                val minuteOfDay = t.hour * 60 + t.minute
                if (minuteOfDay != clockMinute.intValue) {
                    clockMinute.intValue = minuteOfDay
                    realDay.intValue = prefs.dayNumber(zone)
                }
                frameTick.longValue = now
            }
        }

        Canvas(Modifier.fillMaxSize()) {
            // frameTick を読むことで毎フレーム描き直される
            val tick = frameTick.longValue
            if (tick >= 0L) {
                val nowMs = System.currentTimeMillis()
                val sky = Sky(localDayFraction(zone, nowMs), nowMs)
                scene.render(world, sky, clock.timeSec, clock.dt)
                bitmap.setPixels(scene.frame.px, 0, scene.width, 0, 0, scene.width, scene.height)
                drawImage(
                    image = image,
                    srcOffset = IntOffset.Zero,
                    srcSize = IntSize(scene.width, scene.height),
                    dstOffset = IntOffset.Zero,
                    dstSize = IntSize(size.width.toInt(), size.height.toInt()),
                    filterQuality = FilterQuality.None
                )
            }
        }

        Hud(
            day = day,
            minuteOfDay = clockMinute.intValue,
            residents = Growth.residentsForDay(day),
            trees = Growth.propsForDay(day).count { it.kind == PropKind.TREE },
            previewing = previewOffset.intValue > 0,
            onLongPress = { previewOffset.intValue = (previewOffset.intValue + 1).coerceAtMost(120) },
            onTap = { previewOffset.intValue = 0 }
        )
    }
}

@Composable
private fun BoxScope.Hud(
    day: Int,
    minuteOfDay: Int,
    residents: Int,
    trees: Int,
    previewing: Boolean,
    onLongPress: () -> Unit,
    onTap: () -> Unit
) {
    val clock = "%02d:%02d".format(minuteOfDay / 60, minuteOfDay % 60)

    Column(
        modifier = Modifier
            .align(Alignment.TopStart)
            .statusBarsPadding()
            .padding(18.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0x55000000))
            .padding(horizontal = 14.dp, vertical = 10.dp)
            .pointerInput(Unit) {
                detectTapGestures(onLongPress = { onLongPress() }, onTap = { onTap() })
            },
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(
            text = "${day}日目",
            color = Color(0xFFFFF3D0),
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace
        )
        Text(
            text = clock,
            color = Color(0xFFBFD4F0),
            fontSize = 14.sp,
            fontFamily = FontFamily.Monospace
        )
    }

    Column(
        modifier = Modifier
            .align(Alignment.BottomStart)
            .navigationBarsPadding()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        Text(
            text = "住人 ${residents}人   木 ${trees}本",
            color = Color(0xCCBFD4F0),
            fontSize = 13.sp,
            fontFamily = FontFamily.Monospace
        )
        Text(
            text = if (previewing) "プレビュー中 — タップで今日に戻る" else "日付を長押しすると先の日を覗けます",
            color = if (previewing) Color(0xFFFFD98A) else Color(0x99BFD4F0),
            fontSize = 11.sp,
            fontFamily = FontFamily.Monospace
        )
    }
}
