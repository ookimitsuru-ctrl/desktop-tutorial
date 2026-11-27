package jp.okracing.game

import android.content.Context
import android.graphics.Bitmap
import jp.okracing.core.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.*

// ゲーム全体の進行 (Web 版 src/main.js と src/ui.js の移植)
// タイトル → メニュー → 設定 → 走行 → ポーズ / 結果 / 講評。メニューの背景ではデモ走行を流す。

class ModeInfo(val name: String, val en: String, val desc: String)
val MODES = linkedMapOf(
    "free" to ModeInfo("フリー走行", "FREE PRACTICE", "サーキットを自由に走行。セッティングやタイヤを試せます。"),
    "ta" to ModeInfo("タイムアタック", "TIME ATTACK", "ベストラップに挑戦。ゴーストと競えます。"),
    "train" to ModeInfo("トレーニング", "TRAINING", "お手本ゴーストと目標ギヤ・速度、トレーナーの助言で区間を繰り返し練習。"),
    "quali" to ModeInfo("予選", "QUALIFYING", "アタック3周のベストタイムで決勝グリッドを決定。"),
    "race" to ModeInfo("決勝", "GRAND PRIX", "20台でのレース。タイヤ摩耗とピット戦略が鍵。"),
)
private val TYRE_IDS = listOf("soft", "medium", "hard", "rain")
private fun f3(v: Double) = String.format(Locale.US, "%.3f", v)
private fun f2(v: Double) = String.format(Locale.US, "%.2f", v)

class Game(context: Context) {
    val variant = Variant(Json.parse(context.assets.open("variant.json").bufferedReader(Charsets.UTF_8).readText()).obj())
    val defs: List<TrackDef> = TrackDef.parseAll(context.assets.open("tracks.json").bufferedReader(Charsets.UTF_8).readText())
    private val trackIds = defs.map { it.id }
    val accent = (if (variant.id == "original") "#2fb3e3" else "#f47a1f").also { C_OR = it }
    val store = Store(context, variant.storageKey, trackIds[0])
    var T: Track; var line: RacingLine
    val R: Renderer
    val hud = Hud()
    var cfg: Settings = store.settings()
    val input = Input()
    val audio = GameAudio()
    val ui = UiRoot().also { it.accent = accent }

    var state = "title"
    var session: Session? = null; private var demo: Session? = null; private var demoDrv: Driver? = null
    private var lastOpts: SessionOpts? = null; var layout: Layout? = null
    private var resultsTimer = 0.0; private var reviewT = 0.0; private var autoT = 0.0
    private var assistKey = ""; private val menuStack = ArrayList<String>()
    var screen: String? = "title"; private var scrCtx: Map<String, Any?> = emptyMap()
    private var lastReviewCtx: Map<String, Any?> = emptyMap()
    private var gridPos = 0
    var w = 0.0; var h = 0.0; var dpr = 1.0; var safe = Safe()
    // 60fps を目標とした自動負荷調整 (画質「自動」のとき)
    var dprCap = 2.5; private var perfLow = false; private var perfAcc = 0.0; private var perfN = 0; private var perfLevel = 0
    var onResolution: (() -> Unit)? = null
    private var showcase: Bitmap? = null; private var showcaseKey = ""
    private var titleT = 0.0

    init {
        applyVariantTeams(variant)
        val l = store.last()
        val id = if (l.track in trackIds) l.track else trackIds[0]
        store.currentTrack = id
        T = Track(defs.first { it.id == id }); line = computeRacingLine(T)
        R = Renderer(T, line)
        input.onShift = { dir -> onShift(dir) }
        input.onButton = { id2 -> onButton(id2) }
        startDemo()
    }
    private fun curDef() = T.def

    // ---------------------------------------------------------------- 画面サイズ
    fun resize(w: Double, h: Double, dpr: Double, safe: Safe) {
        this.w = w; this.h = h; this.dpr = dpr; this.safe = safe
        R.resize(w, h, dpr)
        layout = Layout(w, h, safe); input.layout = layout
    }
    /** 描画解像度の上限 (dp あたりのピクセル数) */
    fun dprLimit(): Double = if (cfg.quality == "low") 1.5 else if (cfg.quality == "high") 3.0 else dprCap

    private fun loadTrack(id: String) {
        if (id == T.id || id !in trackIds) return
        store.currentTrack = id
        T = Track(defs.first { it.id == id }); line = computeRacingLine(T)
        R.setTrack(T, line)
        val l = store.last(); l.track = id; store.saveLast(l)
        session = null; demo = null; lastOpts = null; assistKey = ""
    }

    // ---------------------------------------------------------------- デモ走行 (メニュー背景)
    private fun startDemo() {
        val d = Session(T, line, SessionOpts(mode = "race", laps = 99, weather = "dry", setup = "mid", tyre = "medium", difficulty = "hard", damage = false, grid = DRIVERS.indices.toList()))
        d.env.noWear = true; d.env.noFuel = true
        d.state = "green"; d.stateT = 10.0; d.lightsOut = false
        d.entries.forEach { it.started = true }
        demo = d; demoDrv = Driver(d.player.car, T, line, skill = 0.9)
        R.clearEffects(); R.cam.init = false
    }
    private fun tickDemo(dt: Double) {
        val d = demo ?: return; val pl = d.player
        demoDrv!!.update(1.0 / 60, d.wet, d.cars, DriveInfo())
        d.playerInput.throttle = pl.car.throttle; d.playerInput.brake = pl.car.brake
        pl.pitRequest = false
        d.update(dt); d.events.clear()
    }

    // ---------------------------------------------------------------- セッション開始
    private fun buildGrid(mode: String): List<Int> {
        val idx = DRIVERS.indices.filter { !DRIVERS[it].player }.toMutableList()
        val q = store.quali()
        if (mode == "quali" && q != null && q.grid.size == DRIVERS.size) return q.grid
        idx.sortBy { estimateQualiTime(DRIVERS[it], TEAMS[DRIVERS[it].team], cfg.difficulty, 0.0) }
        val pos = if (mode == "pole") 0 else if (mode == "last") idx.size else 9
        idx.add(pos, 0)
        return idx
    }
    internal fun startSession(mode: String, keep: Boolean = false) {
        val l = store.last()
        cfg = store.settings(); applyInputCfg()
        val prev = lastOpts
        val opts = if (keep && prev != null) SessionOpts(prev.mode, prev.laps, prev.weather, prev.setup, prev.tyre, prev.difficulty, prev.damage, prev.assist, prev.autoShift, prev.grid, prev.qualiLaps, null, null, null, prev.trainSection)
        else SessionOpts(mode = mode, laps = l.laps, weather = l.weather, setup = l.setup, tyre = l.tyre, difficulty = cfg.difficulty, damage = cfg.damage, assist = cfg.assist, autoShift = cfg.autoShift, qualiLaps = 3, grid = if (mode == "race") buildGrid(l.gridMode) else null)
        if (opts.mode == "train") {
            val W = WEATHERS[opts.weather] ?: WEATHERS["dry"]!!
            opts.damage = false; opts.trainSection = store.last().trainSec
            opts.reference = buildReference(T, line, opts.setup, opts.tyre, W.wet)
        }
        lastOpts = opts
        val S = Session(T, line, opts)
        if (opts.mode == "ta") { val g = store.loadGhost(S.wet > 0.15); S.ghost = g; S.bestTrace = g?.trace }
        gridPos = opts.grid?.let { it.indexOf(0) + 1 } ?: 0
        session = S; demo = null
        hud.reset(); R.clearEffects(); R.cam.init = false; input.reset()
        input.showPit = opts.mode == "race" || opts.mode == "free"
        input.showReset = opts.mode != "train"; input.showRetry = opts.mode == "train"; input.showTrain = opts.mode == "train"; input.enabled = true
        assistKey = ""; updateAssist()
        hideUi(); state = "drive"; resultsTimer = 0.0; reviewT = 0.0; autoT = 0.0
        audio.init()
        if (opts.mode != "race" && opts.mode != "train") hud.message(MODES[opts.mode]!!.name, "#ffb347", 2.2, true)
    }
    private fun updateAssist() {
        val S = session ?: return
        val c = S.player.car; val key = "${c.tyre.id}|${c.setup.id}|${jsRound(S.wet * 12)}"
        if (key == assistKey) return; assistKey = key
        val prof = speedProfile(T, line, ProfileParams(mu = tyreBaseMu(c.tyre, S.wet), use = 0.94, cla = c.setup.cla, cda = c.setup.cda, mass = totalMass(c), power = 1.0, brake = 0.8))
        R.setAssist(prof)
    }
    private fun applyInputCfg() { input.accelRight = cfg.pedalAccelRight; input.holdOnRelease = cfg.pedalRelease == "hold"; audio.setVolume(cfg.volume) }

    // ---------------------------------------------------------------- 画面遷移
    internal fun show(name: String, ctx: Map<String, Any?> = emptyMap()) { screen = name; scrCtx = ctx; ui.resetScroll() }
    private fun hideUi() { screen = null }
    private fun toMenu() { session = null; state = "menu"; audio.silence(); if (demo == null) startDemo(); menuStack.clear(); show("menu") }
    private fun backScreen() { show(menuStack.removeLastOrNull() ?: "menu") }
    private fun pause() { if (state != "drive") return; state = "pause"; audio.silence(); input.enabled = false; input.reset(); show("pause", mapOf("mode" to session!!.mode)) }
    private fun resume() { if (state != "pause") return; state = "drive"; input.enabled = true; hideUi() }
    fun onPauseApp() { if (state == "drive") pause(); audio.setMuted(true); audio.stop() }
    fun onResumeApp() { audio.setMuted(false); if (audio.ready) audio.init() }
    /** 戻るキー。処理したら true */
    fun back(): Boolean {
        if (state == "drive") { pause(); return true }
        if (state == "pause") { if (screen == "settings") { show("pause", mapOf("mode" to session!!.mode)); return true }; resume(); return true }
        if (state == "results" || state == "review") { toMenu(); return true }
        if (state == "menu" && screen != null && screen != "menu") { backScreen(); return true }
        if (state == "menu" && screen == "menu") { state = "title"; show("title"); return true }
        return false
    }

    private fun click() { audio.init(); audio.click() }
    private fun setSetting(k: String, v: Any) {
        val s = store.settings(); s.set(k, v); store.saveSettings(s); settingsChanged(s)
    }
    private fun settingsChanged(s: Settings) {
        cfg = s; applyInputCfg(); onResolution?.invoke()
        session?.let { val c = it.player.car; c.assistTC = s.assist; c.assistABS = s.assist; c.autoShift = s.autoShift; it.env.noDamage = !s.damage }
    }
    private fun setOption(k: String, v: Any) {
        val l = store.last(); l.set(k, v); store.saveLast(l); optionChanged(k, v)
    }
    private fun optionChanged(k: String, v: Any) {
        val S = session ?: return
        if (state == "pause" && S.mode == "train") {
            val tr = S.trainer!!
            if (k == "trainSec") { tr.setSection(v as Int); lastOpts?.trainSection = v; tr.restart(); return }
            when (k) { "setup" -> S.changeConfig(v as String, null); "tyre" -> S.changeConfig(null, v as String); "weather" -> S.setWeather(v as String); else -> return }
            val l = store.last(); lastOpts?.let { o -> when (k) { "setup" -> o.setup = v as String; "tyre" -> o.tyre = v as String; "weather" -> o.weather = v as String } }
            tr.setReference(buildReference(T, line, l.setup, l.tyre, S.wet)); tr.restart(); assistKey = ""; updateAssist()
            return
        }
        if (state == "pause" && S.mode == "free") {
            when (k) { "setup" -> S.changeConfig(v as String, null); "tyre" -> S.changeConfig(null, v as String); "weather" -> S.setWeather(v as String) }
            lastOpts?.let { o -> when (k) { "setup" -> o.setup = v as String; "tyre" -> o.tyre = v as String; "weather" -> o.weather = v as String } }
            assistKey = ""; updateAssist()
        }
    }

    // ---------------------------------------------------------------- トレーニング
    private fun trainRestart() {
        val S = session ?: return; if (S.mode != "train") return
        hideUi(); state = "drive"; input.enabled = true; input.reset(); autoT = 0.0; reviewT = 0.0
        hud.reset(); R.clearEffects(); R.cam.init = false; assistKey = ""
        S.trainer!!.restart(); lastOpts?.trainSection = S.trainer!!.secIdx
    }
    private fun showTrainReview() {
        val S = session ?: return; val rep = S.trainer!!.report ?: return
        state = "review"; audio.silence(); input.enabled = false; input.reset()
        if (!rep.aborted) store.addTrainBest(rep.secId, rep)
        autoT = if (cfg.trainAuto) 7.0 else 0.0
        lastReviewCtx = mapOf("report" to rep, "auto" to (autoT > 0))
        show("trainReview", lastReviewCtx)
        if (!rep.aborted) { if (rep.stars >= 4) audio.best() else audio.good() } else audio.bad()
    }

    // ---------------------------------------------------------------- 入力イベント
    private fun onShift(dir: Int) {
        val S = session ?: return; if (state != "drive") return
        if (S.player.car.autoShift && S.player.car.gear > 0 && dir > 0) return
        if (S.shift(dir)) audio.shift() else audio.denied()
    }
    private fun onButton(id: String) {
        if (id == "pause") { if (state == "drive") pause() else if (state == "pause") resume(); return }
        val S = session ?: return; if (state != "drive") return
        val pl = S.player
        if (S.mode == "train") {
            if (id == "retry" || id == "reset") { audio.click(); trainRestart(); return }
            if (id == "tr0" || id == "tr1" || id == "tr2") {
                when (id) { "tr0" -> cfg.trainAuto = !cfg.trainAuto; "tr1" -> cfg.trainGuide = !cfg.trainGuide; else -> cfg.ghost = !cfg.ghost }
                store.saveSettings(cfg); audio.click(); return
            }
        }
        if (id == "pit" && input.showPit) {
            if (pl.pit != null) return
            pl.pitRequest = !pl.pitRequest; audio.click()
            if (pl.pitRequest) hud.message("ピットイン予約", "#ffb347", 1.6)
        } else if (id.startsWith("tyre")) {
            if (input.showPit && (pl.pitRequest || pl.pit != null)) { pl.nextTyre = TYRE_IDS[id.substring(4).toInt()]; audio.click() }
        } else if (id == "reset") {
            if (pl.pit != null || pl.finished || S.state != "green") return
            if (pl.car.speed > 14) { hud.message("減速してから復帰できます", "#ffd23a", 1.4); return }
            if (pl.car.retired && S.mode != "race" && S.mode != "quali") S.repairAndReset(pl) else S.resetToTrack(pl)
            R.lastWheel.clear()
        }
    }

    // ---------------------------------------------------------------- セッションイベント
    private fun today() = SimpleDateFormat("yyyy/M/d", Locale.JAPAN).format(Date())
    private fun handleEvents() {
        val S = session ?: return; val pl = S.player; val wetClass = S.wet > 0.15
        for (ev in S.events) {
            when (ev.type) {
                "light" -> audio.light()
                "go" -> { audio.go(); if (S.mode == "race") hud.message("GO!", "#3fe07f", 1.3, true) }
                "lap" -> {
                    if (S.mode == "train") continue
                    val col = if (!ev.valid) "#ffd23a" else if (ev.sb || ev.pb) "#d58cff" else "#fff"
                    hud.lapFlash = Flash(ev.time, col, hud.t); hud.secFlash = arrayOfNulls(3)
                    if (ev.valid) {
                        val isRec = store.addLap(LapRecord(ev.time, pl.car.tyre.id, pl.car.setup.id, wetClass, MODES[S.mode]!!.name, today()))
                        if (isRec) { hud.message("新記録！ ${fmtTime(ev.time)}", "#d58cff", 3.0, true); audio.best() }
                        else if (ev.pb) { hud.message("自己ベスト ${fmtTime(ev.time)}", "#3fe07f", 2.6); audio.good() }
                        else hud.message(fmtTime(ev.time), "#fff", 2.2)
                        val ng = S.newGhost
                        if (ng != null && S.mode == "ta") { val g = store.loadGhost(wetClass); if (g == null || ng.lap < g.lap) store.saveGhost(ng, wetClass); S.newGhost = null }
                    } else hud.message("${fmtTime(ev.time)} (無効)", "#ffd23a", 2.2)
                    if (S.mode == "race" && S.laps - pl.lap == 0 && !S.leaderFinished) hud.message("ファイナルラップ", "#fff", 2.5, true)
                }
                "sector" -> {
                    if (S.mode == "train") continue
                    var col = "#f2c230"
                    if (ev.valid) { val rec = store.addSector(ev.k, ev.time, wetClass); col = if (rec) "#d58cff" else if (ev.pb || ev.best == ev.time) "#3fe07f" else "#f2c230" }
                    hud.secFlash[ev.k] = Flash(ev.time, col, hud.t)
                }
                "invalid" -> { if (S.mode == "train") continue; hud.message("コースアウト — このラップは無効", "#ffd23a", 2.0); audio.bad() }
                "crash" -> if (ev.e === pl) audio.crash(ev.v)
                "contact" -> audio.crash(ev.v * 0.6)
                "penalty" -> { hud.message(ev.text, "#ff5a4a", 3.0); audio.bad() }
                "pitin" -> hud.message("ピットイン", "#ffb347", 2.0)
                "pitstop" -> audio.shift()
                "pitout" -> { hud.message("タイヤ交換完了: ${pl.car.tyre.name}", "#3fe07f", 2.4); audio.good(); assistKey = "" }
                "retire" -> if (ev.e === pl) { hud.message("リタイア", "#ff5a4a", 3.0, true); audio.bad() } else if (S.mode == "race") hud.message("${ev.e!!.d.name} リタイア", "#ffd23a", 2.0)
                "flag" -> if (ev.e !== pl) hud.message("トップがチェッカー — この周でフィニッシュ", "#fff", 3.0)
                "finish" -> { hud.message("チェッカーフラッグ  ${pl.pos}位", "#ffb347", 4.0, true); audio.best() }
                "fastest" -> hud.message("ファステストラップ ${ev.e!!.d.name} ${fmtTime(ev.time)}", "#d58cff", 2.4)
                "weather" -> hud.message(if (ev.rain > 0.2) "雨が降り始めた" else "雨が上がった", "#7fd6ff", 3.5, true)
                "reset" -> hud.message("コースへ復帰", "#fff", 1.4)
                "results" -> resultsTimer = 0.01
                "trainreport" -> reviewT = 0.8
                "traincue" -> if (ev.sev == "urgent") audio.blip(1250.0, 0.08, 0.2, "square") else if (ev.sev == "good") audio.good() else audio.blip(700.0, 0.07, 0.12, "triangle")
            }
        }
        S.events.clear()
    }
    private fun showResults() {
        val S = session ?: return; state = "results"; audio.silence(); input.enabled = false
        if (S.mode == "race") {
            val me = S.results.first { it.player }
            store.addRace(RaceRecord(today(), S.laps, S.opts.weather, gridPos, me.pos, me.dnf, me.best))
        } else if (S.mode == "quali") {
            val me = S.results.first { it.player }
            store.saveQuali(QualiRecord(S.qualiResult!!, me.pos, me.best))
        }
        show("results")
    }

    // ---------------------------------------------------------------- メインループ (dt 秒ごとに 1 回)
    fun frame(ctx: Ctx2D, dt0: Double) {
        val dt = min(dt0, 0.1); if (dt <= 0) return
        val S = session
        ui.pending?.let { ui.pending = null; click(); it() }
        if (state == "drive" && S != null) {
            input.showTyres = input.showPit && (S.player.pitRequest || (S.player.pit != null && S.player.pit!!.state != "out"))
            input.update(dt)
            S.playerInput.throttle = input.throttle.pow(1.25); S.playerInput.brake = input.brake
            S.update(dt)
            handleEvents(); updateAssist()
            R.updateEffects(S, dt)
            R.updateCamera(S.player.car.x, S.player.car.y, S.player.car.yaw, S.player.car.speed, cfg.camera, cfg.zoom, dt)
            R.render(ctx, S, rcfg(), dt)
            if (cfg.quality == "auto") {
                perfAcc += dt; perfN++
                if (perfN >= 180) {
                    val avg = perfAcc / perfN; perfAcc = 0.0; perfN = 0
                    if (avg > 1.0 / 50 && perfLevel < 3) { perfLevel++; if (perfLevel == 1) dprCap = 1.75 else if (perfLevel == 2) perfLow = true else dprCap = 1.25; onResolution?.invoke() }
                }
            }
            ctx.setTransform(dpr, 0.0, 0.0, dpr, 0.0, 0.0)
            hud.draw(ctx, layout!!, S, input, cfg, R, dt)
            audio.update(S, R.cam.rot)
            if (resultsTimer > 0) { resultsTimer += dt; if (resultsTimer > 1.2) { resultsTimer = 0.0; showResults() } }
            if (reviewT > 0) { reviewT -= dt; if (reviewT <= 0) { reviewT = 0.0; showTrainReview() } }
        } else if ((state == "pause" || state == "results" || state == "review") && S != null) {
            R.render(ctx, S, rcfg(), 0.0)
            if (state == "review" && autoT > 0) { autoT -= dt; if (autoT <= 0) trainRestart() }
        } else {
            if (demo == null) startDemo()
            tickDemo(dt)
            val d = demo!!
            val tgt = d.order[min(2, d.order.size - 1)].car
            R.updateEffects(d, dt)
            R.updateCamera(tgt.x, tgt.y, tgt.yaw, 40.0, "north", "normal", dt)
            R.render(ctx, d, Renderer.Cfg(quality = effQuality(), lineAssist = false, ghost = cfg.ghost), dt)
        }
        // メニュー
        ctx.setTransform(dpr, 0.0, 0.0, dpr, 0.0, 0.0)
        val sc = screen
        if (sc != null) { if (sc == "title") drawTitle(ctx, dt) else ui.drawScreen(ctx, buildScreen(sc), w, h, safe) }
    }
    private fun effQuality() = if (cfg.quality == "auto" && perfLow) "low" else cfg.quality
    /** 描画用の設定。コース上の走行ラインはフリー走行とトレーニングだけで表示する */
    private fun rcfg(): Renderer.Cfg {
        val guide = session?.mode == "free" || session?.mode == "train"
        return Renderer.Cfg(quality = effQuality(), lineAssist = guide && cfg.lineAssist, ghost = cfg.ghost)
    }

    // ---------------------------------------------------------------- タッチ
    fun touchDown(id: Int, x: Double, y: Double) {
        if (screen == "title") { titleTap(); return }
        if (screen != null) { if (id == 0) ui.down(x, y); return }
        if (state == "drive") input.down(id, x, y)
    }
    fun touchMove(id: Int, x: Double, y: Double) { if (screen != null) { if (id == 0) ui.move(x, y) } else input.move(id, x, y) }
    fun touchUp(id: Int, x: Double, y: Double) { if (screen != null) { if (id == 0) ui.up(x, y) } else input.up(id) }
    fun touchCancel() { input.cancelAll() }
    private fun titleTap() { audio.init(); audio.setVolume(cfg.volume); audio.click(); state = "menu"; show("menu") }

    // ---------------------------------------------------------------- タイトル画面
    private fun drawTitle(ctx: Ctx2D, dt: Double) {
        titleT += dt
        val W = w; val H = h
        val g = ctx.createRadialGradient(W / 2, H / 2, 0.0, W / 2, H / 2, max(W, H) * 0.7); g.addColorStop(0.0, "rgba(8,12,24,0.35)"); g.addColorStop(1.0, "rgba(8,12,24,0.78)")
        ctx.fillStyle = g; ctx.fillRect(0.0, 0.0, W, H)
        val logo = clamp(min(H * 0.105, W * 0.076), 26.0, 78.0)
        val gap = clamp(H * 0.016, 4.0, 14.0)
        val tagS = clamp(H * 0.026, 10.0, 15.0); val scW = min(W * 0.62, 560.0); val scH = min(H * 0.30, 240.0); val btnS = clamp(H * 0.046, 16.0, 24.0); val footS = clamp(H * 0.024, 10.0, 13.0)
        val total = logo * 0.95 + gap + tagS * 1.3 + gap + scH + gap + btnS * 2 + gap + footS * 1.3
        var y = (H - total) / 2 + logo * 0.86
        drawLogo(ctx, W / 2, y, logo, accent)
        y += logo * 0.12 + gap + tagS
        setFont(ctx, tagS, "700"); ctx.fillStyle = "#ffd9b8"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"
        ctx.fillText(variant.tag.toCharArray().joinToString(" "), W / 2, y)
        y += tagS * 0.3 + gap
        // ショーケース (横から見た車)
        val key = "${scW.toInt()}x${scH.toInt()}x$dpr"
        if (showcase == null || showcaseKey != key) {
            val oc = OffCanvas((scW * dpr).toInt(), (scH * dpr).toInt())
            CarSprite.drawShowcase(oc.ctx, scW * dpr, scH * dpr, TEAMS[0], 1); showcase = oc.bmp; showcaseKey = key
        }
        ctx.drawImage(showcase!!, W / 2 - scW / 2, y, scW, scH)
        y += scH + gap
        // TAP TO START (ゆっくり明滅)
        val pulse = 0.5 - 0.5 * cos(titleT * TAU / 1.6)
        setFont(ctx, btnS, "900", true); val bw = ctx.measureText("TAP TO START") * 1.1 + btnS * 3.6; val bh = btnS * 2
        val s = 1 + 0.03 * pulse
        ctx.save(); ctx.translate(W / 2, y + bh / 2); ctx.scale(s, s)
        ctx.fillStyle = C_NAVY; ctx.beginPath(); ctx.roundRect(-bw / 2 + btnS * 0.2, -bh / 2 + btnS * 0.2, bw, bh, 9.0); ctx.fill()
        ctx.fillStyle = mixColor(accent, "#ffffff", 0.25 * pulse); ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 9.0); ctx.fill()
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("T A P  T O  S T A R T", 0.0, 1.0)
        ctx.restore()
        y += bh + gap + footS
        setFont(ctx, footS, "500"); ctx.fillStyle = C_DIM; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"
        ctx.fillText("操作はアクセル・ブレーキ・シフトだけ — ステアリングは自動", W / 2, y)
    }

    // ---------------------------------------------------------------- メニュー画面の組み立て (Web 版 ui.js)
    private fun seg(key: String, cur: Any?, opts: List<SegOpt>, kind: String, minW: Double = 92.0) = Seg(opts, cur, minW) { v -> if (kind == "set") setSetting(key, v) else setOption(key, v) }
    private fun tyreOpts(withSub: Boolean) = TYRES.values.map { SegOpt(it.id, it.name, if (withSub) mapOf("soft" to "高グリップ・摩耗早い", "medium" to "バランス型", "hard" to "長持ち・グリップ控えめ", "rain" to "雨天用")[it.id] else null, it.color, it.short) }

    private fun buildScreen(name: String): Screen = when (name) {
        "menu" -> menuScreen()
        "config" -> configScreen(scrCtx["mode"] as String)
        "settings" -> settingsScreen(scrCtx["inGame"] == true)
        "howto" -> howtoScreen()
        "records" -> recordsScreen()
        "credits" -> Screen("クレジット", "CREDITS", back = { backScreen() }, items = variant.credits.split("\n\n").map { Note(it, 12.5, "#d6dbe6", 1.7) })
        "pause" -> pauseScreen(scrCtx["mode"] as String)
        "results" -> resultsScreen()
        "trainPick" -> Screen("区間を選ぶ", "TRAINING", back = { menuStack.removeLastOrNull(); show("trainReview", lastReviewCtx + ("auto" to false)) }, right = listOf(HeadBtn("この区間で練習 ›", true) { val tr = session!!.trainer!!; tr.setSection(store.last().trainSec); menuStack.removeLastOrNull(); trainRestart() }), items = trainOptions(false))
        "trainReview" -> trainReviewScreen()
        else -> menuScreen()
    }

    private fun menuScreen(): Screen {
        val bd = store.bestLap(false); val bw = store.bestLap(true); val q = store.quali()
        val best = "ベストラップ ${fmtTime(bd?.time)}" + (if (bw != null) "   ウェット ${fmtTime(bw.time)}" else "") + (if (q != null) "   予選 P${q.pos}" else "")
        val cards = listOf("free", "train", "ta", "quali", "race").map { m -> Card(MODES[m]!!.en, MODES[m]!!.name, MODES[m]!!.desc) { menuStack.add("menu"); show("config", mapOf("mode" to m)) } }
        return Screen("", logoHeader = true, headerExtra = best, items = listOf(
            TrackRow("サーキット", defs.map { d -> TrackBtn(d.name, "${f3(d.length / 1000)} km", d.id == T.id) { loadTrack(d.id); startDemo() } }),
            Cards(cards, h, w),
        ), footer = listOf(Btn("設定") { menuStack.add("menu"); show("settings") }, Btn("操作説明") { menuStack.add("menu"); show("howto") }, Btn("記録") { menuStack.add("menu"); show("records") }, Btn("クレジット") { menuStack.add("menu"); show("credits") }))
    }
    private fun configScreen(mode: String): Screen {
        val l = store.last(); val s = store.settings(); val q = store.quali()
        val setups = SETUPS.values.map { SegOpt(it.id, it.name, it.desc) }
        val weathers = WEATHERS.entries.filter { mode != "train" || it.key != "change" }.map { SegOpt(it.key, it.value.name) }
        val trk = curDef(); val lapsList = listOf(5, 10, 20, trk.fullLaps)
        if (l.laps !in lapsList) { l.laps = 5; store.saveLast(l) }
        val items = arrayListOf<Item>(Heading("セッティング"), seg("setup", l.setup, setups, "opt"), Heading("タイヤ"), seg("tyre", l.tyre, tyreOpts(true), "opt"), Heading("天候"), seg("weather", l.weather, weathers, "opt"))
        if (mode == "train") items.addAll(trainOptions(false))
        if (mode == "race") {
            items.add(Heading("周回数")); items.add(seg("laps", l.laps, lapsList.map { n -> SegOpt(n, "${n}周", if (n == trk.fullLaps) "フルディスタンス" else "約${jsRound(n * trk.baseLap * 1.03 / 60)}分") }, "opt"))
            items.add(Heading("スターティンググリッド")); items.add(seg("gridMode", l.gridMode, listOf(SegOpt("quali", "予選結果", if (q != null) "P${q.pos} スタート" else "未実施 (10番手)"), SegOpt("pole", "ポール"), SegOpt("mid", "10番手"), SegOpt("last", "最後尾")), "opt"))
        }
        if (mode == "race" || mode == "quali") { items.add(Heading("ライバルの強さ")); items.add(seg("difficulty", s.difficulty, DIFFICULTY.entries.map { SegOpt(it.key, it.value.name) }, "set")) }
        items.add(Heading("ドライビングアシスト"))
        items.add(seg("assist", s.assist, listOf(SegOpt(false, "なし (標準)", "ABS・TCS 無しの1990年仕様"), SegOpt(true, "あり", "ホイールロックと空転を抑える")), "set"))
        items.add(seg("autoShift", s.autoShift, listOf(SegOpt(false, "マニュアル (標準)", "パドルで6速を操作"), SegOpt(true, "オートマチック", "自動変速")), "set"))
        return Screen(MODES[mode]!!.name, "${MODES[mode]!!.en} · ${trk.short}", back = { backScreen() }, right = listOf(HeadBtn("スタート ›", true) { startSession(mode) }), items = items)
    }
    private fun settingsScreen(inGame: Boolean): Screen {
        val s = store.settings()
        val items = listOf(
            Note("ステアリングは端末が自動で行います。操作するのはアクセル・ブレーキ・シフトだけです。"),
            Heading("ペダルパッド (左下)"), seg("pedalAccelRight", s.pedalAccelRight, listOf(SegOpt(true, "右 アクセル / 左 ブレーキ (標準)", "中央から離すほど強くなる"), SegOpt(false, "左 アクセル / 右 ブレーキ")), "set"),
            Heading("指を離したとき"), seg("pedalRelease", s.pedalRelease, listOf(SegOpt("zero", "ゼロに戻す (標準)"), SegOpt("hold", "直前の入力を保持")), "set"),
            Heading("カメラ"), seg("camera", s.camera, listOf(SegOpt("up", "進行方向が上"), SegOpt("right", "進行方向が右", "先が広く見える"), SegOpt("north", "北が上 (固定)")), "set"),
            seg("zoom", s.zoom, listOf(SegOpt("near", "近い"), SegOpt("normal", "標準"), SegOpt("far", "遠い")), "set"),
            Heading("表示"), seg("lineAssist", s.lineAssist, listOf(SegOpt(true, "走行ライン表示 ON", "フリー走行・トレーニングのみ。赤=ブレーキ 黄=旋回"), SegOpt(false, "OFF")), "set"),
            seg("ghost", s.ghost, listOf(SegOpt(true, "ゴースト ON"), SegOpt(false, "OFF")), "set"),
            seg("quality", s.quality, listOf(SegOpt("auto", "画質 自動", "60fpsを保つよう調整"), SegOpt("high", "高画質"), SegOpt("low", "軽量")), "set"),
            Heading("ダメージ"), seg("damage", s.damage, listOf(SegOpt(true, "あり"), SegOpt(false, "なし")), "set"),
            Heading("音量"), RangeItem(s.volume, "${jsRound(s.volume * 100)}%") { v -> setSetting("volume", v) },
            Btns(listOf(Btn("設定を初期化") { store.saveSettings(Settings()); cfg = store.settings(); applyInputCfg(); onResolution?.invoke() }), 200.0),
        )
        return Screen("設定", "SETTINGS", back = { if (inGame) show("pause", mapOf("mode" to session!!.mode)) else backScreen() }, items = items)
    }
    private fun howtoScreen() = Screen("操作説明", "HOW TO DRIVE", back = { backScreen() }, items = listOf(
        HowItem("AUTO", "rgba(255,255,255,0.1)", "ステアリングは自動", "ハンドル操作はありません。マシンは理想の走行ラインを自動でたどり、前の車に追いつくと空いている側へ自動で並びかけます。速く走れるか・抜けるかは、アクセルとブレーキのタイミング次第です。"),
        HowItem("ACCEL", "#1f8f58", "アクセル (左下パッドの右半分)", "パッドの中央がニュートラル。中央から右へスライドするほど開度が上がります (0〜100%)。低いギアで全開にすると後輪が空転します。じわっと開けるのがコツ。"),
        HowItem("BRAKE", "#c23a30", "ブレーキ (左下パッドの左半分)", "中央から左へスライドするほど強く効きます。ABSは無いので、速度が落ちてダウンフォースが減ったら踏力を抜かないとタイヤがロックします。速度が高すぎるとコーナーを曲がり切れません。"),
        HowItem("▼ ▲", "rgba(255,255,255,0.1)", "6速パドルシフト (右下)", "左が DOWN、右が UP。回転ランプが青く点滅したらシフトアップ。回転が高すぎるシフトダウンは受け付けません。停止中に1速から DOWN でリバース。"),
        HowItem("PASS", "rgba(255,255,255,0.1)", "追い越し", "コーナーの立ち上がりで早くアクセルを開けて直線で並ぶ、スリップストリームに入る、ブレーキングを遅らせてインに飛び込む — タイミングが良ければ抜けます。"),
        HowItem("TRAIN", "#e8761e", "トレーニングモード", "練習したい区間を選ぶと、その少し手前からお手本と同じ速度でスタート。半透明のお手本ゴーストが理想のラインと速度で先行し、左の目標パネルに、いまの位置でのお手本の速度と最適ギヤが大きく出ます。トレーナーがブレーキ開始点やアクセルのタイミングをその場で声かけし、区間を走り終えるとお手本との差(★1〜5)と改善点を講評。「自動リピート」で何度でも続けて挑戦できます。", "#111"),
        HowItem("PIT", "#d98a1a", "ピットイン", "左上の PIT を押して次のタイヤを選び、最終コーナーでピット側へ。ピットレーン内は自動走行でタイヤ交換と修理を行います。", "#111"),
        HowItem("LINE", "rgba(255,255,255,0.1)", "走行ライン", "路面のラインは理想の走行ライン。赤はブレーキング、黄は旋回区間の目安です (フリー走行・トレーニングのみ)。"),
        HowItem("KEY", "rgba(255,255,255,0.1)", "キーボード・ゲームパッド", "↑ アクセル / ↓ ブレーキ / → シフトアップ / ← シフトダウン / P ポーズ。ゲームパッドは RT アクセル / LT ブレーキ / RB・A アップ / LB・X ダウン。"),
    ))
    private fun recordsScreen(): Screen {
        val laps = store.lapRecords().take(12)
        val sec = { wet: Boolean -> store.sectors(wet).joinToString(" / ") { it?.let { v -> f3(v) } ?: "--.---" } }
        val races = store.raceRecords()
        return Screen("記録", "RECORDS · ${curDef().short}", back = { backScreen() }, right = listOf(HeadBtn("記録を消去") { store.clearRecords() }), items = listOf(
            Heading("ベストラップ"),
            Table(listOf(Cell("#"), Cell("タイム"), Cell("タイヤ"), Cell("セッティング"), Cell("路面"), Cell("モード"), Cell("日付")),
                laps.mapIndexed { i, r -> listOf(Cell("${i + 1}"), Cell(fmtTime(r.time), t = true), Cell(TYRES[r.tyre]?.name ?: "-"), Cell(SETUPS[r.setup]?.name ?: "-"), Cell(if (r.wet) "ウェット" else "ドライ"), Cell(r.mode), Cell(r.date)) }, empty = "まだ記録がありません"),
            Heading("セクターベスト", "ドライ: ${sec(false)}   ウェット: ${sec(true)}"),
            Heading("決勝リザルト"),
            Table(listOf(Cell("日付"), Cell("距離"), Cell("天候"), Cell("結果"), Cell("ベスト")),
                races.map { r -> listOf(Cell(r.date), Cell("${r.laps}周"), Cell(WEATHERS[r.weather]?.name ?: ""), Cell("${r.grid}番手 → ${if (r.dnf) "リタイア" else "${r.pos}位"}"), Cell(fmtTime(r.best), t = true)) }, empty = "まだ決勝の記録がありません"),
        ))
    }
    private fun pauseScreen(mode: String): Screen {
        val s = store.settings(); val l = store.last()
        val items = arrayListOf<Item>(Btns(listOf(Btn("再開", true) { resume() }, Btn("リスタート") { startSession(lastOpts!!.mode, true) }, Btn("設定") { show("settings", mapOf("inGame" to true)) }, Btn("メニューへ戻る") { toMenu() })))
        if (mode == "train") items.addAll(trainOptions(true))
        if (mode == "free" || mode == "train") {
            items.add(Heading("セッティング変更")); items.add(seg("setup", l.setup, SETUPS.values.map { SegOpt(it.id, it.name) }, "opt"))
            items.add(Heading("タイヤ交換")); items.add(seg("tyre", l.tyre, tyreOpts(false), "opt"))
            items.add(Heading("天候")); items.add(seg("weather", l.weather, WEATHERS.entries.filter { it.key != "change" }.map { SegOpt(it.key, it.value.name) }, "opt"))
        }
        items.add(Heading("カメラ")); items.add(seg("camera", s.camera, listOf(SegOpt("up", "進行方向が上"), SegOpt("right", "進行方向が右"), SegOpt("north", "北が上")), "set"))
        return Screen("ポーズ", "PAUSED", items = items, width = "normal")
    }
    private fun resultsScreen(): Screen {
        val S = session!!; val mode = S.mode
        val me = S.results.first { it.player }
        val meIdx = setOf(S.results.indexOf(me))
        val table = if (mode == "race") {
            val lead = S.results[0]
            Table(listOf(Cell("順位"), Cell("No."), Cell("ドライバー"), Cell("チーム"), Cell("周回"), Cell("タイム / 差"), Cell("ベスト"), Cell("PIT")),
                S.results.map { r ->
                    val tm = if (r.dnf) "リタイア" else if (r.time == null) "走行中" else if (r === lead) fmtTime(r.time) else if (r.laps < lead.laps) "+${lead.laps - r.laps}周" else "+${f3((r.time ?: 0.0) - (lead.time ?: 0.0))}"
                    listOf(Cell(if (r.dnf) "-" else "${r.pos}"), Cell("${r.no}"), Cell(r.name + (if (r.penalty > 0) " (+${r.penalty.toInt()}秒)" else "")), Cell(r.team), Cell("${r.laps}"), Cell(tm, t = true), Cell(fmtTime(r.best), t = true), Cell("${r.stops}"))
                }, meIdx)
        } else {
            val pole = S.results[0].best ?: 0.0
            Table(listOf(Cell("順位"), Cell("No."), Cell("ドライバー"), Cell("チーム"), Cell("タイム"), Cell("差")),
                S.results.map { r -> listOf(Cell("${r.pos}"), Cell("${r.no}"), Cell(r.name), Cell(r.team), Cell(if (r.best == null) "ノータイム" else fmtTime(r.best), t = true), Cell(if (r.best == null || r.pos == 1) "" else "+${f3((r.best ?: 0.0) - pole)}", t = true)) }, meIdx)
        }
        val title = if (mode == "race") (if (me.dnf) "リタイア" else "${me.pos}位 フィニッシュ") else "予選 ${me.pos}番手"
        val right = arrayListOf<HeadBtn>()
        if (mode == "quali") right.add(HeadBtn("決勝へ進む ›", true) { val l = store.last(); l.gridMode = "quali"; store.saveLast(l); menuStack.clear(); menuStack.add("menu"); session = null; state = "menu"; audio.silence(); startDemo(); show("config", mapOf("mode" to "race")) })
        right.add(HeadBtn("もう一度") { startSession(lastOpts!!.mode, true) }); right.add(HeadBtn("メニューへ") { toMenu() })
        return Screen(title, if (mode == "race") "RACE RESULT" else "QUALIFYING RESULT", right = right, items = listOf(table))
    }
    private fun trainOptions(compact: Boolean): List<Item> {
        val B = store.trainBest(); val l = store.last()
        val list = curDef().train; if (l.trainSec >= list.size) l.trainSec = 1
        val secs = list.mapIndexed { k, x -> SegOpt(k, x.name, B[x.id]?.let { "ベスト ${"★".repeat(it.stars)}${"☆".repeat(5 - it.stars)}" } ?: "未挑戦") }
        val s = store.settings()
        return listOf(
            Heading("練習する区間", "お手本の少し手前から、同じ速度でスタートします"), seg("trainSec", l.trainSec, secs, "opt", 138.0),
            Heading("トレーニング補助"),
            seg("trainGuide", s.trainGuide, listOf(SegOpt(true, "ガイド ON", "目標速度・最適ギヤ・トレーナーの声かけ"), SegOpt(false, "ガイド OFF", "ゴーストだけで練習")), "set"),
            seg("ghost", s.ghost, listOf(SegOpt(true, "お手本ゴースト ON"), SegOpt(false, "OFF")), "set"),
            seg("trainAuto", s.trainAuto, listOf(SegOpt(true, "自動リピート ON", "講評のあと数秒で自動でやり直し"), SegOpt(false, "OFF", "「もう一度」を押すまで待つ")), "set"),
        )
    }
    private fun trainReviewScreen(): Screen {
        val r = scrCtx["report"] as TrainReport; val auto = scrCtx["auto"] == true && autoT > 0
        fun dtxt(d: Double) = "${if (d >= 0) "+" else "−"}${f2(abs(d))}秒"
        val items = ArrayList<Item>()
        items.add(Custom(46.0) { ctx, _, x, y, w ->
            ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"
            if (r.aborted) { setFont(ctx, 26.0, "900", true); ctx.fillStyle = "#fff"; ctx.fillText("中断", x, y + 34) }
            else {
                setFont(ctx, 26.0, "900", true); ctx.fillStyle = "#ffc24a"; val st = "★".repeat(r.stars); ctx.fillText(st, x, y + 34); var xx = x + ctx.measureText(st)
                ctx.fillStyle = "rgba(255,255,255,0.18)"; val st2 = "★".repeat(5 - r.stars); ctx.fillText(st2, xx, y + 34); xx += ctx.measureText(st2) + 14
                ctx.fillStyle = if (r.delta > 0.4) "#ff8a7a" else "#7dffb0"; val d = dtxt(r.delta); ctx.fillText(d, xx, y + 34); xx += ctx.measureText(d) + 10
                setFont(ctx, 12.0, "600"); ctx.fillStyle = C_DIM; ctx.fillText("お手本との差", xx, y + 34)
                setFont(ctx, 19.0, "900", true); ctx.fillStyle = "#ffc79a"; ctx.textAlign = "right"; ctx.fillText("${r.score}点", x + w, y + 34); ctx.textAlign = "left"
            }
        })
        if (auto) items.add(Custom(40.0) { ctx, ui, x, y, w ->
            setFont(ctx, 12.5, "500"); ctx.fillStyle = C_DIM; ctx.textAlign = "left"; ctx.textBaseline = "middle"
            val t1 = "自動リピート: "; ctx.fillText(t1, x, y + 20); var xx = x + ctx.measureText(t1)
            setFont(ctx, 15.0, "800"); ctx.fillStyle = "#fff"; val n = "${max(1, ceil(autoT).toInt())}"; ctx.fillText(n, xx, y + 20); xx += ctx.measureText(n)
            setFont(ctx, 12.5, "500"); ctx.fillStyle = C_DIM; ctx.fillText("秒後にもう一度", xx, y + 20); xx += ctx.measureText("秒後にもう一度") + 12
            ctx.textBaseline = "alphabetic"
            ui.textButton(ctx, xx, y + 6, 70.0, 28.0, "止める", false, 12.0) { autoT = 0.0; lastReviewCtx = lastReviewCtx + ("auto" to false); scrCtx = scrCtx + ("auto" to false) }
        })
        items.add(Coach(r.advice))
        if (!r.aborted) {
            if (r.isLap) items.add(Table(listOf(Cell("区間"), Cell("評価"), Cell("お手本との差")), r.rows.map { x -> listOf(Cell(x.name), Cell("★".repeat(x.stars) + "☆".repeat(5 - x.stars)), Cell(dtxt(x.dT), if (x.dT > 0.4) "bad" else "ok", t = true)) }))
            else if (r.zones.isNotEmpty()) {
                fun cls(v: Int, th: Int) = if (abs(v) <= th) "ok" else "bad"
                items.add(Table(listOf(Cell("ブレーキング"), Cell("踏み始め"), Cell("最低速度", small = "あなた/お手本"), Cell("アクセル開始"), Cell("ギヤ", small = "あなた/最適")), r.zones.map { q ->
                    val bm = jsRound(q.brakeDiffM); val em = jsRound(q.exitDiffM)
                    listOf(Cell(q.label), Cell(if (q.noBrake) "なし" else if (bm > 0) "${bm}m 遅い" else if (bm < 0) "${-bm}m 早い" else "一致", if (q.noBrake) "bad" else cls(bm, 12)),
                        Cell("${jsRound(q.vMinPl)}", if (q.vMinPl < q.vMinRef - 8) "bad" else "ok", small = "/ ${jsRound(q.vMinRef)}"),
                        Cell(if (em > 0) "${em}m 遅い" else if (em < 0) "${-em}m 早い" else "一致", cls(em, 14)),
                        Cell(if (q.gearPl != 0) "${q.gearPl}" else "-", if (q.gearPl != 0 && q.gearPl != q.gearOpt) "bad" else "ok", small = "/ ${q.gearOpt}"))
                }))
            }
        }
        return Screen(r.name, "${r.run}回目", right = listOf(
            HeadBtn("↻ もう一度", true) { trainRestart() },
            HeadBtn("次の区間 ›") { val tr = session!!.trainer!!; val n = (tr.secIdx + 1) % tr.prepared.size; val l = store.last(); l.trainSec = n; store.saveLast(l); tr.setSection(n); trainRestart() },
            HeadBtn("区間を選ぶ") { autoT = 0.0; menuStack.add("menu"); show("trainPick") },
            HeadBtn("終了") { toMenu() }), items = items)
    }
}
