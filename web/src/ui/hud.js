import { h, icon, tap, setText, setStyle } from './dom.js';
import { flagImg } from './flags.js';
import { PITCH } from '../config.js';

// 試合中のHUD: スコアボード、時計、イベントのバナー、ゴール演出、操作中の選手表示

const SP_NAMES = {
  throwin: 'スローイン',
  corner: 'コーナーキック',
  goalkick: 'ゴールキック',
  freekick: 'フリーキック',
  penalty: 'ペナルティキック',
};

const SP_HINTS = {
  throwin: 'スティックで方向 → <b>パス</b>で投げる',
  corner: '<b>クロス</b>でゴール前へ / <b>パス</b>でショートコーナー',
  goalkick: '<b>ロブ</b>でロングキック / <b>パス</b>で近くへ',
  freekick: '<b>シュート</b>長押しで直接狙う / <b>パス</b>・<b>クロス</b>',
  freekickFar: '<b>パス</b> / <b>スルー</b> / <b>クロス</b>で再開',
  penalty: 'スティックで狙い → <b>シュート</b>長押しで強さ、離して蹴る',
  penaltyKeep: 'スティックでGKが飛ぶ方向を選ぶ',
  kickoff: '<b>パス</b>または<b>シュート</b>でキックオフ',
};

// レーダー: ピッチ全体の選手とボールの位置、カメラに映っている範囲
const RM = 3; // ピッチ外の余白[m]

class Radar {
  constructor(match) {
    this.match = match;
    this.el = h('canvas.radar');
    this.g = this.el.getContext('2d');
    this.footprint = null;
    this.frame = 0;
    this.resize();
  }

  resize() {
    const w = Math.round(Math.min(190, Math.max(128, innerWidth * 0.17)));
    const hh = Math.round((w * (PITCH.HW + RM)) / (PITCH.HL + RM));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = hh;
    this.dpr = dpr;
    this.el.width = Math.round(w * dpr);
    this.el.height = Math.round(hh * dpr);
    this.el.style.width = `${w}px`;
    this.el.style.height = `${hh}px`;
  }

  px(x) {
    return ((x + PITCH.HL + RM) / (2 * (PITCH.HL + RM))) * this.w;
  }

  py(z) {
    return ((z + PITCH.HW + RM) / (2 * (PITCH.HW + RM))) * this.h;
  }

  draw() {
    // 描画は30fpsで十分
    if (this.frame++ % 2) return;
    const g = this.g;
    const m = this.match;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    // ピッチ
    const x0 = this.px(-PITCH.HL);
    const x1 = this.px(PITCH.HL);
    const z0 = this.py(-PITCH.HW);
    const z1 = this.py(PITCH.HW);
    const sx = (x1 - x0) / PITCH.L;
    g.fillStyle = 'rgba(20, 70, 36, 0.55)';
    g.fillRect(x0, z0, x1 - x0, z1 - z0);
    // カメラに映っている範囲
    const fp = this.footprint;
    if (fp) {
      g.save();
      g.beginPath();
      g.rect(x0, z0, x1 - x0, z1 - z0);
      g.clip();
      g.beginPath();
      fp.forEach((p, i) => (i ? g.lineTo(this.px(p.x), this.py(p.z)) : g.moveTo(this.px(p.x), this.py(p.z))));
      g.closePath();
      g.fillStyle = 'rgba(255, 255, 255, 0.12)';
      g.fill();
      g.restore();
    }
    g.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    g.lineWidth = 1;
    g.strokeRect(x0, z0, x1 - x0, z1 - z0);
    const cx = this.px(0);
    const cz = this.py(0);
    g.beginPath();
    g.moveTo(cx, z0);
    g.lineTo(cx, z1);
    g.moveTo(cx + PITCH.circleR * sx, cz);
    g.arc(cx, cz, PITCH.circleR * sx, 0, Math.PI * 2);
    for (const s of [-1, 1]) {
      const gx = this.px(s * PITCH.HL);
      const bx = this.px(s * (PITCH.HL - PITCH.boxDepth));
      g.moveTo(gx, this.py(-PITCH.boxHalfW));
      g.lineTo(bx, this.py(-PITCH.boxHalfW));
      g.lineTo(bx, this.py(PITCH.boxHalfW));
      g.lineTo(gx, this.py(PITCH.boxHalfW));
    }
    g.stroke();
    // 選手
    const ctrl = m.user.controlled;
    for (const t of m.teams) {
      g.fillStyle = t.kit.shirt;
      for (const p of t.players) {
        if (p === ctrl) continue;
        g.beginPath();
        g.arc(this.px(p.x), this.py(p.z), 2.7, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        g.stroke();
      }
    }
    if (ctrl) {
      g.beginPath();
      g.arc(this.px(ctrl.x), this.py(ctrl.z), 3.6, 0, Math.PI * 2);
      g.fillStyle = ctrl.team.kit.shirt;
      g.fill();
      g.lineWidth = 1.6;
      g.strokeStyle = '#ffe14a';
      g.stroke();
    }
    // ボール
    const b = m.ball;
    g.beginPath();
    g.arc(this.px(b.x), this.py(b.z), 2.4, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = '#000000';
    g.stroke();
  }
}

export class HUD {
  constructor(parent, match, { onPause } = {}) {
    this.match = match;
    const [a, b] = match.teams;
    this.el = h('div.hud');
    const cbar = (t) => h('i.cbar', { style: { background: `linear-gradient(180deg, ${t.kit.shirt}, ${t.kit.shirt2})` } });
    this.scoreA = h('span', {}, '0');
    this.scoreB = h('span', {}, '0');
    this.clock = h('div.clock', {}, '00:00');
    this.added = h('div.added', { style: { display: 'none' } }, '+0');
    this.board = h(
      'div.scoreboard',
      {},
      h('div.tm', {}, cbar(a), flagImg(a.data), a.data.id),
      h('div.score', {}, this.scoreA, h('span.dash', {}, '-'), this.scoreB),
      h('div.tm.away', {}, b.data.id, flagImg(b.data), cbar(b)),
      this.clock,
      this.added,
    );
    this.halfTag = h('div.half-tag', {}, '前半');
    this.pause = tap(h('div.pause-btn', {}, icon('pause')), () => onPause?.());
    this.ptag = h('div.ptag', { style: { display: 'none' } }, h('span.no', {}, ''), h('span.nm', {}, ''), h('span.stam', {}, h('i')));
    this.hint = h('div.hint-bar', { style: { display: 'none' } });
    this.bannerSlot = h('div');
    this.goalSlot = h('div');
    this.replayTag = h('div', { style: { display: 'none' } }, h('div.replay-tag', {}, 'REPLAY'), h('div.skip-hint', {}, 'タップでスキップ'));
    this.radar = new Radar(match);
    // 操作中の選手が画面外にいるときの矢印
    this.offArrow = h('div.off-arrow', { style: { display: 'none' } }, h('i'), h('span', {}, ''));
    this.el.append(this.board, this.halfTag, this.pause, this.radar.el, this.offArrow, this.ptag, this.hint, this.bannerSlot, this.goalSlot, this.replayTag);
    parent.append(this.el);
    this.bannerT = 0;
    this.lastScores = [0, 0];
    this.fitScale();
  }

  fitScale() {
    const s = Math.min(1.25, Math.max(0.8, innerHeight / 400));
    this.board.style.transform = `scale(${s})`;
    this.radar?.resize();
  }

  setRadar(on) {
    this.radarOn = on;
    this.radarShown = null;
  }

  /**
   * カメラの情報: 画面に映る地面の四隅と、ワールド座標→画面座標の変換
   * @param {{x:number,z:number}[]|null} footprint
   * @param {(x:number,y:number,z:number)=>{x:number,y:number,behind:boolean}} project
   */
  setView(footprint, project) {
    this.radar.footprint = footprint;
    this.project = project;
  }

  banner(main, sub = '', cls = '', dur = 1.8) {
    this.bannerSlot.innerHTML = '';
    const b = h(`div.banner${cls ? `.${cls}` : ''}`, {}, cls === 'yellow' ? h('b') : null, h('span', {}, main), sub ? h('span.sub', {}, sub) : null);
    this.bannerSlot.append(b);
    this.bannerT = dur;
    this.bannerEl = b;
  }

  goal(e) {
    const m = this.match;
    const team = m.teams[e.team];
    this.goalSlot.innerHTML = '';
    const scorer = e.scorer ? e.scorer.name : '';
    const sub = h(
      'div.goal-sub',
      {},
      h('span', {}, flagImg(team.data, 'mini-flag')),
      h('span', {}, e.ownGoal ? `オウンゴール（${scorer}）` : scorer),
      h('span.min', {}, `${e.minute + 1}'`),
    );
    const el = h('div.goal-overlay', {}, h('div.goal-text', {}, 'GOAL!'), sub);
    this.goalSlot.append(el);
    this.goalT = 3.6;
  }

  onEvent(e) {
    const m = this.match;
    switch (e.type) {
      case 'goal':
        this.goal(e);
        break;
      case 'setpiece': {
        const t = m.teams[e.team];
        this.banner(SP_NAMES[e.kind] || '', t.data.name, '', 1.6);
        break;
      }
      case 'offside':
        this.banner('オフサイド', e.player.name, '', 1.8);
        break;
      case 'foul':
        this.banner(e.penalty ? 'PK!!' : 'ファウル', `${e.fouler.name}`, '', 1.6);
        break;
      case 'card':
        setTimeout(() => this.banner('イエローカード', e.player.name, 'yellow', 2.0), 900);
        break;
      case 'post':
        this.banner('ポスト！', '', '', 1.1);
        break;
      case 'save':
        if (e.kind === 'parry' || Math.random() < 0.5) this.banner('ナイスセーブ！', e.player.name, '', 1.3);
        break;
      case 'addedTime':
        this.banner(`アディショナルタイム +${e.minutes}`, '', '', 2.0);
        break;
      case 'replayStart':
        this.replayTag.style.display = '';
        this.goalSlot.innerHTML = '';
        break;
      case 'replayEnd':
        this.replayTag.style.display = 'none';
        break;
      default:
        break;
    }
  }

  update(dt, controlsMode) {
    const m = this.match;
    const c = m.displayClock;
    // 毎フレーム呼ばれるので、値が変わったときだけDOMを書き換える
    setText(this.clock, c.text);
    if (c.added) {
      setStyle(this.added, 'display', '');
      setText(this.added, `+${c.addedTotal || c.added}`);
    } else setStyle(this.added, 'display', 'none');
    setText(this.halfTag, m.half === 1 ? '前半' : '後半');
    const [a, b] = m.teams;
    if (a.score !== this.lastScores[0]) {
      this.scoreA.textContent = a.score;
      this.scoreA.classList.remove('bump');
      void this.scoreA.offsetWidth;
      this.scoreA.classList.add('bump');
    }
    if (b.score !== this.lastScores[1]) {
      this.scoreB.textContent = b.score;
      this.scoreB.classList.remove('bump');
      void this.scoreB.offsetWidth;
      this.scoreB.classList.add('bump');
    }
    this.lastScores = [a.score, b.score];
    // バナー
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0 && this.bannerEl) {
        this.bannerEl.classList.add('out');
        const el = this.bannerEl;
        setTimeout(() => el.remove(), 300);
      }
    }
    if (this.goalT > 0) {
      this.goalT -= dt;
      if (this.goalT <= 0) this.goalSlot.innerHTML = '';
    }
    // 操作中の選手
    const p = m.user.controlled;
    if (p && (m.phase === 'play' || m.phase === 'setpiece' || m.phase === 'kickoff')) {
      setStyle(this.ptag, 'display', '');
      setText(this.ptag.children[0], p.num);
      setText(this.ptag.children[1], p.name);
      setStyle(this.ptag.children[2].firstChild, 'width', `${Math.round(p.stamina * 100)}%`);
    } else setStyle(this.ptag, 'display', 'none');
    // レーダー
    // 追従カメラのときだけ（PKや喜びの寄りのカメラ、ピッチ全体が映るワイドでは不要）
    const live = !!this.radar.footprint && m.phase !== 'replay' && m.phase !== 'halftime' && m.phase !== 'fulltime';
    const show = !!this.radarOn && live;
    if (show !== this.radarShown) {
      this.radarShown = show;
      this.radar.el.style.display = show ? '' : 'none';
      this.el.classList.toggle('with-radar', show);
    }
    if (show) this.radar.draw();
    this.updateOffArrow(p && (m.phase === 'play' || m.phase === 'setpiece') ? p : null);
    // セットプレーのヒント
    let hint = '';
    if (m.phase === 'setpiece' && m.sp && m.sp.ready && m.sp.team.isUser) {
      let k = m.sp.type;
      if (k === 'freekick') {
        const d = Math.hypot(m.sp.team.dir * 52.5 - m.sp.x, m.sp.z);
        if (d > 32 || m.sp.opts.indirect) k = 'freekickFar';
      }
      hint = SP_HINTS[k] || '';
    } else if (m.phase === 'setpiece' && m.sp && m.sp.ready && m.sp.type === 'penalty' && !m.sp.team.isUser && m.user.team !== null && m.user.team !== undefined) {
      hint = SP_HINTS.penaltyKeep;
    } else if (m.phase === 'kickoff' && m.sp && m.sp.team.isUser && m.sp.whistled) hint = SP_HINTS.kickoff;
    if (hint !== this.hintText) {
      this.hintText = hint;
      this.hint.innerHTML = hint;
      this.hint.style.display = hint ? '' : 'none';
    }
    void controlsMode;
  }

  /** 操作中の選手が画面外なら、画面の端にその方向を指す矢印と背番号を出す */
  updateOffArrow(p) {
    const a = this.offArrow;
    const s = p && this.project ? this.project(p.x, 1.0, p.z) : null;
    const W = innerWidth;
    const H = innerHeight;
    const pad = 40;
    if (!s || (!s.behind && s.x > 0 && s.x < W && s.y > 0 && s.y < H)) {
      setStyle(a, 'display', 'none');
      return;
    }
    let dx = s.x - W / 2;
    let dy = s.y - H / 2;
    if (s.behind) {
      dx = -dx;
      dy = -dy;
    }
    const k = Math.min((W / 2 - pad) / Math.max(1e-3, Math.abs(dx)), (H / 2 - pad) / Math.max(1e-3, Math.abs(dy)));
    const x = W / 2 + dx * k;
    const y = H / 2 + dy * k;
    setStyle(a, 'display', '');
    a.style.transform = `translate(${x}px, ${y}px)`;
    a.firstChild.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    setText(a.lastChild, p.num);
  }

  setVisible(v) {
    this.el.style.display = v ? '' : 'none';
  }

  destroy() {
    this.el.remove();
  }
}
