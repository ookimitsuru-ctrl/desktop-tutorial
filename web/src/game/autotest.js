import { PITCH } from '../config.js';
import { TEAMS, teamById, chooseKits } from '../data/teams.js';
import { VENUES } from './settings.js';

// 自動テストモード（URL に ?autoplay=1）。
// ボットがユーザーチームを実際のボタン操作と同じ経路で動かし、フレーム時間・カクつき・
// シェーダの読み込み・メモリ・エラーを記録して「WSPERF {json}」の行でログに出す。
// ブラウザ（Playwright）でも実機（adb logcat）でも同じ形式で集められる。
//
// パラメータ: matches=試合数, home/away=チームID, venue=0-3, weather=clear|rain, fast=1（早送り）
// （難易度・画質・試合時間・カメラは difficulty / quality / half / cam で指定）

const WINDOW = 5; // 集計の区切り[秒]
const LONG_FRAME = 0.1; // これより長いフレームは原因の手がかりと一緒に記録

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export class AutoTest {
  constructor(app, qp) {
    this.app = app;
    this.matches = Math.max(1, +(qp.get('matches') || 1));
    this.home = qp.get('home') || 'JPN';
    this.away = qp.get('away') || null;
    this.venue = qp.get('venue') !== null ? +qp.get('venue') : null;
    this.weather = qp.get('weather') || null;
    this.label = qp.get('label') || '';
    // fast=1: 描画を間引き、試合の処理は1/60秒刻みで全て行う（描画の遅い環境でのテスト用）
    this.fastMode = qp.get('fast') === '1';
    this.played = 0;
    this.log = [];
    this.releases = [];
    this.actT = 0;
    this.recent = [];
    this.errors = 0;
    window.__perf = this.log;
    addEventListener('error', (e) => this.emit({ t: 'error', msg: String(e.message || e.error), at: this.where() }));
    addEventListener('unhandledrejection', (e) => this.emit({ t: 'error', msg: String(e.reason), at: this.where() }));
    this.resetMatchStats();
  }

  emit(o) {
    if (o.t === 'error') this.errors++;
    this.log.push(o);
    console.log(`WSPERF ${JSON.stringify(o)}`);
  }

  where() {
    const m = this.app.mv?.match;
    return m ? `${m.phase} ${m.displayClock?.text ?? ''}` : this.app.mode;
  }

  config() {
    const s = this.app.settings;
    return { label: this.label, difficulty: s.difficulty, quality: s.quality, tier: this.app.gfx.qualityName, cam: s.camera, half: s.halfMinutes };
  }

  /** タイトル画面が出たら最初の試合を始める */
  begin() {
    this.emit({ t: 'start', ...this.config(), ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio });
    setTimeout(() => this.nextMatch(), 1500);
  }

  nextMatch() {
    if (this.played >= this.matches) {
      this.emit({ t: 'done', matches: this.played, errors: this.errors });
      return;
    }
    const app = this.app;
    const home = teamById(this.home);
    const others = TEAMS.filter((t) => t.id !== home.id);
    const away = this.away ? teamById(this.away) : others[this.played % others.length];
    const venue = VENUES[this.venue ?? this.played % VENUES.length];
    const weather = this.weather ?? (this.played % 3 === 2 ? 'rain' : 'clear');
    this.matchInfo = { home: home.id, away: away.id, venue: venue.name, preset: venue.preset, weather };
    app.startMatch({ home, away, kits: chooseKits(home, away), userTeam: 0, venue, fixture: null, knockout: false, label: 'AUTO TEST', weather });
    this.resetMatchStats();
    this.emit({ t: 'match', n: this.played + 1, ...this.matchInfo, ...this.config() });
  }

  resetMatchStats() {
    // iv: フレーム間隔（実時間モード）, upd: 1フレーム分の更新処理, rend: 描画命令の発行
    this.win = { iv: [], upd: [], rend: [], t0: performance.now(), sim0: 0 };
    this.all = { iv: [], upd: [], rend: [], j33: 0, j50: 0, j100: 0, u8: 0, u16: 0, maxIv: 0, maxUpd: 0, maxAt: '', realT0: performance.now() };
    this.heap = { start: 0, max: 0 };
    this.programs0 = null;
    this.lastPrograms = null;
    this.knownPrograms = new Set();
    this.shaders = 0;
    this.phase = { name: '', since: 0 };
  }

  onEvent(e) {
    this.recent.push({ type: e.type, at: performance.now() });
    if (this.recent.length > 12) this.recent.shift();
  }

  /** 試合終了（結果画面） */
  onFulltime() {
    const m = this.app.mv.match;
    const a = this.all;
    const info = this.app.gfx.renderer.info;
    const sorted = (arr) => Float32Array.from(arr).sort();
    const upd = sorted(a.upd);
    const o = {
      t: 'summary',
      n: this.played + 1,
      mode: this.fast ? 'fast' : 'realtime',
      ...this.matchInfo,
      ...this.config(),
      score: [m.teams[0].score, m.teams[1].score],
      shots: [m.teams[0].stats.shots, m.teams[1].stats.shots],
      simFrames: a.upd.length,
      realSec: +((performance.now() - a.realT0) / 1000).toFixed(1),
      updMean: +((a.upd.reduce((s, v) => s + v, 0) / Math.max(1, a.upd.length)) * 1000).toFixed(2),
      updP95: +(pct(upd, 0.95) * 1000).toFixed(2),
      updP99: +(pct(upd, 0.99) * 1000).toFixed(2),
      updMax: +(a.maxUpd * 1000).toFixed(1),
      upd8: a.u8,
      upd16: a.u16,
      maxAt: a.maxAt,
      shaders: this.shaders,
      programs: info.programs?.length ?? 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      heapStartMB: this.heap.start,
      heapMaxMB: this.heap.max,
      heapEndMB: this.heapMB(),
      errors: this.errors,
    };
    if (!this.fast) {
      const iv = sorted(a.iv);
      const secs = a.iv.reduce((s, v) => s + v, 0);
      Object.assign(o, {
        fps: +(a.iv.length / Math.max(1e-3, secs)).toFixed(1),
        p50: +(pct(iv, 0.5) * 1000).toFixed(1),
        p95: +(pct(iv, 0.95) * 1000).toFixed(1),
        p99: +(pct(iv, 0.99) * 1000).toFixed(1),
        maxIv: +(a.maxIv * 1000).toFixed(1),
        jank33: a.j33,
        jank50: a.j50,
        jank100: a.j100,
      });
    } else {
      const r = sorted(a.rend);
      Object.assign(o, { renders: a.rend.length, rendP50: +(pct(r, 0.5) * 1000).toFixed(1), rendMax: +(pct(r, 1) * 1000).toFixed(1) });
    }
    this.emit(o);
    this.played++;
    // 結果画面を少し見せてから次の試合へ
    setTimeout(() => {
      this.app.overlayNext?.();
      this.app.overlayNext = null;
      setTimeout(() => this.nextMatch(), 1500);
    }, 2500);
  }

  heapMB() {
    const mem = performance.memory;
    return mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : 0;
  }

  get fast() {
    return this.fastMode;
  }

  /** 1フレーム分の更新処理（試合の進行・ボット・カメラ・HUD など）にかかった時間[秒] */
  onUpdate(upd) {
    const app = this.app;
    if (app.mode !== 'match' || !app.mv || app.mv.hold) return;
    const m = app.mv.match;
    const a = this.all;
    this.win.upd.push(upd);
    a.upd.push(upd);
    if (upd > 0.008) a.u8++;
    if (upd > 0.016) a.u16++;
    if (upd > a.maxUpd) {
      a.maxUpd = upd;
      if (this.fast) a.maxAt = `${this.where()} [${this.recentTypes().join(',')}]`;
    }
    if (upd > 0.016) this.emit({ t: 'spike', updMs: +(upd * 1000).toFixed(1), at: this.where(), events: this.recentTypes() });
    // フェーズが動かない（進行不能）検出。試合内の時間で判定（描画が遅い環境でも誤検知しない）
    if (m.phase !== this.phase.name) {
      this.phase.name = m.phase;
      this.phase.since = m.time;
    } else if (m.phase !== 'play' && m.phase !== 'halftime' && m.phase !== 'fulltime' && m.time - this.phase.since > 40) {
      this.emit({ t: 'stuck', phase: m.phase, at: this.where(), sp: m.sp?.type ?? null });
      this.phase.since = m.time;
    }
  }

  /** 描画のあと: シェーダの追加とメモリ、一定間隔の集計 */
  afterRender(rend, iv) {
    const app = this.app;
    if (app.mode !== 'match' || !app.mv) return;
    const info = app.gfx.renderer.info;
    const programs = info.programs?.length ?? 0;
    if (this.programs0 === null) {
      this.programs0 = programs;
      this.heap.start = this.heapMB();
    } else if (programs !== this.lastPrograms) {
      // 試合中に新しいシェーダが作られた = その瞬間に一瞬止まる原因
      this.shaders += Math.max(0, programs - this.lastPrograms);
      this.emit({ t: 'shader', from: this.lastPrograms, to: programs, who: this.newProgramUsers(), at: this.where(), renderMs: +(rend * 1000).toFixed(1), events: this.recentTypes() });
    }
    this.lastPrograms = programs;
    this.knownPrograms = new Set(info.programs || []);
    const live = !app.mv.hold;
    const a = this.all;
    if (live) {
      this.win.rend.push(rend);
      a.rend.push(rend);
      if (!this.fast) {
        this.win.iv.push(iv);
        a.iv.push(iv);
        if (iv > 1 / 30 + 0.0005) a.j33++;
        if (iv > 0.05) a.j50++;
        if (iv > LONG_FRAME) a.j100++;
        if (iv > a.maxIv) {
          a.maxIv = iv;
          a.maxAt = `${this.where()} [${this.recentTypes().join(',')}]`;
        }
        if (iv > LONG_FRAME) this.emit({ t: 'long', ivMs: +(iv * 1000).toFixed(1), at: this.where(), events: this.recentTypes() });
      }
    }
    const now = performance.now();
    const m = app.mv.match;
    const due = this.fast ? m.time - this.win.sim0 >= WINDOW : now - this.win.t0 >= WINDOW * 1000;
    if (due && this.win.upd.length) {
      const u = Float32Array.from(this.win.upd).sort();
      const heap = this.heapMB();
      this.heap.max = Math.max(this.heap.max, heap);
      const o = {
        t: 'win',
        at: this.where(),
        tier: app.gfx.qualityName,
        scale: +app.gfx.dynScale.toFixed(2),
        upd: +(pct(u, 0.5) * 1000).toFixed(2),
        upd95: +(pct(u, 0.95) * 1000).toFixed(2),
        updMax: +(pct(u, 1) * 1000).toFixed(1),
        calls: info.render.calls,
        tris: info.render.triangles,
        heap,
      };
      if (!this.fast && this.win.iv.length) {
        const iv2 = Float32Array.from(this.win.iv).sort();
        Object.assign(o, { fps: +(this.win.iv.length / ((now - this.win.t0) / 1000)).toFixed(1), p50: +(pct(iv2, 0.5) * 1000).toFixed(1), p95: +(pct(iv2, 0.95) * 1000).toFixed(1), max: +(pct(iv2, 1) * 1000).toFixed(1) });
      } else o.simSpeed = +((m.time - this.win.sim0) / ((now - this.win.t0) / 1000)).toFixed(2);
      this.emit(o);
      this.win = { iv: [], upd: [], rend: [], t0: now, sim0: m.time };
    }
  }

  /** 新しく作られたシェーダを使っている描画物（原因の特定用） */
  newProgramUsers() {
    const r = this.app.gfx.renderer;
    const fresh = new Set((r.info.programs || []).filter((p) => !this.knownPrograms.has(p)));
    const who = new Set();
    this.app.world.scene.traverse((o) => {
      for (const mt of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!mt) continue;
        const pr = r.properties.get(mt).currentProgram;
        if (pr && fresh.has(pr)) who.add(`${o.name || o.type}:${mt.type}${mt.name ? `/${mt.name}` : ''}`);
      }
    });
    // シーンの描画物に属さないもの（影の描画用・仕上げ処理用など）はキーの先頭で示す
    if (!who.size) {
      // 既存の同種シェーダとキーを比べ、違う項目の位置と値を示す
      const old = (r.info.programs || []).filter((p) => !fresh.has(p));
      for (const p of fresh) {
        const k = String(p.cacheKey).split(',');
        const kind = k[0];
        const diffs = old
          .map((q) => String(q.cacheKey).split(','))
          .filter((q) => q[0] === kind && q.length === k.length)
          .map((q) => k.map((v, i) => (v !== q[i] ? `${i}:${q[i]}→${v}` : null)).filter(Boolean));
        diffs.sort((a, b) => a.length - b.length);
        who.add(`?${kind} diff ${JSON.stringify(diffs[0] || 'none')}`);
      }
    }
    return [...who];
  }

  recentTypes() {
    const now = performance.now();
    return this.recent.filter((r) => now - r.at < 600).map((r) => r.type);
  }

  // ------------------------------------------------------------ ボット

  press(name, hold = 0) {
    this.app.onButton(name, true);
    this.releases.push({ name, t: hold, hold });
  }

  /** 毎フレーム: ボットの操作（スティックとボタン）を入力する */
  drive(dt) {
    const app = this.app;
    const mv = app.mv;
    const ctl = app.controls;
    if (!mv || !ctl) return;
    for (let i = this.releases.length - 1; i >= 0; i--) {
      const r = this.releases[i];
      r.t -= dt;
      if (r.t <= 0) {
        this.releases.splice(i, 1);
        app.onButton(r.name, false, r.hold);
      }
    }
    this.actT -= dt;
    const m = mv.match;
    const team = m.teams[m.user.team];
    const c = m.user.controlled;
    const b = m.ball;
    let wx = 0;
    let wz = 0;
    let mag = 0;
    let sprint = false;
    if (!mv.hold && !mv.inReplay) {
      const sp = m.sp;
      if (m.phase === 'kickoff' && sp?.team === team && sp.whistled && this.actT <= 0) {
        this.press('pass');
        this.actT = 1.5;
      } else if (m.phase === 'setpiece' && sp?.ready) {
        if (sp.team === team && this.actT <= 0) {
          if (sp.type === 'penalty') {
            wx = 0.3;
            wz = Math.random() - 0.5;
            mag = 1;
            this.press('shoot', 0.3 + Math.random() * 0.3);
          } else {
            const r = Math.random();
            this.press(r < 0.5 ? 'pass' : r < 0.8 ? 'lob' : 'through');
          }
          this.actT = 1.2;
        } else if (sp.type === 'penalty' && sp.team !== team) {
          // GKのダイブ方向をスティックで（画面の左右）
          wz = this.diveSide || (this.diveSide = Math.random() < 0.5 ? -1 : 1);
          mag = 1;
        }
      } else if (m.phase === 'play' && c) {
        this.diveSide = 0;
        const dir = team.dir;
        if (b.owner === c) {
          const gx = dir * PITCH.HL;
          const dx = gx - c.x;
          const dz = -c.z * 0.4;
          const l = Math.hypot(dx, dz) || 1;
          let nd = 99;
          for (const o of m.teams[1 - team.index].players) nd = Math.min(nd, Math.hypot(o.x - c.x, o.z - c.z));
          wx = dx / l;
          wz = dz / l;
          mag = 1;
          sprint = nd > 3;
          const dist = Math.hypot(gx - c.x, c.z);
          if (this.actT <= 0 && !c.busy) {
            if (dist < 21) {
              this.press('shoot', 0.25 + Math.random() * 0.35);
              this.actT = 0.9;
            } else if (nd < 2.2 && Math.random() < 0.5) {
              wx = dir;
              wz = Math.random() - 0.5;
              this.press(Math.random() < 0.7 ? 'pass' : 'through');
              this.actT = 0.6;
            } else if (Math.random() < 0.004) {
              this.press('lob');
              this.actT = 0.8;
            }
          }
        } else if (!b.owner || b.owner.team !== team) {
          const tx = b.owner ? b.owner.x : b.x;
          const tz = b.owner ? b.owner.z : b.z;
          const dx = tx - c.x;
          const dz = tz - c.z;
          const l = Math.hypot(dx, dz) || 1;
          wx = dx / l;
          wz = dz / l;
          mag = 1;
          sprint = l > 5;
          if (b.owner && l < 1.6 && this.actT <= 0) {
            this.press(Math.random() < 0.85 ? 'through' : 'shoot');
            this.actT = 0.7;
          }
        }
      }
    }
    // ワールドの向き → 画面上のスティック（App.updateMatch の変換の逆）
    const [fx, fz] = app.stickBasis();
    ctl.testInput = { x: -fz * wx + fx * wz, y: fx * wx + fz * wz, mag, sprint };
  }
}
