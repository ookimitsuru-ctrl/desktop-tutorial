import * as THREE from 'three';
import css from '../ui/style.css';
import { Graphics } from '../render/graphics.js';
import { World } from './world.js';
import { MatchView } from './matchview.js';
import { TEAMS, teamById, chooseKits } from '../data/teams.js';
import { Tournament, roundName } from './tournament.js';
import { loadSettings, saveSettings, VENUES } from './settings.js';
import { AudioEngine } from '../audio/audio.js';
import { Controls } from '../ui/controls.js';
import { HUD } from '../ui/hud.js';
import { h } from '../ui/dom.js';
import * as S from '../ui/screens.js';
import { setHaptics, haptic } from '../platform.js';
import { PITCH } from '../config.js';
import { Shootout } from './shootout.js';
import { Ceremony } from './ceremony.js';

// アプリ全体の流れ: タイトル → メニュー → 大会/フレンドリー → 試合 → 結果

const _camDir = new THREE.Vector3();

export class App {
  constructor() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const fl = document.createElement('link');
    fl.rel = 'stylesheet';
    fl.href = 'fonts/fonts.css';
    document.head.append(fl);

    this.root = document.getElementById('app');
    this.settings = loadSettings();
    // テスト用のURLパラメータ（?quality=low&half=0.5 など）
    const qp = new URLSearchParams(location.search);
    if (qp.get('quality')) this.settings.quality = qp.get('quality');
    if (qp.get('half')) this.settings.halfMinutes = +qp.get('half');
    if (qp.get('replays')) this.settings.replays = qp.get('replays') === '1';
    if (qp.get('cam')) this.settings.camera = qp.get('cam');
    this.testMode = qp.get('test') === '1';
    if (this.testMode) this.installTestHooks();
    this.gfx = new Graphics(this.root);
    this.applyQuality();
    this.ui = h('div', { id: 'ui' });
    this.root.append(this.ui);
    this.loading = S.loadingScreen();
    this.root.append(this.loading);
    this.audio = new AudioEngine();
    this.audio.setVolumes(this.settings.sound, this.settings.music);
    setHaptics(this.settings.haptics);
    this.screen = null;
    this.mode = 'boot';
    this.history = [];
    this.camT = 0;
    this.camPos = new THREE.Vector3(0, 40, 90);
    this.camLook = new THREE.Vector3();
    this.lastNow = performance.now();
    this.pending = null;

    const unlock = () => {
      this.audio.unlock();
      if (this.mode !== 'match') this.audio.startMusic();
    };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    addEventListener('contextmenu', (e) => e.preventDefault());

    // GPUのコンテキストが失われたら作り直す（バックグラウンド復帰時など）
    this.gfx.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ui.append(h('div.loading', {}, h('div', { style: { color: '#9fb0d8', fontSize: '13px' } }, 'グラフィックを再初期化しています…')));
    });
    this.gfx.canvas.addEventListener('webglcontextrestored', () => location.reload());
    window.__hostBack = () => this.back();
    window.__hostPause = () => this.onHostPause();
    window.__hostResume = () => this.onHostResume();
    document.addEventListener('visibilitychange', () => (document.hidden ? this.onHostPause() : this.onHostResume()));
  }

  applyQuality() {
    const q = this.settings.quality;
    this.gfx.autoQuality = q === 'auto';
    this.autoTier = this.autoTier || this.gfx.guessQuality();
    this.gfx.setQuality(q === 'auto' ? this.autoTier : q);
    this.gfx.onDegrade = () => {
      if (this.settings.quality !== 'auto') return;
      const order = ['high', 'medium', 'low'];
      const i = order.indexOf(this.gfx.qualityName);
      if (i < 0 || i >= order.length - 1) return;
      this.autoTier = order[i + 1];
      this.gfx.dynScale = 0.8;
      this.applyQuality();
    };
    if (this.world) {
      this.world.setShadowQuality(this.gfx.quality.shadow);
      this.world.crowd.build(this.gfx.quality.crowd);
    }
  }

  async start() {
    // 重い初期化の前に一度描画させる
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
    this.world = new World(this.gfx);
    this.world.onAfterResize = () => this.hud?.fitScale();
    const pv = new THREE.Vector3();
    this.projectToScreen = (x, y, z) => {
      pv.set(x, y, z).project(this.world.camera);
      return { x: ((pv.x + 1) / 2) * innerWidth, y: ((1 - pv.y) / 2) * innerHeight, behind: pv.z > 1 };
    };
    this.world.setShadowQuality(this.gfx.quality.shadow);
    if (this.gfx.quality.crowd < 1) this.world.crowd.build(this.gfx.quality.crowd);
    this.startDemo();
    // 最初の数フレームでシェーダをコンパイル
    for (let i = 0; i < 3; i++) {
      this.demo.update(1 / 60);
      this.world.render();
    }
    this.gfx.renderer.setAnimationLoop((now) => this.frame(now));
    this.loading.style.opacity = '0';
    setTimeout(() => this.loading.remove(), 700);
    this.showTitle();
  }

  // ------------------------------------------------------------ 背景のデモ試合

  startDemo() {
    const ids = TEAMS.map((t) => t.id);
    const a = ids[Math.floor(Math.random() * 4)];
    let b = ids[Math.floor(Math.random() * 4)];
    if (b === a) b = ids[(ids.indexOf(a) + 1) % 4];
    const home = teamById(a);
    const away = teamById(b);
    const venue = VENUES[Math.floor(Math.random() * VENUES.length)];
    this.demo?.dispose?.();
    this.demo = new MatchView(this.world, {
      home,
      away,
      kits: chooseKits(home, away),
      settings: { halfLength: 600, userTeam: null, noReplay: true, difficulty: 'normal', offside: true },
      seed: (Math.random() * 1e6) | 0,
      preset: venue.preset,
      pitchStyle: venue.pitch,
    });
    this.demo.externalCamera = true;
    this.demo.start();
  }

  updateDemoCamera(dt) {
    const w = this.world;
    const cam = w.camera;
    this.camT += dt;
    w.stadium.setBroadcastView(false);
    const b = this.demo.match.ball;
    let pos;
    let look;
    if (this.camStyle === 'orbit') {
      const a = this.camT * 0.05 + 0.6;
      pos = new THREE.Vector3(Math.cos(a) * 92, 34 + Math.sin(this.camT * 0.1) * 6, Math.sin(a) * 70);
      look = new THREE.Vector3(0, 2, 0);
      cam.fov = 42;
    } else {
      // テレビ中継風に低めの角度でボールを追う
      const bx = THREE.MathUtils.clamp(b.x, -40, 40);
      const bz = THREE.MathUtils.clamp(b.z, -25, 25);
      pos = new THREE.Vector3(bx * 0.85 + 10, 13, bz * 0.4 + 36);
      look = new THREE.Vector3(bx - 4, 0, bz * 0.8);
      cam.fov = 34;
    }
    if (this.snapCam) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.snapCam = false;
    }
    this.camPos.lerp(pos, 1 - Math.exp(-dt * 1.2));
    this.camLook.lerp(look, 1 - Math.exp(-dt * 2));
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ 画面遷移

  setScreen(el, { push = true } = {}) {
    if (this.screen) {
      const old = this.screen;
      old.classList.add('out');
      setTimeout(() => old.remove(), 260);
    }
    this.screen = el;
    if (el) this.ui.append(el);
    void push;
  }

  go(fn, ...args) {
    this.audio.ui('tap');
    fn.apply(this, args);
  }

  showTitle() {
    this.mode = 'title';
    this.camStyle = 'orbit';
    this.snapCam = true;
    this.backTarget = null;
    this.setScreen(S.titleScreen(() => this.go(this.showMenu)));
  }

  showMenu() {
    this.mode = 'menu';
    if (this.camStyle !== 'follow') {
      this.camStyle = 'follow';
      this.snapCam = true;
    }
    this.backTarget = () => this.showTitle();
    const tour = Tournament.load();
    this.setScreen(
      S.mainMenu({
        hasSave: !!(tour && !tour.s.finished),
        onContinue: () => this.go(this.showHub, Tournament.load()),
        onWorldCup: () => this.go(this.newWorldCup),
        onFriendly: () => this.go(this.friendlyPickTeam),
        onSettings: () => this.go(this.showSettings, () => this.showMenu()),
        onHowTo: () => this.go(this.showHowTo),
      }),
    );
  }

  newWorldCup() {
    this.backTarget = () => this.showMenu();
    this.setScreen(
      S.teamSelect({
        title: 'ワールドカップ',
        en: 'SELECT YOUR TEAM',
        initial: 'JPN',
        onBack: () => this.go(this.showMenu),
        okLabel: 'このチームで出場',
        onPick: (id) => {
          this.audio.ui('ok');
          const t = Tournament.create(id);
          t.save();
          this.showHub(t);
        },
      }),
    );
  }

  showHub(tour) {
    this.mode = 'menu';
    this.tour = tour;
    this.backTarget = () => this.showMenu();
    if (tour.s.finished) {
      this.showTournamentEnd(tour);
      return;
    }
    this.setScreen(
      S.hub({
        tour,
        onBack: () => this.go(this.showMenu),
        onAbandon: () => {
          this.confirm('大会を破棄しますか？', 'これまでの結果は失われます', () => {
            Tournament.clear();
            this.showMenu();
          });
        },
        onPlay: (f) => this.go(this.showLineup, f),
      }),
    );
  }

  showLineup(f) {
    const tour = this.tour;
    const userHome = f.home === tour.user;
    const me = teamById(tour.user);
    const opp = teamById(userHome ? f.away : f.home);
    const home = teamById(f.home);
    const away = teamById(f.away);
    const kits = chooseKits(home, away);
    const myKit = userHome ? kits[0] : kits[1];
    const venue = VENUES[f.venue];
    this.backTarget = () => this.showHub(tour);
    this.setScreen(
      S.lineup({
        team: me,
        opp,
        kit: myKit,
        venue,
        weather: f.weather,
        fixtureLabel: roundName(f.round),
        onBack: () => this.go(this.showHub, tour),
        onKickoff: () => {
          this.audio.ui('ok');
          this.startMatch({ home, away, kits, userTeam: userHome ? 0 : 1, venue, fixture: f, knockout: f.stage === 'knockout', label: roundName(f.round), weather: f.weather || 'clear' });
        },
      }),
    );
  }

  friendlyPickTeam() {
    this.backTarget = () => this.showMenu();
    this.setScreen(
      S.teamSelect({
        title: 'フレンドリーマッチ',
        en: 'YOUR TEAM',
        initial: 'JPN',
        onBack: () => this.go(this.showMenu),
        onPick: (id) => this.go(this.friendlyPickOpp, id),
      }),
    );
  }

  friendlyPickOpp(myId) {
    this.backTarget = () => this.friendlyPickTeam();
    const first = TEAMS.find((t) => t.id !== myId).id;
    this.setScreen(
      S.teamSelect({
        title: '対戦相手',
        en: 'OPPONENT',
        initial: first,
        exclude: myId,
        onBack: () => this.go(this.friendlyPickTeam),
        onPick: (opp) => this.go(this.friendlyPickVenue, myId, opp),
      }),
    );
  }

  friendlyPickVenue(myId, oppId) {
    this.backTarget = () => this.friendlyPickOpp(myId);
    this.setScreen(
      S.venueSelect({
        onBack: () => this.go(this.friendlyPickOpp, myId),
        onPick: (vi, weather) => {
          const home = teamById(myId);
          const away = teamById(oppId);
          this.audio.ui('ok');
          this.startMatch({ home, away, kits: chooseKits(home, away), userTeam: 0, venue: VENUES[vi], fixture: null, knockout: false, label: 'フレンドリーマッチ', weather });
        },
      }),
    );
  }

  showSettings(onBack) {
    this.backTarget = onBack;
    this.setScreen(
      S.settingsScreen({
        settings: { ...this.settings },
        onBack: () => this.go(onBack),
        onChange: (s, key) => {
          this.settings = { ...s };
          saveSettings(this.settings);
          if (key === 'quality') this.applyQuality();
          if (key === 'sound' || key === 'music') this.audio.setVolumes(this.settings.sound, this.settings.music);
          if (key === 'haptics') setHaptics(this.settings.haptics);
          if (key === 'autoSwitch' && this.mv) this.mv.match.user.autoSwitch = this.settings.autoSwitch;
          if (key === 'camera' && this.mv) this.mv.cameraMode = this.settings.camera;
          if (key === 'radar') this.hud?.setRadar(this.settings.radar);
          this.audio.ui('tap');
        },
      }),
    );
  }

  showHowTo() {
    const prevClose = this.overlayClose;
    const close = () => {
      this.audio.ui('back');
      dlg.remove();
      this.overlayClose = prevClose || null;
    };
    const dlg = S.dialog('遊び方', 'HOW TO PLAY', S.howToContent(), [S_btn('閉じる', 'primary', close)]);
    this.overlayClose = close;
    this.ui.append(dlg);
  }

  confirm(title, sub, onYes) {
    const close = () => {
      dlg.remove();
      this.overlayClose = null;
    };
    const dlg = S.dialog(title, '', h('div', { style: { textAlign: 'center', color: '#9fb0d8', fontSize: '13px' } }, sub), [
      S_btn('キャンセル', 'ghost', close),
      S_btn('OK', 'primary', () => {
        close();
        onYes();
      }),
    ]);
    this.overlayClose = close;
    this.ui.append(dlg);
  }

  back() {
    if (this.overlayClose) {
      this.overlayClose();
      return true;
    }
    if (this.mode === 'match') {
      if (this.shootout || this.ceremony) return true;
      this.togglePause();
      return true;
    }
    if (this.backTarget) {
      this.audio.ui('back');
      this.backTarget();
      return true;
    }
    return false;
  }

  onHostPause() {
    this.audio.suspend();
    if (this.mode === 'match' && this.mv && !this.mv.paused && !this.shootout) this.togglePause(true);
  }

  onHostResume() {
    this.audio.resume();
    this.lastNow = performance.now();
  }

  // ------------------------------------------------------------ 試合

  startMatch(cfg) {
    this.cfg = cfg;
    this.mode = 'match';
    this.setScreen(null);
    this.audio.stopMusic();
    this.demo = null;
    const s = this.settings;
    this.mv = new MatchView(this.world, {
      home: cfg.home,
      away: cfg.away,
      kits: cfg.kits,
      settings: {
        halfLength: s.halfMinutes * 60,
        difficulty: s.difficulty,
        offside: s.offside,
        userTeam: cfg.userTeam,
        knockout: cfg.knockout,
      },
      seed: (Math.random() * 1e6) | 0,
      preset: cfg.venue.preset,
      pitchStyle: cfg.venue.pitch,
      weather: cfg.weather || 'clear',
    });
    this.audio.setRain(cfg.weather === 'rain');
    const m = this.mv.match;
    this.mv.cameraMode = s.camera;
    m.user.autoSwitch = s.autoSwitch;
    this.mv.start();
    this.mv.hold = true;
    this.mv.introT = 0;
    this.hud = new HUD(this.ui, m, { onPause: () => this.togglePause() });
    this.hud.setRadar(s.radar);
    this.controls = new Controls(this.ui);
    this.controls.on('down', (n) => this.onButton(n, true));
    this.controls.on('up', (n, hold) => this.onButton(n, false, hold));
    this.controls.setVisible(false);
    this.hud.setVisible(false);
    this.mv.on((e) => this.onMatchEvent(e));
    this.introBanner();
  }

  introBanner() {
    const cfg = this.cfg;
    const el = h(
      'div.overlay',
      { style: { background: 'linear-gradient(180deg, rgba(2,6,20,0) 55%, rgba(2,6,20,0.85))', alignItems: 'flex-end', paddingBottom: '9vh', pointerEvents: 'none' } },
      h(
        'div',
        { style: { textAlign: 'center' } },
        h('div', { style: { fontSize: '12px', letterSpacing: '0.35em', color: '#ffd84a', fontWeight: 800 } }, cfg.label),
        h('div', { style: { fontSize: 'clamp(22px,4vw,40px)', fontWeight: 800, margin: '6px 0', textShadow: '0 4px 14px #000' } }, `${cfg.home.name}  vs  ${cfg.away.name}`),
        h('div', { style: { fontSize: '13px', color: '#cfdaf7' } }, `${cfg.venue.name}（${cfg.venue.city}）`),
      ),
    );
    this.ui.append(el);
    this.introEl = el;
  }

  endIntro() {
    if (!this.mv.hold) return;
    this.mv.hold = false;
    this.mv.introT = null;
    this.gfx.post.uniforms.uFade.value = 0;
    this.introEl?.remove();
    this.introEl = null;
    this.controls.setVisible(true);
    this.hud.setVisible(true);
    if (!this.settings.seenHint && !this.testMode) {
      this.settings.seenHint = true;
      saveSettings(this.settings);
      const card = h(
        'div.overlay',
        { style: { background: 'rgba(2,6,20,0.35)', pointerEvents: 'none' } },
        h(
          'div.dialog.panel',
          { style: { minWidth: '0', maxWidth: '520px', textAlign: 'center' } },
          h('h2', {}, '操作のしかた', h('small', {}, 'CONTROLS')),
          h(
            'div',
            { style: { fontSize: '14px', lineHeight: '1.9' } },
            h('div', {}, '画面の左側をドラッグ → 選手を動かす'),
            h('div', {}, '右のボタン → パス・スルー・ロブ・シュート'),
            h('div', {}, 'シュートは長押しで強く。スティックで左右を狙う'),
            h('div', { style: { color: '#9fb0d8', fontSize: '12px' } }, '黄色いリングが操作中の選手です'),
          ),
        ),
      );
      this.ui.append(card);
      setTimeout(() => card.remove(), 6500);
    }
  }

  togglePause(force) {
    const mv = this.mv;
    if (!mv) return;
    if (this.pauseEl) {
      if (force) return;
      this.pauseEl.remove();
      this.pauseEl = null;
      this.overlayClose = null;
      mv.paused = false;
      this.controls?.setVisible(true);
      return;
    }
    mv.paused = true;
    this.controls?.setVisible(false);
    const resume = () => this.togglePause();
    const info = h(
      'div',
      { style: { textAlign: 'center', fontSize: '13px', color: '#9fb0d8', marginBottom: '4px' } },
      `${this.cfg.home.name} ${mv.match.teams[0].score} - ${mv.match.teams[1].score} ${this.cfg.away.name}　${mv.match.displayClock.text}`,
    );
    this.pauseEl = S.dialog('ポーズ', 'PAUSED', info, [
      S_btn('試合を続ける', 'primary', resume),
      S_btn('操作方法', 'ghost', () => this.showHowTo()),
      S_btn('試合をやめる', 'ghost', () => {
        this.confirm('試合をやめますか？', this.cfg.fixture ? '大会の試合は不戦敗にはならず、もう一度挑戦できます' : '', () => {
          this.pauseEl?.remove();
          this.pauseEl = null;
          this.leaveMatch();
          if (this.cfg.fixture) this.showHub(this.tour);
          else this.showMenu();
        });
      }),
    ]);
    this.overlayClose = resume;
    this.ui.append(this.pauseEl);
  }

  leaveMatch() {
    if (this.powerEl) this.powerEl.style.display = 'none';
    if (this.reticleEl) this.reticleEl.style.display = 'none';
    this.audio.setRain(false);
    this.world.weather = 'clear';
    this.hud?.destroy();
    this.controls?.destroy();
    this.hud = null;
    this.controls = null;
    this.mv = null;
    this.shootout?.destroy();
    this.shootout = null;
    this.ceremony?.destroy();
    this.ceremony = null;
    this.mode = 'menu';
    this.startDemo();
    this.camStyle = 'follow';
    this.snapCam = true;
    this.audio.startMusic();
  }

  controlsMode() {
    const m = this.mv.match;
    const ut = m.user.team;
    if (m.phase === 'kickoff') return m.sp && m.sp.team.index === ut ? 'kickoff' : 'defend';
    if (m.phase === 'setpiece' && m.sp) {
      if (m.sp.team.index !== ut) return 'defend';
      return m.sp.type === 'penalty' ? 'penalty' : 'setpiece';
    }
    const b = m.ball;
    if (b.owner && b.owner.team.index === ut) return 'attack';
    if (!b.owner && b.passTarget && b.passTarget.team.index === ut) return 'attack';
    if (!b.owner && m.lastPossession === ut && m.time - m.lastPossessionT < 0.6) return 'attack';
    return 'defend';
  }

  onButton(name, down, hold = 0) {
    const mv = this.mv;
    if (!mv) return;
    if (this.shootout) {
      this.shootout.onButton(name, down, hold);
      return;
    }
    if (mv.inReplay) {
      if (down) mv.skipReplay();
      return;
    }
    if (mv.hold) {
      if (down) this.endIntro();
      return;
    }
    const m = mv.match;
    const mode = this.controlsMode();
    if (name === 'sprint') return;
    const chargeable = mode === 'attack' || mode === 'setpiece' || mode === 'penalty';
    if (name === 'shoot' && chargeable) {
      if (down) return; // 離したときに打つ
      const power = Math.min(1, 0.25 + hold / 0.85);
      if (mode === 'penalty' && this.penAim) {
        const s = m.sp.team.dir;
        this.act('shoot', { power, aimZ: this.penAim.x * 3.4 * s, aimY: 0.15 + this.penAim.y * 2.2 });
        return;
      }
      this.act('shoot', { power });
      return;
    }
    if (!down) return;
    this.act(name === 'shoot' ? 'shoot' : name, {});
    void m;
  }

  act(action, opts) {
    const m = this.mv.match;
    const c = m.user.controlled;
    // まだボールが届いていない時は少しの間入力を保持（ダイレクトプレー）
    if ((action === 'pass' || action === 'through' || action === 'lob' || action === 'shoot') && m.phase === 'play' && c && m.ball.owner !== c && m.ball.passTarget === c) {
      this.pending = { action, opts, t: 0.45 };
      return;
    }
    m.userAction(action, opts);
  }

  onMatchEvent(e) {
    this.hud?.onEvent(e);
    this.audio.onMatchEvent(e);
    switch (e.type) {
      case 'goal': {
        const userGoal = e.team === this.mv.match.user.team;
        haptic(userGoal ? 120 : 40);
        this.controls?.setVisible(false);
        break;
      }
      case 'kickoffSetup':
        if (!this.mv.hold && !this.pauseEl) this.controls?.setVisible(true);
        break;
      case 'replayStart':
        if (!this.settings.replays) this.mv.skipReplay();
        this.controls?.setVisible(false);
        break;
      case 'replayEnd':
        break;
      case 'halftime':
        setTimeout(() => this.showHalftime(), 1500);
        break;
      case 'fulltime':
        setTimeout(() => this.onFulltime(), 1800);
        break;
      default:
        break;
    }
  }

  showHalftime() {
    const m = this.mv.match;
    this.controls.setVisible(false);
    const go = () => {
      dlg.remove();
      this.overlayClose = null;
      m.startSecondHalf();
      this.controls.setVisible(true);
      this.audio.ui('ok');
    };
    const dlg = S.dialog('ハーフタイム', 'HALF TIME', S.resultContent(m), [S_btn('後半開始', 'primary', go)], true);
    this.overlayClose = () => {};
    this.ui.append(dlg);
  }

  onFulltime() {
    const m = this.mv.match;
    const [a, b] = m.teams;
    if (this.cfg.knockout && a.score === b.score) {
      this.startShootout();
      return;
    }
    this.showFulltime(null);
  }

  startShootout() {
    this.controls.setVisible(true);
    this.hud.setVisible(false);
    this.shootout = new Shootout(this, this.mv, (pk) => {
      this.shootout.destroy();
      this.shootout = null;
      this.hud.setVisible(true);
      this.showFulltime(pk);
    });
  }

  showFulltime(pk) {
    const m = this.mv.match;
    const [a, b] = m.teams;
    this.controls.setVisible(false);
    const result = { h: a.score, a: b.score };
    if (pk) result.pk = pk;
    const ut = m.user.team;
    const myGoals = ut === 0 ? a.score : b.score;
    const opGoals = ut === 0 ? b.score : a.score;
    let won = myGoals > opGoals;
    if (pk) won = ut === 0 ? pk.h > pk.a : pk.a > pk.h;
    const draw = !pk && myGoals === opGoals;
    const head = won ? '勝利！' : draw ? '引き分け' : '敗戦';
    const next = () => {
      dlg.remove();
      this.overlayClose = null;
      this.finishMatch(result, won);
    };
    const dlg = S.dialog(head, 'FULL TIME', S.resultContent(m, pk, true), [S_btn('次へ', 'primary', next)], true);
    this.overlayClose = () => {};
    this.ui.append(dlg);
    haptic(won ? 200 : 30);
  }

  finishMatch(result, won) {
    const cfg = this.cfg;
    if (cfg.fixture && this.tour) {
      this.tour.record(cfg.fixture.id, result);
      const tour = this.tour;
      if (cfg.fixture.id === 'final' && won) {
        this.startCeremony(teamById(tour.user));
        return;
      }
      this.leaveMatch();
      this.showHub(tour);
    } else {
      this.leaveMatch();
      this.showMenu();
    }
  }

  startCeremony(team) {
    this.hud.setVisible(false);
    this.controls.setVisible(false);
    this.ceremony = new Ceremony(this, this.mv, team);
    this.setScreen(
      S.championScreen(team, () => {
        this.ceremony?.destroy();
        this.ceremony = null;
        this.leaveMatch();
        this.showTournamentEnd(this.tour);
      }),
    );
    this.audio.roar(1.4, 9);
    this.audio.startMusic();
  }

  showTournamentEnd(tour) {
    const place = tour.finalPlace(tour.user);
    const me = teamById(tour.user);
    const champ = teamById(tour.s.champion);
    const labels = { 1: '優勝', 2: '準優勝', 3: '3位', 4: '4位' };
    this.mode = 'menu';
    this.backTarget = () => this.showMenu();
    const content = h(
      'div',
      { style: { textAlign: 'center' } },
      h('div', { style: { fontSize: '13px', color: '#9fb0d8' } }, '優勝国'),
      h('div', { style: { fontSize: '26px', fontWeight: 800, margin: '4px 0 10px' } }, champ.name),
      h('div', { style: { fontSize: '13px', color: '#9fb0d8' } }, `${me.name}の成績`),
      h('div', { style: { fontSize: '30px', fontWeight: 800, color: '#ffd84a' } }, labels[place] || ''),
    );
    const close = () => {
      dlg.remove();
      this.overlayClose = null;
      Tournament.clear();
      this.showMenu();
    };
    const dlg = S.dialog('大会終了', 'TOURNAMENT RESULT', content, [S_btn('メニューへ', 'primary', close)]);
    this.setScreen(null);
    this.overlayClose = close;
    this.ui.append(dlg);
  }

  /** 自動テスト用: 時間を手動で進め、入力を注入する */
  installTestHooks() {
    window.__test = {
      quick: (hid, aid, venue = 0, knockout = false, userTeam = 0, weather = 'clear') => {
        const home = teamById(hid);
        const away = teamById(aid);
        this.startMatch({ home, away, kits: chooseKits(home, away), userTeam, venue: VENUES[venue], fixture: null, knockout, label: 'TEST', weather });
      },
      project: (x, y, z) => {
        const v = new THREE.Vector3(x, y, z).project(this.world.camera);
        return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight];
      },
      skipIntro: () => this.endIntro(),
      setpiece: (kind, ti, x, z) => {
        const m = this.mv.match;
        m.startSetPiece(kind, m.teams[ti], x, z);
      },
      camera: (mode) => {
        if (this.mv) this.mv.cameraMode = mode;
      },
      step: (n = 1, dt = 1 / 60) => {
        for (let i = 0; i < n; i++) {
          if (this.mode === 'match' && this.mv) this.updateMatch(dt);
          else if (this.demo) this.demo.update(dt);
        }
      },
      render: () => this.world.render(),
      input: (x, y, mag, sprint = false) => {
        if (!this.controls) return;
        this.controls.testInput = { x, y, mag, sprint };
      },
      button: (name, down, hold = 0) => {
        if (!this.controls) return;
        if (down) this.onButton(name, true);
        else this.onButton(name, false, hold);
      },
      info: () => {
        const m = this.mv?.match;
        if (!m) return { mode: this.mode };
        const c = m.user.controlled;
        return {
          mode: this.mode,
          phase: m.phase,
          clock: m.displayClock.text,
          half: m.half,
          score: m.teams.map((t) => t.score),
          ctrl: c?.name,
          owner: m.ball.owner?.name ?? null,
          ownerTeam: m.ball.owner?.team.index ?? null,
          ball: [m.ball.x, m.ball.y, m.ball.z].map((v) => +v.toFixed(1)),
          ctrlPos: c ? [+c.x.toFixed(1), +c.z.toFixed(1)] : null,
          stats: m.teams.map((t) => t.stats),
          shootout: !!this.shootout,
          overlay: !!document.querySelector('.overlay'),
        };
      },
    };
  }

  // ------------------------------------------------------------ メインループ

  frame(now) {
    if (this.testMode && this.mode === 'match') {
      this.world.render();
      return;
    }
    let dt = (now - this.lastNow) / 1000;
    this.lastNow = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) dt = 1 / 60;
    const w = this.world;
    if (this.mode === 'match' && this.mv) {
      this.updateMatch(dt);
    } else if (this.demo) {
      this.demo.update(dt);
      if (this.demo.match.phase === 'halftime') this.demo.match.startSecondHalf();
      if (this.demo.match.phase === 'fulltime') this.startDemo();
      this.updateDemoCamera(dt);
      this.audio.updateCrowd(dt, 0.15, true);
    }
    w.render();
    this.gfx.trackFrame(dt);
  }

  /** シュートのパワーを操作中の選手の頭上に表示 */
  updatePowerGauge() {
    const c = this.controls;
    const m = this.mv?.match;
    if (!this.powerEl) {
      this.powerEl = h('div', { style: { position: 'absolute', width: '54px', height: '7px', marginLeft: '-27px', borderRadius: '4px', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.6)', overflow: 'hidden', pointerEvents: 'none', display: 'none' } }, h('i', { style: { display: 'block', height: '100%', width: '0%', background: 'linear-gradient(90deg,#ffd84a,#ff5a3a)' } }));
      this.ui.append(this.powerEl);
    }
    const p = m?.user.controlled;
    const charging = c && c.held.shoot && p && (this.controlsMode() === 'attack' || this.controlsMode() === 'setpiece') && !this.shootout;
    if (!charging) {
      this.powerEl.style.display = 'none';
      return;
    }
    const idx = p.team.index * 11 + p.index;
    const hp = this.world.humans.headPos[idx];
    const v = new THREE.Vector3(hp.x, hp.y + 0.9, hp.z).project(this.world.camera);
    this.powerEl.style.display = '';
    this.powerEl.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    this.powerEl.style.top = `${((1 - v.y) / 2) * innerHeight - 18}px`;
    const pw = Math.min(1, 0.25 + ((performance.now() - c.held.shoot) / 1000) / 0.85);
    this.powerEl.firstChild.style.width = `${Math.round(pw * 100)}%`;
  }

  /** 試合中のPK: ユーザーが蹴るときは照準、守るときはダイブ方向 */
  updatePenaltyAim(dt) {
    const m = this.mv.match;
    const c = this.controls;
    const pk = m.phase === 'setpiece' && m.sp?.type === 'penalty' && m.sp.ready;
    if (!this.reticleEl) {
      this.reticleEl = h('div', { style: { position: 'absolute', width: '34px', height: '34px', margin: '-17px 0 0 -17px', borderRadius: '50%', border: '3px solid #ffd84a', boxShadow: '0 0 12px rgba(255,216,74,0.8)', pointerEvents: 'none', display: 'none' } });
      this.ui.append(this.reticleEl);
    }
    if (!pk || !c) {
      this.reticleEl.style.display = 'none';
      this.penAim = null;
      return;
    }
    const st = c.state;
    const s = m.sp.team.dir; // 攻めるゴールの方向
    if (m.sp.team.isUser) {
      if (!this.penAim) this.penAim = { x: 0, y: 0.4 };
      this.penAim.x = Math.max(-1.05, Math.min(1.05, this.penAim.x + st.x * st.mag * dt * 1.6));
      this.penAim.y = Math.max(0, Math.min(1.05, this.penAim.y + st.y * st.mag * dt * 1.2));
      const v = new THREE.Vector3(s * PITCH.HL, 0.15 + this.penAim.y * 2.2, this.penAim.x * 3.4 * s).project(this.world.camera);
      this.reticleEl.style.display = '';
      this.reticleEl.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
      this.reticleEl.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
    } else {
      this.reticleEl.style.display = 'none';
      // カメラはキッカーの背後: 画面の右 = ゴールに向かって右
      m.penaltyUserDive = st.mag > 0.3 && Math.abs(st.x) > 0.3 ? Math.sign(st.x) * s : st.mag > 0.3 ? 0 : undefined;
    }
  }

  updateMatch(dt) {
    const mv = this.mv;
    const m = mv.match;
    const c = this.controls;
    if (c) {
      c.poll();
      const st = c.state;
      // スティックの上下左右は画面上の向き（追従カメラはゴール前で少し振れるため、カメラの向きで回す）
      let fx = 0;
      let fz = -1;
      if (mv.isFollow && !mv.externalCamera) {
        const d = this.world.camera.getWorldDirection(_camDir);
        const l = Math.hypot(d.x, d.z);
        if (l > 0.2) {
          fx = d.x / l;
          fz = d.z / l;
        }
      }
      m.setUserInput(-fz * st.x + fx * st.y, fx * st.x + fz * st.y, st.mag, st.sprint);
      if (this.shootout) c.setMode(this.shootout.userKick ? 'penalty' : this.shootout.userKeep ? 'keeper' : 'defend');
      else c.setMode(this.controlsMode());
    }
    if (this.pending) {
      this.pending.t -= dt;
      const p = m.user.controlled;
      if (p && m.ball.owner === p && !p.busy) {
        m.userAction(this.pending.action, this.pending.opts);
        this.pending = null;
      } else if (this.pending.t <= 0) this.pending = null;
    }
    if (mv.hold) {
      mv.introT = (mv.introT || 0) + dt;
      if (mv.introT > 6.4) this.endIntro();
    }
    if (this.shootout) this.shootout.update(dt);
    else if (this.ceremony) this.ceremony.update(dt);
    else mv.update(dt);
    if (this.hud) {
      this.hud.setView(this.shootout || this.ceremony ? null : mv.footprint, this.projectToScreen);
      this.hud.update(dt);
    }
    this.updatePowerGauge();
    this.updatePenaltyAim(dt);
    // 観客の音
    const b = m.ball;
    const nearGoal = Math.max(0, 1 - Math.min(Math.abs(Math.abs(b.x) - PITCH.HL), 40) / 40);
    const ex = m.phase === 'goal' || m.phase === 'replay' ? 1 : 0.15 + nearGoal * 0.55;
    this.audio.updateCrowd(dt, ex, true);
  }
}

function S_btn(label, cls, fn) {
  const b = h(`div.btn${cls ? `.${cls}` : ''}`, {}, h('span', {}, label));
  b.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    fn();
  });
  return b;
}
