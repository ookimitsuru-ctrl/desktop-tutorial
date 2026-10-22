import { h, tap, icon, ICONS } from './dom.js';
import { flagImg } from './flags.js';
import { TEAMS, teamById } from '../data/teams.js';
import { FORMATIONS } from '../data/formations.js';
import { roundName } from '../game/tournament.js';
import { VENUES } from '../game/settings.js';

// メニュー画面群

const STYLE_TEXT = {
  JPN: '素早いパスワークと技術で崩す。中盤の質は大会屈指。',
  VAL: '堅守と強力なストライカー。総合力No.1の優勝候補。',
  SOL: '圧倒的な個の打開力。ドリブルとサイド攻撃が武器。',
  NDG: '長身選手を揃えた屈強なチーム。空中戦とロングボール。',
};

function btn(label, cls, onTap) {
  return tap(h(`div.btn${cls ? `.${cls}` : ''}`, {}, h('span', {}, label)), onTap);
}

function topbar(title, en, onBack) {
  return h(
    'div.topbar',
    {},
    onBack ? tap(h('div.back', {}, icon('back')), onBack) : null,
    h('div.ttl', {}, title, en ? h('small', {}, en) : null),
  );
}

export function loadingScreen() {
  return h(
    'div.loading',
    {},
    h('div', { style: { textAlign: 'center' } }, h('div', { style: { width: '64px', margin: '0 auto' }, html: ICONS.crest }), h('div.bar', {}, h('i'))),
  );
}

export function titleScreen(onStart) {
  const el = h(
    'div.screen.title-screen',
    {},
    h('div.vignette'),
    h(
      'div.logo',
      {},
      h('div.crest', { html: ICONS.crest }),
      h('div.main', {}, 'WORLD STRIKERS'),
      h('div.sub', { html: '<b>ワールドカップ</b> 2026' }),
    ),
    h('div.tap', {}, 'タップしてスタート'),
    h('div.title-foot', {}, '架空の4か国によるサッカー大会'),
  );
  tap(el, onStart);
  return el;
}

export function mainMenu({ hasSave, onWorldCup, onContinue, onFriendly, onSettings, onHowTo }) {
  const items = [];
  if (hasSave) items.push(['primary', 'trophy', '大会を続ける', 'CONTINUE', onContinue]);
  items.push([hasSave ? '' : 'primary', 'trophy', 'ワールドカップ', 'WORLD CUP', onWorldCup]);
  items.push(['', 'ball', 'フレンドリーマッチ', 'FRIENDLY', onFriendly]);
  items.push(['', 'book', '遊び方', 'HOW TO PLAY', onHowTo]);
  items.push(['', 'gear', '設定', 'SETTINGS', onSettings]);
  return h(
    'div.screen.menu-screen',
    {},
    h('div.shade-left'),
    h(
      'div.menu-left',
      {},
      h('div.menu-head', {}, h('div.small', {}, 'WORLD STRIKERS'), h('div.ja', {}, 'メインメニュー')),
      items.map(([cls, ic, ja, en, fn], i) =>
        tap(h(`div.mbtn${cls ? `.${cls}` : ''}`, { style: { animationDelay: `${0.05 + i * 0.06}s` } }, icon(ic), h('span', {}, ja), h('span.en', {}, en)), fn),
      ),
    ),
  );
}

function teamCard(t, selected, delay) {
  const pct = (v) => `${Math.max(5, Math.min(100, ((v - 60) / 35) * 100))}%`;
  const stat = (lab, v) => h('div.stat', {}, h('span', {}, lab), h('div.bar', {}, h('i', { style: { width: pct(v) } })), h('span.v', {}, v));
  return h(
    `div.tcard${selected ? '.sel' : ''}`,
    { style: { animationDelay: `${delay}s` } },
    h('div.stripe', { style: { background: `linear-gradient(90deg, ${t.kits.home.shirt}, ${t.kits.home.shirt2})` } }),
    h('div.ovr', {}, t.ovr, h('small', {}, 'OVR')),
    flagImg(t),
    h('div.name', {}, t.name),
    h('div.en', {}, t.nameEn),
    h('div.stats3', {}, stat('攻撃', t.att), stat('中盤', t.mid), stat('守備', t.def)),
    h('div.style', {}, STYLE_TEXT[t.id] || ''),
    h('div.star', {}, '注目選手', h('b', {}, `${t.star.num} ${t.star.name}`)),
  );
}

export function teamSelect({ title = 'チーム選択', en = 'SELECT YOUR TEAM', initial = 'JPN', exclude = null, onPick, onBack, okLabel = '決定' }) {
  let sel = initial;
  const row = h('div.team-row');
  const render = () => {
    row.innerHTML = '';
    TEAMS.forEach((t, i) => {
      const card = teamCard(t, t.id === sel, i * 0.06);
      if (t.id === exclude) {
        card.style.opacity = '0.35';
        card.style.pointerEvents = 'none';
      }
      tap(card, () => {
        sel = t.id;
        render();
      });
      row.append(card);
    });
  };
  render();
  return h(
    'div.screen.select-screen',
    {},
    h('div.shade-full'),
    topbar(title, en, onBack),
    row,
    h('div.bottombar', {}, h('div.hint', {}, 'チームをタップして選択'), btn(okLabel, 'primary', () => onPick(sel))),
  );
}

export function venueSelect({ onPick, onBack }) {
  let sel = 0;
  let weather = 'clear';
  const list = h('div.team-row');
  const presetName = { day: 'デイゲーム', sunset: 'サンセット', night: 'ナイトゲーム' };
  const render = () => {
    list.innerHTML = '';
    VENUES.forEach((v, i) => {
      const card = h(
        `div.tcard${i === sel ? '.sel' : ''}`,
        { style: { animationDelay: `${i * 0.06}s`, justifyContent: 'center', padding: '12px' } },
        h('div.name', {}, v.name),
        h('div.en', {}, v.city),
        h('div', { style: { textAlign: 'center', marginTop: '12px', fontSize: '13px', color: '#ffd84a', fontWeight: 800 } }, presetName[v.preset]),
        h('div', { style: { textAlign: 'center', marginTop: '6px', fontSize: '12px', color: '#9fb0d8' } }, `収容 ${v.cap}人`),
      );
      tap(card, () => {
        sel = i;
        render();
      });
      list.append(card);
    });
  };
  render();
  const seg = h('div.seg', { style: { marginLeft: '0', marginRight: 'auto' } });
  const renderSeg = () => {
    seg.innerHTML = '';
    for (const [v, t] of [
      ['clear', '晴れ'],
      ['rain', '雨'],
    ]) {
      const b = h(`button${weather === v ? '.on' : ''}`, {}, h('span', { style: { display: 'inline-block', transform: 'skewX(12deg)' } }, t));
      tap(b, () => {
        weather = v;
        renderSeg();
      });
      seg.append(b);
    }
  };
  renderSeg();
  return h(
    'div.screen.select-screen',
    {},
    h('div.shade-full'),
    topbar('スタジアム選択', 'VENUE', onBack),
    list,
    h('div.bottombar', {}, h('span', { style: { fontSize: '12px', color: '#9fb0d8', fontWeight: 800 } }, '天候'), seg, btn('キックオフ', 'primary', () => onPick(sel, weather))),
  );
}

function standingsTable(tour) {
  const rows = tour.standings();
  return h(
    'table.standings',
    {},
    h('tr', {}, h('th', {}, ''), h('th', { style: { textAlign: 'left' } }, 'チーム'), ...['試', '勝', '分', '負', '得', '失', '差', '点'].map((x) => h('th', {}, x))),
    rows.map((r, i) =>
      h(
        `tr${r.id === tour.user ? '.me' : ''}${i < 2 ? '.q' : ''}`,
        {},
        h('td', {}, i + 1),
        h('td.tm', {}, flagImg(r.team, 'mini-flag'), r.team.name),
        h('td', {}, r.P),
        h('td', {}, r.W),
        h('td', {}, r.D),
        h('td', {}, r.L),
        h('td', {}, r.GF),
        h('td', {}, r.GA),
        h('td', {}, r.GD > 0 ? `+${r.GD}` : r.GD),
        h('td.pts', {}, r.Pts),
      ),
    ),
  );
}

function fixtureRow(f, user) {
  const ht = teamById(f.home);
  const at = teamById(f.away);
  const me = f.home === user || f.away === user;
  const sc = f.result ? `${f.result.h} - ${f.result.a}${f.result.pk ? ` (PK${f.result.pk.h}-${f.result.pk.a})` : ''}` : 'vs';
  return h(
    `div.fixture${me ? '.me' : ''}`,
    {},
    h('div.h', {}, ht.name, ' ', flagImg(ht, 'mini-flag')),
    h('div.sc', { style: f.result?.pk ? { fontSize: '14px' } : {} }, sc),
    h('div', {}, flagImg(at, 'mini-flag'), ' ', at.name),
  );
}

export function hub({ tour, onPlay, onBack, onAbandon }) {
  const next = tour.nextUserFixture();
  const left = h('div.box.panel', {}, h('h3', {}, 'グループ順位', h('small', {}, '上位2チームが決勝へ')), standingsTable(tour));
  const fx = h('div.box.panel', { style: { animationDelay: '0.08s', overflowY: 'auto' } }, h('h3', {}, '試合日程'));
  const rounds = [1, 2, 3, 'third', 'final'];
  for (const r of rounds) {
    const list = tour.fixtures.filter((f) => f.round === r);
    if (!list.length) continue;
    fx.append(h('div', { style: { fontSize: '10px', color: '#9fb0d8', letterSpacing: '0.2em', margin: '6px 0 2px' } }, roundName(r)));
    for (const f of list) fx.append(fixtureRow(f, tour.user));
  }
  let bottom;
  if (next) {
    const opp = teamById(next.home === tour.user ? next.away : next.home);
    const me = teamById(tour.user);
    const venue = VENUES[next.venue];
    left.append(
      h(
        'div',
        { style: { marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' } },
        h('h3', {}, '次の試合', h('small', {}, roundName(next.round))),
        h('div.next-card', {}, h('div.side', {}, flagImg(me), h('div', {}, me.name)), h('div.vs', {}, 'VS'), h('div.side', {}, flagImg(opp), h('div', {}, opp.name))),
        h('div.venue', { html: `<b>${venue.name}</b>（${venue.city}）` }),
      ),
    );
    bottom = h('div.bottombar', {}, tap(h('div.hint', { style: { cursor: 'pointer' } }, '大会を破棄'), onAbandon), btn('試合へ', 'primary', () => onPlay(next)));
  } else {
    bottom = h('div.bottombar', {}, btn('メニューへ', 'primary', onBack));
  }
  return h('div.screen', {}, h('div.shade-full'), topbar('ワールドカップ', 'WORLD CUP 2026', onBack), h('div.hub', {}, left, fx), bottom);
}

export function lineup({ team, opp, fixtureLabel, venue, kit, weather, onKickoff, onBack }) {
  const form = FORMATIONS[team.formation];
  const pitch = h('div.mini-pitch.panel');
  team.players.forEach((p, i) => {
    const s = form[i];
    const x = 50 + s.x * 46;
    const y = 50 + s.z * 44;
    pitch.append(
      h(
        'div.dot',
        { style: { left: `${x}%`, top: `${y}%` } },
        h('i', { style: { background: i === 0 ? team.kits.gk.shirt : kit.shirt, color: i === 0 ? '#111' : kit.shirt2 === '#ffffff' ? '#fff' : '#fff' } }, p.num),
        p.short,
      ),
    );
  });
  const roster = h('div.roster');
  for (const p of team.players) roster.append(h('div', {}, h('span.n', {}, p.num), h('span.p', {}, p.pos), h('span', {}, p.name), h('span.o', {}, p.ovr)));
  const right = h(
    'div.box.panel',
    { style: { overflowY: 'auto' } },
    h('h3', {}, `${team.name} スタメン`, h('small', {}, `${team.formation}`)),
    roster,
    h('div', { style: { marginTop: '8px', fontSize: '11px', color: '#9fb0d8' } }, '控え: ', team.bench.join('、')),
  );
  return h(
    'div.screen',
    {},
    h('div.shade-full'),
    topbar(`${team.name} vs ${opp.name}`, fixtureLabel, onBack),
    h('div.lineup', {}, pitch, right),
    h('div.bottombar', {}, h('div.hint', { html: `<b style="color:#fff">${venue.name}</b> ${venue.city}${weather === 'rain' ? '　<b style="color:#7fc4ff">雨</b>' : ''}` }), btn('キックオフ', 'primary', onKickoff)),
  );
}

export function settingsScreen({ settings, onChange, onBack }) {
  const s = settings;
  const rows = [
    ['試合時間', '前後半それぞれの長さ', 'halfMinutes', [[2, '2分'], [3, '3分'], [5, '5分'], [8, '8分']]],
    ['難易度', 'CPUの強さ', 'difficulty', [['easy', 'やさしい'], ['normal', 'ふつう'], ['hard', 'むずかしい']]],
    ['画質', '重い時は下げてください', 'quality', [['auto', '自動'], ['high', '高'], ['medium', '中'], ['low', '低']]],
    ['カメラ', 'ワイド＝ピッチ全体 / ズーム＝ボールを追う', 'camera', [['wide', 'ワイド'], ['zoom', 'ズーム']]],
    ['オフサイド', '', 'offside', [[true, 'あり'], [false, 'なし']]],
    ['操作選手の自動切替', 'ボールに近い選手へ自動で切替', 'autoSwitch', [[true, 'ON'], [false, 'OFF']]],
    ['ゴールリプレイ', '', 'replays', [[true, 'ON'], [false, 'OFF']]],
    ['効果音', '', 'sound', [[0, 'OFF'], [0.4, '小'], [0.8, '中'], [1, '大']]],
    ['BGM', '', 'music', [[0, 'OFF'], [0.3, '小'], [0.6, '中'], [1, '大']]],
    ['振動', '', 'haptics', [[true, 'ON'], [false, 'OFF']]],
  ];
  const box = h('div.settings.panel');
  const render = () => {
    box.innerHTML = '';
    for (const [lbl, sub, key, opts] of rows) {
      const seg = h('div.seg');
      for (const [v, t] of opts) {
        const b = h(`button${s[key] === v ? '.on' : ''}`, {}, h('span', { style: { display: 'inline-block', transform: 'skewX(12deg)' } }, t));
        tap(b, () => {
          s[key] = v;
          onChange(s, key);
          render();
        });
        seg.append(b);
      }
      box.append(h('div.setrow', {}, h('div.lbl', {}, lbl, sub ? h('small', {}, sub) : null), seg));
    }
  };
  render();
  return h('div.screen', {}, h('div.shade-full'), topbar('設定', 'SETTINGS', onBack), box);
}

export function howToContent() {
  const dl = (rows) => h('dl', {}, rows.map(([a, b]) => [h('dt', {}, a), h('dd', {}, b)]));
  return h(
    'div.howto',
    {},
    h(
      'div',
      {},
      h('h4', {}, '攻撃（ボールを持っている時）'),
      dl([
        ['スティック', '選手を動かす / パスやシュートの方向'],
        ['パス', 'スティックの方向にいる味方へ足元のパス'],
        ['スルー', '味方の走り込む先（裏のスペース）へパス'],
        ['ロブ', '浮き球のパス。サイドからはクロス'],
        ['シュート', '長押しで強さを溜めて離すとシュート。スティックで左右を狙う'],
        ['ダッシュ', '押している間スプリント（スタミナを消費）'],
      ]),
    ),
    h(
      'div',
      {},
      h('h4', {}, '守備（相手ボールの時）'),
      dl([
        ['切替', 'ボールに近い味方に操作を切り替える'],
        ['プレス', '近くの相手からボールを奪いにいく'],
        ['スライディング', '滑り込んでボールを奪う（後ろからはファウルに注意）'],
        ['体を寄せる', '相手に向かってスティックを倒すと自動で奪いにいく'],
      ]),
      h('h4', { style: { marginTop: '8px' } }, 'ルール'),
      dl([
        ['大会', '4チームの総当たり → 上位2チームで決勝、3・4位で3位決定戦'],
        ['勝ち点', '勝ち3・引き分け1。決勝・3位決定戦の同点はPK戦'],
        ['キーボード', 'WASD/矢印=移動 J=パス K=シュート L=スルー I=ロブ Shift=ダッシュ'],
      ]),
    ),
  );
}

export function dialog(title, en, content, actions, wide = false) {
  return h(
    'div.overlay',
    {},
    h(`div.dialog.panel${wide ? '.wide' : ''}`, {}, h('h2', {}, title, en ? h('small', {}, en) : null), h('div.dlg-body', {}, content), h('div.dlg-actions', {}, actions)),
  );
}

/** スコア（左）とスタッツ（右）の2カラム */
export function resultContent(match, pk = null) {
  return h('div.result2', {}, scoreHeader(match, pk), statsBlock(match));
}

export function statsBlock(match) {
  const [a, b] = match.teams;
  const pa = a.stats.possession / Math.max(1e-6, a.stats.possession + b.stats.possession);
  const pct = (x, y) => `${Math.round(x)}%`;
  const line = (lab, va, vb, fa, fb) => {
    const tot = fa + fb || 1;
    return h(
      'div.statline',
      {},
      h('span', {}, va),
      h('div.lab', {}, lab, h('div.dual', {}, h('i', { style: { width: `${(fa / tot) * 100}%`, background: a.kit.shirt === '#f4f5f7' ? '#cfd8ea' : a.kit.shirt } }), h('i', { style: { width: `${(fb / tot) * 100}%`, background: b.kit.shirt } }))),
      h('span.r', {}, vb),
    );
  };
  const passA = a.stats.passes ? Math.round((a.stats.passesOk / a.stats.passes) * 100) : 0;
  const passB = b.stats.passes ? Math.round((b.stats.passesOk / b.stats.passes) * 100) : 0;
  return h(
    'div.statgrid',
    {},
    line('ボール支配率', pct(pa * 100), pct((1 - pa) * 100), pa, 1 - pa),
    line('シュート', a.stats.shots, b.stats.shots, a.stats.shots, b.stats.shots),
    line('枠内シュート', a.stats.onTarget, b.stats.onTarget, a.stats.onTarget, b.stats.onTarget),
    line('パス成功率', `${passA}%`, `${passB}%`, passA, passB),
    line('コーナーキック', a.stats.corners, b.stats.corners, a.stats.corners, b.stats.corners),
    line('ファウル', a.stats.fouls, b.stats.fouls, a.stats.fouls, b.stats.fouls),
    line('オフサイド', a.stats.offsides, b.stats.offsides, a.stats.offsides, b.stats.offsides),
    line('セーブ', a.stats.saves, b.stats.saves, a.stats.saves, b.stats.saves),
  );
}

export function scoreHeader(match, pk = null) {
  const [a, b] = match.teams;
  const scorers = (ti) =>
    match.goalsLog
      .filter((g) => g.team === ti)
      .map((g) => `${g.ownGoal ? 'OG ' : ''}${g.scorer ? g.scorer.name : ''} ${g.minute + 1}'`)
      .join('\n');
  return h(
    'div',
    {},
    h(
      'div.final-score',
      {},
      h('div.tn', {}, flagImg(a.data), a.data.name),
      h('div', {}, h('div.sc', {}, `${a.score} - ${b.score}`), pk ? h('div.pk', {}, `PK ${pk.h} - ${pk.a}`) : null),
      h('div.tn', {}, flagImg(b.data), b.data.name),
    ),
    h('div.scorers', {}, h('div', { style: { whiteSpace: 'pre-line' } }, scorers(0)), h('div.r', { style: { whiteSpace: 'pre-line' } }, scorers(1))),
  );
}

export function championScreen(team, onNext) {
  return h(
    'div.screen.champion',
    {},
    h(
      'div.row',
      {},
      h('div', {}, h('div.big', {}, 'CHAMPIONS'), h('div.jp', {}, `${team.name} ワールドカップ優勝！`)),
      h('div', { style: { animation: 'rise .5s 1.4s ease both' } }, btn('次へ', 'primary', onNext)),
    ),
  );
}
