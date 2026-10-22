import { h, icon, tap } from './dom.js';
import { flagImg } from './flags.js';

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
  penalty: 'スティックで狙い → <b>シュート</b>長押しで強さ',
  kickoff: '<b>パス</b>または<b>シュート</b>でキックオフ',
};

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
    this.el.append(this.board, this.halfTag, this.pause, this.ptag, this.hint, this.bannerSlot, this.goalSlot, this.replayTag);
    parent.append(this.el);
    this.bannerT = 0;
    this.lastScores = [0, 0];
    this.fitScale();
  }

  fitScale() {
    const s = Math.min(1.25, Math.max(0.8, innerHeight / 400));
    this.board.style.transform = `scale(${s})`;
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
    this.clock.textContent = c.text;
    if (c.added) {
      this.added.style.display = '';
      this.added.textContent = `+${c.addedTotal || c.added}`;
    } else this.added.style.display = 'none';
    this.halfTag.textContent = m.half === 1 ? '前半' : '後半';
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
      this.ptag.style.display = '';
      this.ptag.children[0].textContent = p.num;
      this.ptag.children[1].textContent = p.name;
      this.ptag.children[2].firstChild.style.width = `${Math.round(p.stamina * 100)}%`;
    } else this.ptag.style.display = 'none';
    // セットプレーのヒント
    let hint = '';
    if (m.phase === 'setpiece' && m.sp && m.sp.ready && m.sp.team.isUser) {
      let k = m.sp.type;
      if (k === 'freekick') {
        const d = Math.hypot(m.sp.team.dir * 52.5 - m.sp.x, m.sp.z);
        if (d > 32 || m.sp.opts.indirect) k = 'freekickFar';
      }
      hint = SP_HINTS[k] || '';
    } else if (m.phase === 'kickoff' && m.sp && m.sp.team.isUser && m.sp.whistled) hint = SP_HINTS.kickoff;
    if (hint !== this.hintText) {
      this.hintText = hint;
      this.hint.innerHTML = hint;
      this.hint.style.display = hint ? '' : 'none';
    }
    void controlsMode;
  }

  setVisible(v) {
    this.el.style.display = v ? '' : 'none';
  }

  destroy() {
    this.el.remove();
  }
}
