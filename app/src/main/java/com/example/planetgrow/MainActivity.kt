package com.example.planetgrow

import android.graphics.Bitmap
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.example.planetgrow.core.Arrival
import com.example.planetgrow.core.BuildKind
import com.example.planetgrow.core.GameTime
import com.example.planetgrow.core.PlanetState
import com.example.planetgrow.core.Recipe
import com.example.planetgrow.core.Recipes
import com.example.planetgrow.core.Scene
import com.example.planetgrow.core.Sky
import com.example.planetgrow.core.SkyFall
import com.example.planetgrow.core.World
import com.example.planetgrow.core.alienOutcomeText
import com.example.planetgrow.core.animalFledText
import com.example.planetgrow.core.formatDuration
import com.example.planetgrow.core.skyFallLabel
import com.example.planetgrow.core.volcanoEruptedText
import com.example.planetgrow.core.volcanoSpawnedText
import java.time.Instant
import java.time.ZoneId

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 星空を画面のすみずみまで出したいので、システムバーの裏まで描く
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                var showTitle by remember { mutableStateOf(true) }
                if (showTitle) {
                    TitleScreen(onEnter = { showTitle = false })
                } else {
                    PlanetScreen(onGameOver = { showTitle = true })
                }
            }
        }
    }
}

/**
 * 時計表示用の「時:分」。GameTime.now() を渡せば、太陽の位置と同じ速さで進む
 * (デバッグで時間を早回ししているときも、表示時刻と太陽がずれない)。
 */
private fun minuteOfDayFor(zone: ZoneId, nowMillis: Long): Int {
    val zdt = Instant.ofEpochMilli(nowMillis).atZone(zone)
    return zdt.hour * 60 + zdt.minute
}

/** 地球のローカル時刻での「今日の進み具合」 (0.0 = 0:00, 0.5 = 12:00, 1.0 = 24:00)。 */
private fun localDayFraction(zone: ZoneId, nowMillis: Long): Float {
    val offsetSec = zone.rules.getOffset(Instant.ofEpochMilli(nowMillis)).totalSeconds
    val sec = Math.floorMod(nowMillis / 1000L + offsetSec, 86400L)
    val ms = Math.floorMod(nowMillis, 1000L)
    return ((sec * 1000L + ms).toDouble() / 86_400_000.0).toFloat()
}

/** 惑星が生まれてから何日目か。 */
private fun dayNumber(state: PlanetState, zone: ZoneId, nowMillis: Long): Int {
    val birth = Instant.ofEpochMilli(state.birthMillis).atZone(zone).toLocalDate()
    val today = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate()
    return (today.toEpochDay() - birth.toEpochDay() + 1L).coerceIn(1L, 100000L).toInt()
}

/** 描画フレームの時計。Compose の再コンポーズを起こさずに値を持ち回る。 */
private class FrameClock {
    var timeSec: Float = 0f
    var dt: Float = 1f / 60f
}

/**
 * 画面に少しのあいだ出すお知らせ。
 * 表示時間は人が読むためのものなので、GameTime (早回し) ではなく実時間で測る。
 */
private class Notice(val text: String, val untilRealMillis: Long)

@Composable
fun PlanetScreen(onGameOver: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val prefs = remember { PlanetPrefs(context) }
    val zone = remember { ZoneId.systemDefault() }
    val state = remember { prefs.load(GameTime.now()) }
    val world = remember { World(state) }
    val clock = remember { FrameClock() }

    // 状態が変わったら画面を組み直すための印
    var version by remember { mutableIntStateOf(0) }
    var minuteOfDay by remember { mutableIntStateOf(minuteOfDayFor(zone, GameTime.now())) }
    var notice by remember { mutableStateOf<Notice?>(null) }
    // 家畜が全滅したらゲームオーバー画面を出す
    var gameOver by remember { mutableStateOf(false) }
    // 表示待ちのお知らせ。1件ずつ、いま出ているものが消えたら次を出す
    val noticeQueue = remember { ArrayDeque<Pair<String, Long>>() }
    fun pushNotice(text: String, durationMillis: Long) {
        if (notice == null) {
            notice = Notice(text, System.currentTimeMillis() + durationMillis)
        } else {
            noticeQueue.addLast(text to durationMillis)
        }
    }
    var showBuildPanel by remember { mutableStateOf(false) }

    // 開いた時点で、閉じていた間の飛来・宇宙船の襲来・空腹での旅立ちをまとめて受け取る
    LaunchedEffect(Unit) {
        val now = GameTime.now()
        val arrivals = state.advanceTo(now)
        val alienEvents = state.pendingAlienEvents.toList()
        state.pendingAlienEvents.clear()
        val eruptions = state.pendingEruptions.toList()
        state.pendingEruptions.clear()
        val flees = state.pendingFlees.toList()
        state.pendingFlees.clear()
        world.syncFromState(now)
        eruptions.lastOrNull()?.let { world.eruptVolcano(it) }
        alienEvents.lastOrNull { it.abductedAngleDeg != null }?.abductedAngleDeg?.let { world.startAbduction(it) }
        flees.lastOrNull()?.let { world.startFleeing(it.angleDeg, it.dist, it.variant) }
        prefs.save(state)
        if (state.isGameOver()) gameOver = true

        if (arrivals.isNotEmpty()) {
            for (a in arrivals.takeLast(4)) world.addFalling(a.kind, a.angleDeg, a.amount)
            val shown = arrivals.takeLast(8)
            if (arrivals.size > shown.size) {
                pushNotice("留守の間に${arrivals.size}回の飛来がありました", 2600L)
            }
            for (a in shown) pushNotice(arrivalDigestText(a, zone), 2600L)
        }
        for (e in alienEvents) pushNotice(alienOutcomeText(e), 3600L)
        if (eruptions.isNotEmpty()) pushNotice(volcanoEruptedText(), 3600L)
        for (fl in flees) pushNotice(animalFledText(), 3200L)
        version++
    }

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF05070F))
    ) {
        val widthPx = constraints.maxWidth.coerceAtLeast(1)
        val heightPx = constraints.maxHeight.coerceAtLeast(1)

        val viewBlocks = remember(version) { Scene.viewBlocksFor(state, GameTime.now()) }
        val blockPx = remember(viewBlocks) { Scene.blockPxFor(viewBlocks) }
        val bufferSize = remember(widthPx, heightPx, viewBlocks, blockPx) {
            Scene.bufferSize(widthPx, heightPx, viewBlocks, blockPx)
        }
        val scene = remember(bufferSize[0], bufferSize[1], blockPx) {
            Scene(bufferSize[0], bufferSize[1], blockPx)
        }
        val bitmap = remember(scene) {
            Bitmap.createBitmap(scene.width, scene.height, Bitmap.Config.ARGB_8888)
        }
        val image = remember(bitmap) { bitmap.asImageBitmap() }
        val frameTick = remember { mutableLongStateOf(0L) }
        // いま見ている天体 (-1 = 惑星, 0.. = 衛星)。タップで移る。
        val focusState = remember { mutableIntStateOf(Scene.FOCUS_PLANET) }

        // 1 フレームごとに時間を進める
        LaunchedEffect(Unit) {
            var startNanos = 0L
            var prevNanos = 0L
            var frames = 0
            var lastViewBlocks = Scene.viewBlocksFor(state, GameTime.now())
            while (true) {
                val now = withFrameNanos { it }
                if (startNanos == 0L) startNanos = now
                val dt = if (prevNanos == 0L) 0f
                else ((now - prevNanos) / 1_000_000_000.0).toFloat().coerceIn(0f, 0.1f)
                prevNanos = now
                clock.dt = dt
                clock.timeSec = ((now - startNanos) / 1_000_000_000.0).toFloat()

                val nowMs = GameTime.now()
                val sky = Sky(localDayFraction(zone, nowMs), nowMs)
                world.update(dt, sky.sunDirX, sky.sunDirY)

                frames++
                if (frames % 30 == 0) {
                    // 飛来や、できあがりがないか見る
                    val placedBefore = state.placed.size
                    val arrivals = state.advanceTo(nowMs)
                    if (!gameOver && state.isGameOver()) {
                        gameOver = true
                        prefs.save(state)
                    }
                    val alienEvents = state.pendingAlienEvents.toList()
                    state.pendingAlienEvents.clear()
                    val eruptions = state.pendingEruptions.toList()
                    state.pendingEruptions.clear()
                    val flees = state.pendingFlees.toList()
                    state.pendingFlees.clear()
                    if (arrivals.isNotEmpty()) {
                        for (a in arrivals) world.addFalling(a.kind, a.angleDeg, a.amount)
                        for (a in arrivals) pushNotice(arrivalDigestText(a, zone), 2600L)
                        prefs.save(state)
                        version++
                    }
                    if (alienEvents.isNotEmpty()) {
                        world.syncFromState(nowMs)
                        alienEvents.lastOrNull { it.abductedAngleDeg != null }?.abductedAngleDeg
                            ?.let { world.startAbduction(it) }
                        for (e in alienEvents) pushNotice(alienOutcomeText(e), 3600L)
                        prefs.save(state)
                        version++
                    }
                    if (eruptions.isNotEmpty()) {
                        world.syncFromState(nowMs)
                        world.eruptVolcano(eruptions.last())
                        pushNotice(volcanoEruptedText(), 3600L)
                        prefs.save(state)
                        version++
                    }
                    if (flees.isNotEmpty()) {
                        world.syncFromState(nowMs)
                        flees.lastOrNull()?.let { world.startFleeing(it.angleDeg, it.dist, it.variant) }
                        for (fl in flees) pushNotice(animalFledText(), 3200L)
                        prefs.save(state)
                        version++
                    }
                    if (state.placed.size != placedBefore) {
                        val done = state.placed.last()
                        world.syncFromState(nowMs)
                        // PET・VOLCANO は「つくる」のレシピが無い (自動で出現する) ので別扱い
                        val doneText = when (done.kind) {
                            BuildKind.PET -> "ペットがうまれました"
                            BuildKind.VOLCANO -> volcanoSpawnedText()
                            else -> Recipes.of(done.kind).doneText
                        }
                        pushNotice(doneText, 7000L)
                        prefs.save(state)
                        version++
                    }
                    // 地殻変動で大きくなったり、衛星が生まれたりしたら組み直す
                    val vb = Scene.viewBlocksFor(state, nowMs)
                    if (vb != lastViewBlocks) {
                        lastViewBlocks = vb
                        version++
                    }
                    world.syncFromState(nowMs)

                    val mod = minuteOfDayFor(zone, nowMs)
                    if (mod != minuteOfDay) minuteOfDay = mod
                    notice?.let {
                        if (System.currentTimeMillis() > it.untilRealMillis) {
                            notice = noticeQueue.removeFirstOrNull()
                                ?.let { (text, dur) -> Notice(text, System.currentTimeMillis() + dur) }
                        }
                    }
                }
                frameTick.longValue = now
            }
        }

        Canvas(
            Modifier
                .fillMaxSize()
                .pointerInput(scene) {
                    detectTapGestures { offset ->
                        val fx = offset.x / size.width.toFloat()
                        val fy = offset.y / size.height.toFloat()
                        val hit = scene.bodyAtFraction(state, GameTime.now(), fx, fy)
                        if (hit != Scene.FOCUS_NONE) focusState.intValue = hit
                    }
                }
        ) {
            val tick = frameTick.longValue
            scene.focus = focusState.intValue
            if (tick >= 0L) {
                val nowMs = GameTime.now()
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

        val nowMs = GameTime.now()
        Hud(
            state = state,
            day = dayNumber(state, zone, nowMs),
            minuteOfDay = minuteOfDay,
            nowMillis = nowMs,
            notice = notice?.text,
            focus = focusState.intValue,
            onOpenBuild = { showBuildPanel = true }
        )

        if (showBuildPanel) {
            BuildPanel(
                state = state,
                nowMillis = nowMs,
                onClose = { showBuildPanel = false },
                onBuild = { recipe ->
                    val t = GameTime.now()
                    if (state.startBuild(recipe, t)) {
                        world.syncFromState(t)
                        prefs.save(state)
                        version++
                        notice = Notice("${recipe.label}をはじめました", System.currentTimeMillis() + 6000L)
                        showBuildPanel = false
                    }
                }
            )
        }

        if (gameOver) {
            GameOverOverlay(day = dayNumber(state, zone, nowMs)) {
                prefs.save(PlanetState.newPlanet(GameTime.now()))
                onGameOver()
            }
        }
    }
}

/** 「○時○分、○○が飛来」形式の、1件ぶんのダイジェスト文。 */
private fun arrivalDigestText(a: Arrival, zone: ZoneId): String {
    val zdt = Instant.ofEpochMilli(a.atMillis).atZone(zone)
    return "%02d時%02d分、%sが飛来 (%s+%d)".format(
        zdt.hour, zdt.minute,
        skyFallLabel(a.kind),
        com.example.planetgrow.core.resourceLabel(a.kind.resource), a.amount
    )
}

@Composable
private fun BoxScope.Hud(
    state: PlanetState,
    day: Int,
    minuteOfDay: Int,
    nowMillis: Long,
    notice: String?,
    focus: Int,
    onOpenBuild: () -> Unit
) {
    val clockText = "%02d:%02d".format(minuteOfDay / 60, minuteOfDay % 60)

    // 左上: 日数と時刻と惑星の育ち具合
    Column(
        modifier = Modifier
            .align(Alignment.TopStart)
            .statusBarsPadding()
            .padding(16.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0x55000000))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(
            text = "${day}日目",
            color = Color(0xFFFFF3D0),
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace
        )
        Text(
            text = clockText,
            color = Color(0xFFBFD4F0),
            fontSize = 13.sp,
            fontFamily = FontFamily.Monospace
        )
        if (state.stillGrowing(nowMillis)) {
            Text(
                text = "惑星が育つまで " + formatDuration(state.nextGrowthInMillis(nowMillis)),
                color = Color(0x99BFD4F0),
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace
            )
        }
        val sats = state.satellites(nowMillis)
        for (sat in sats) {
            val grown = (sat.growth(nowMillis) * 100f).toInt()
            val here = if (focus == sat.index) "◆ " else ""
            Text(
                text = here + if (sat.bridged) "衛星${sat.index + 1} 橋でつながった"
                else if (sat.habitable(nowMillis)) "衛星${sat.index + 1} 人が住める"
                else "衛星${sat.index + 1} 育ち ${grown}%",
                color = if (sat.habitable(nowMillis)) Color(0xFF9BD46A) else Color(0x99BFD4F0),
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace
            )
        }
        if (sats.isNotEmpty()) {
            Text(
                text = if (focus >= 0) "惑星をタップで戻る" else "衛星をタップで移動",
                color = Color(0x99FFE9A8),
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace
            )
        }
    }

    // 右上: 資源
    Column(
        modifier = Modifier
            .align(Alignment.TopEnd)
            .statusBarsPadding()
            .padding(16.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0x55000000))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.End,
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        ResourceRow("鉱石", state.mineral, Color(0xFFD9B08C))
        ResourceRow("たね", state.seed, Color(0xFF9BD46A))
        ResourceRow("氷", state.ice, Color(0xFFAEE6FF))
        if (state.countOf(BuildKind.FARM) > 0 || state.countOf(BuildKind.ANIMAL) > 0) {
            ResourceRow("作物", state.crop.toInt(), Color(0xFFF0D874))
        }
        if (state.rareItem > 0) {
            ResourceRow("レア卵", state.rareItem, Color(0xFFCDA8FF))
        }
        Text(
            text = "次の飛来 " + formatDuration(
                SkyFall.nextArrival(nowMillis, state.birthMillis).atMillis - nowMillis
            ),
            color = Color(0x99BFD4F0),
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace
        )
    }

    // 下: 知らせ・建設中のもの・つくる
    Column(
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .navigationBarsPadding()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (notice != null) {
            HudLine(notice, Color(0xFFFFE9A8), Color(0x77000000))
        }
        if (state.animalsHungry(nowMillis)) {
            HudLine("生きものがおなかをすかせています", Color(0xFFFFB0A0), Color(0x88401010))
        } else if (state.needsFarm(nowMillis)) {
            HudLine("畑をつくって生きものを養いましょう", Color(0xFFFFE9A8), Color(0x77000000))
        }
        for (job in state.jobs) {
            // PET は「つくる」のレシピが無い (レア卵から自動でうまれる) ので別扱い
            val label = if (job.kind == BuildKind.PET) "レア卵がかえる" else Recipes.of(job.kind).label
            HudLine(
                "$label  あと${formatDuration(job.endMillis - nowMillis)}",
                Color(0xCCBFD4F0),
                Color(0x55000000)
            )
        }
        Text(
            text = "つ く る",
            color = Color(0xFF0B1020),
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFFE9D9A8))
                .clickable { onOpenBuild() }
                .padding(horizontal = 28.dp, vertical = 12.dp)
        )
    }
}

@Composable
private fun HudLine(text: String, color: Color, background: Color) {
    Text(
        text = text,
        color = color,
        fontSize = 12.sp,
        fontFamily = FontFamily.Monospace,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(background)
            .padding(horizontal = 12.dp, vertical = 5.dp)
    )
}

@Composable
private fun ResourceRow(label: String, count: Int, color: Color) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            color = color,
            fontSize = 12.sp,
            fontFamily = FontFamily.Monospace
        )
        Text(
            text = "$count",
            color = Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace
        )
    }
}

@Composable
private fun BuildPanel(
    state: PlanetState,
    nowMillis: Long,
    onClose: () -> Unit,
    onBuild: (Recipe) -> Unit
) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xAA000000))
            .clickable { onClose() }
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(12.dp)
                .widthIn(max = 520.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xF0101828))
                .padding(18.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "なにを つくる？",
                    color = Color(0xFFFFF3D0),
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
                Text(
                    text = "とじる",
                    color = Color(0xFF9FB4D8),
                    fontSize = 13.sp,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.clickable { onClose() }
                )
            }
            Text(
                text = "手持ち  鉱石${state.mineral}  たね${state.seed}  氷${state.ice}",
                color = Color(0xFFBFD4F0),
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace
            )
            for (recipe in Recipes.all) {
                val enabled = state.canBuild(recipe, nowMillis)
                val reason = when {
                    enabled -> null
                    !state.hasResourcesFor(recipe) -> "材料が足りない"
                    recipe.kind == BuildKind.BRIDGE -> "つなげる衛星がまだない"
                    else -> "置く場所がない"
                }
                RecipeRow(recipe, enabled, reason, onBuild)
            }
            Text(
                text = "※ 作りはじめると、できあがるまで実時間で待ちます",
                color = Color(0x88BFD4F0),
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}

@Composable
private fun RecipeRow(recipe: Recipe, enabled: Boolean, reason: String?, onBuild: (Recipe) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(if (enabled) Color(0x22FFFFFF) else Color(0x11FFFFFF))
            .clickable(enabled = enabled) { onBuild(recipe) }
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = recipe.label,
                color = if (enabled) Color(0xFFFFF3D0) else Color(0x66FFF3D0),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
            Text(
                text = reason ?: recipe.note,
                color = if (reason != null) Color(0xFFD08A8A) else Color(0x99BFD4F0),
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace
            )
        }
        Column(
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = recipe.costText(),
                color = if (enabled) Color(0xFF9BD46A) else Color(0xFFD08A8A),
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace
            )
            Text(
                text = formatDuration(recipe.durationMillis),
                color = Color(0x99BFD4F0),
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}

@Composable
private fun GameOverOverlay(day: Int, onRestart: () -> Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xCC000000))
            .clickable {},
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 420.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(Color(0xF0101828))
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                text = "ゲームオーバー",
                color = Color(0xFFFFB0A0),
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
            Text(
                text = "家畜が1頭もいなくなってしまいました\n${day}日目、惑星はさびしくなってしまいました",
                color = Color(0xFFBFD4F0),
                fontSize = 13.sp,
                fontFamily = FontFamily.Monospace,
                textAlign = TextAlign.Center
            )
            Text(
                text = "はじめから",
                color = Color(0xFF0B1020),
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFFE9D9A8))
                    .clickable { onRestart() }
                    .padding(horizontal = 28.dp, vertical = 12.dp)
            )
        }
    }
}
