import { TEAMS, teamById } from '../data/teams.js';
import { makeRng } from '../util/math.js';
import { load, save, remove } from '../platform.js';

// ワールドカップ: 4チームの総当たり（3節）→ 決勝と3位決定戦

const ROUND_NAMES = { 1: 'グループステージ 第1節', 2: 'グループステージ 第2節', 3: 'グループステージ 第3節', final: '決勝', third: '3位決定戦' };

export function roundName(r) {
  return ROUND_NAMES[r] || '';
}

function poisson(lambda, rng) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

export class Tournament {
  constructor(state) {
    this.s = state;
  }

  static create(userTeamId, seed = Date.now() & 0xffff) {
    const rng = makeRng(seed);
    const others = TEAMS.map((t) => t.id).filter((id) => id !== userTeamId);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    const [A, B, C, D] = [userTeamId, ...others];
    const fx = (round, home, away, venue) => ({ id: `${round}-${home}-${away}`, round, stage: 'group', home, away, venue, result: null, weather: rng() < 0.25 ? 'rain' : 'clear' });
    const fixtures = [
      fx(1, A, B, 0),
      fx(1, C, D, 1),
      fx(2, C, A, 1),
      fx(2, B, D, 2),
      fx(3, A, D, 2),
      fx(3, B, C, 0),
    ];
    return new Tournament({ seed, user: userTeamId, teams: [A, B, C, D], fixtures, stage: 'group', champion: null, finished: false });
  }

  static load() {
    const s = load('tournament', null);
    return s ? new Tournament(s) : null;
  }

  save() {
    save('tournament', this.s);
  }

  static clear() {
    remove('tournament');
  }

  get user() {
    return this.s.user;
  }

  get fixtures() {
    return this.s.fixtures;
  }

  standings() {
    const rows = new Map(this.s.teams.map((id) => [id, { id, team: teamById(id), P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 }]));
    for (const f of this.s.fixtures) {
      if (f.stage !== 'group' || !f.result) continue;
      const h = rows.get(f.home);
      const a = rows.get(f.away);
      const { h: hg, a: ag } = f.result;
      h.P++;
      a.P++;
      h.GF += hg;
      h.GA += ag;
      a.GF += ag;
      a.GA += hg;
      if (hg > ag) {
        h.W++;
        a.L++;
        h.Pts += 3;
      } else if (hg < ag) {
        a.W++;
        h.L++;
        a.Pts += 3;
      } else {
        h.D++;
        a.D++;
        h.Pts++;
        a.Pts++;
      }
    }
    const list = [...rows.values()];
    for (const r of list) r.GD = r.GF - r.GA;
    const h2h = (x, y) => {
      const f = this.s.fixtures.find((q) => q.stage === 'group' && q.result && ((q.home === x.id && q.away === y.id) || (q.home === y.id && q.away === x.id)));
      if (!f) return 0;
      const xg = f.home === x.id ? f.result.h : f.result.a;
      const yg = f.home === x.id ? f.result.a : f.result.h;
      return yg - xg;
    };
    list.sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF || h2h(x, y) || x.team.ovr - y.team.ovr);
    return list;
  }

  /** ユーザーの次の試合 */
  nextUserFixture() {
    return this.s.fixtures.find((f) => !f.result && (f.home === this.user || f.away === this.user)) || null;
  }

  /** ユーザーの試合と同じ節の他の試合をシミュレート */
  simulateOthers(round) {
    const rng = makeRng(this.s.seed + this.s.fixtures.filter((f) => f.result).length * 97);
    for (const f of this.s.fixtures) {
      if (f.round !== round || f.result || f.home === this.user || f.away === this.user) continue;
      f.result = Tournament.simulate(f, rng);
    }
  }

  static simulate(f, rng) {
    const h = teamById(f.home);
    const a = teamById(f.away);
    const diff = (h.ovr - a.ovr) / 10;
    const lh = 1.35 * Math.exp(diff * 0.55);
    const la = 1.2 * Math.exp(-diff * 0.55);
    const r = { h: poisson(lh, rng), a: poisson(la, rng) };
    if (f.stage !== 'group' && r.h === r.a) {
      let ph = 0;
      let pa = 0;
      for (let i = 0; i < 5; i++) {
        ph += rng() < 0.76 ? 1 : 0;
        pa += rng() < 0.74 ? 1 : 0;
      }
      while (ph === pa) {
        ph += rng() < 0.75 ? 1 : 0;
        pa += rng() < 0.75 ? 1 : 0;
      }
      r.pk = { h: ph, a: pa };
    }
    return r;
  }

  record(fixtureId, result) {
    const f = this.s.fixtures.find((q) => q.id === fixtureId);
    if (!f) return;
    f.result = result;
    if (f.stage === 'group') this.simulateOthers(f.round);
    this.advance();
    this.save();
  }

  /** グループ終了 → 決勝・3位決定戦を作る / 全試合終了 → 優勝決定 */
  advance() {
    const s = this.s;
    if (s.stage === 'group' && s.fixtures.filter((f) => f.stage === 'group').every((f) => f.result)) {
      const st = this.standings();
      const wr = makeRng(s.seed + 31);
      s.fixtures.push({ id: 'third', round: 'third', stage: 'knockout', home: st[2].id, away: st[3].id, venue: 1, result: null, weather: wr() < 0.2 ? 'rain' : 'clear' });
      s.fixtures.push({ id: 'final', round: 'final', stage: 'knockout', home: st[0].id, away: st[1].id, venue: 3, result: null, weather: wr() < 0.2 ? 'rain' : 'clear' });
      s.stage = 'knockout';
      s.groupFinal = st.map((r) => r.id);
    }
    if (s.stage === 'knockout') {
      // ユーザーが出ない方の試合はシミュレート
      const rng = makeRng(s.seed + 999);
      for (const f of s.fixtures) {
        if (f.stage === 'knockout' && !f.result && f.home !== this.user && f.away !== this.user) {
          const userPending = s.fixtures.some((q) => q.stage === 'knockout' && !q.result && (q.home === this.user || q.away === this.user));
          if (userPending || f.id === 'third' || f.id === 'final') f.result = Tournament.simulate(f, rng);
        }
      }
      if (s.fixtures.filter((f) => f.stage === 'knockout').every((f) => f.result)) {
        const fin = s.fixtures.find((f) => f.id === 'final');
        s.champion = Tournament.winner(fin);
        s.stage = 'done';
        s.finished = true;
      }
    }
  }

  static winner(f) {
    const r = f.result;
    if (r.h !== r.a) return r.h > r.a ? f.home : f.away;
    return r.pk.h > r.pk.a ? f.home : f.away;
  }

  /** 最終順位（ユーザーの成績表示用） */
  finalPlace(id) {
    const s = this.s;
    if (!s.finished) return null;
    const fin = s.fixtures.find((f) => f.id === 'final');
    const third = s.fixtures.find((f) => f.id === 'third');
    if (Tournament.winner(fin) === id) return 1;
    if (fin.home === id || fin.away === id) return 2;
    if (Tournament.winner(third) === id) return 3;
    return 4;
  }
}
